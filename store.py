"""Persistente opslag van credentials en hosts in een JSON-bestand (chmod 600)."""
import ipaddress
import json
import os
import threading
import time
import uuid

CRED_FIELDS = ('label', 'domain', 'username', 'password', 'nthash')
# Velden van een scanresultaat die per credential worden bewaard (hosts[ip]['results'][cred_id]).
RESULT_FIELDS = ('status', 'error', 'shares', 'share_error', 'guest', 'scanned_at')


def host_sort_key(name):
    try:
        return (0, int(ipaddress.ip_address(name)))
    except ValueError:
        return (1, name)


class Store:
    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        self.credentials = []
        self.hosts = {}
        self._last_save = 0
        # Elke wijziging aan een host krijgt een oplopend revisienummer, zodat de frontend alleen
        # wijzigingen hoeft op te halen. Na verwijderingen moet een client alles opnieuw laden.
        self.rev = 0
        self.reset_rev = 0
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            self.credentials = data.get('credentials', [])
            self.hosts = data.get('hosts', {})
        for h in self.hosts.values():
            if h.get('status') == 'queued':
                h['status'] = h.get('prev_status') or 'pending'
            # Oudere opslag kende één resultaat per host; zet dat om naar een resultaat per credential.
            if 'results' not in h and h.get('cred_id') and h.get('status') not in (None, 'pending'):
                h['results'] = {h['cred_id']: {k: h.get(k) for k in RESULT_FIELDS}}
        self.rev = self.reset_rev = max((h.get('_rev', 0) for h in self.hosts.values()), default=0)

    def save(self):
        with self.lock:
            os.makedirs(os.path.dirname(self.path) or '.', exist_ok=True)
            tmp = self.path + '.tmp'
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as f:
                json.dump({'credentials': self.credentials, 'hosts': self.hosts}, f)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.path)
            self._last_save = time.time()

    def save_throttled(self, interval=10):
        if time.time() - self._last_save > interval:
            self.save()

    def _touch(self, h):
        self.rev += 1
        h['_rev'] = self.rev

    def _reset(self):
        self.rev += 1
        self.reset_rev = self.rev

    # --- credentials ---------------------------------------------------

    @staticmethod
    def public_credential(c):
        return {
            'id': c['id'], 'label': c['label'], 'domain': c.get('domain', ''),
            'username': c.get('username', ''),
            'has_password': bool(c.get('password')), 'has_hash': bool(c.get('nthash')),
        }

    def list_credentials(self):
        with self.lock:
            return [self.public_credential(c) for c in self.credentials]

    def get_credential(self, cred_id):
        with self.lock:
            return next((dict(c) for c in self.credentials if c['id'] == cred_id), None)

    def add_credential(self, data):
        cred = {k: (data.get(k) or '').strip() if k != 'password' else (data.get(k) or '') for k in CRED_FIELDS}
        cred['label'] = cred['label'] or _default_label(cred)
        cred.update(id=uuid.uuid4().hex[:12], rev=1)
        with self.lock:
            self.credentials.append(cred)
            self.save()
        return self.public_credential(cred)

    def update_credential(self, cred_id, data):
        with self.lock:
            cred = next((c for c in self.credentials if c['id'] == cred_id), None)
            if not cred:
                return None
            for k in ('label', 'domain', 'username'):
                if k in data:
                    cred[k] = (data[k] or '').strip()
            # Lege secret-velden laten de opgeslagen waarde ongemoeid, tenzij expliciet gewist.
            if data.get('password'):
                cred['password'] = data['password']
                cred['nthash'] = '' if not data.get('nthash') else cred.get('nthash', '')
            if data.get('nthash'):
                cred['nthash'] = data['nthash'].strip()
            if data.get('clear_secrets'):
                cred['password'] = cred['nthash'] = ''
            cred['label'] = cred['label'] or _default_label(cred)
            cred['rev'] = cred.get('rev', 0) + 1
            self.save()
            return self.public_credential(cred)

    def delete_credential(self, cred_id):
        with self.lock:
            before = len(self.credentials)
            self.credentials = [c for c in self.credentials if c['id'] != cred_id]
            for h in self.hosts.values():
                h.get('results', {}).pop(cred_id, None)
            self._reset()
            self.save()
            return len(self.credentials) != before

    # --- hosts ---------------------------------------------------------

    def list_hosts(self):
        with self.lock:
            return [dict(h, ip=ip) for ip, h in sorted(self.hosts.items(), key=lambda kv: host_sort_key(kv[0]))]

    def hosts_since(self, since):
        """Alle hosts, of alleen de sinds revisie `since` gewijzigde als dat volstaat."""
        with self.lock:
            full = since is None or since < self.reset_rev
            if full:
                hosts = self.list_hosts()
            else:
                hosts = [dict(h, ip=ip) for ip, h in self.hosts.items() if h.get('_rev', 0) > since]
            return {'rev': self.rev, 'full': full, 'hosts': hosts}

    def has_host(self, ip):
        with self.lock:
            return ip in self.hosts

    def get_host(self, ip):
        with self.lock:
            h = self.hosts.get(ip)
            return dict(h, ip=ip) if h else None

    def add_hosts(self, ips):
        added = 0
        with self.lock:
            for ip in ips:
                if ip not in self.hosts:
                    self.hosts[ip] = {'status': 'pending', 'added_at': time.time()}
                    self._touch(self.hosts[ip])
                    added += 1
            self.save()
        return added

    def update_host(self, ip, fields):
        with self.lock:
            h = self.hosts.setdefault(ip, {'added_at': time.time()})
            h.update(fields)
            self._touch(h)
            if fields.get('cred_id'):
                result = h.setdefault('results', {}).setdefault(fields['cred_id'], {})
                result.update({k: v for k, v in fields.items() if k in RESULT_FIELDS})
            self.save_throttled()

    def mark_queued(self, ips):
        """Markeer bestaande hosts als 'in wachtrij'. Nieuwe IP's worden pas opgeslagen als ze reageren."""
        with self.lock:
            for ip in ips:
                h = self.hosts.get(ip)
                if h and h.get('status') != 'queued':
                    h['prev_status'] = h.get('status')
                    h['status'] = 'queued'
                    self._touch(h)

    def unqueue(self, ips):
        with self.lock:
            for ip in ips:
                h = self.hosts.get(ip)
                if h and h.get('status') == 'queued':
                    h['status'] = h.get('prev_status') or 'pending'
                    self._touch(h)
            self.save_throttled()

    def delete_hosts(self, ips=None, status=None):
        with self.lock:
            if ips is None and status is None:
                n = len(self.hosts)
                self.hosts = {}
            else:
                doomed = [ip for ip, h in self.hosts.items()
                          if (ips is not None and ip in ips) or (status is not None and h.get('status') in status)]
                for ip in doomed:
                    del self.hosts[ip]
                n = len(doomed)
            self._reset()
            self.save()
            return n


def _default_label(cred):
    user = cred.get('username')
    if not user:
        return 'Anoniem (null session)'
    return f"{cred['domain']}\\{user}" if cred.get('domain') else user
