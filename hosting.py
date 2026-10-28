"""SMBserver95 — host een eenvoudige SMB-share om bestanden te delen."""
import json
import logging
import os
import re
import shutil
import socket
import threading
import time

try:
    from impacket.smbserver import SimpleSMBServer
    try:
        from impacket.ntlm import compute_nthash as _nthash
    except ImportError:
        _nthash = None
    _HAS_IMPACKET = True
except ImportError:
    _HAS_IMPACKET = False
    _nthash = None


class HostingError(Exception):
    pass


def local_interfaces():
    """Geeft lijst van {ip, name} voor alle niet-loopback IPv4-interfaces."""
    import ipaddress
    result = []
    try:
        import netifaces
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for a in addrs:
                ip = a.get('addr', '')
                try:
                    if not ipaddress.ip_address(ip).is_loopback:
                        result.append({'ip': ip, 'name': iface})
                except ValueError:
                    pass
    except ImportError:
        # Fallback: verbind naar een extern adres (geen echt verkeer) om het lokale IP te achterhalen
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
            s.close()
            result.append({'ip': ip, 'name': ''})
        except Exception:
            pass
    return result


def _local_ips_str():
    ips = [i['ip'] for i in local_interfaces()]
    return ', '.join(ips) if ips else '<IP>'


_SAFE = re.compile(r'^[^/\\:*?"<>|\x00-\x1f]+$')
_SHARE = re.compile(r'^[A-Z0-9_$-]{1,12}$')
# JtR/Responder NTLMv1/v2 hash format: user::domain:part1:part2:part3
_JTR_RE = re.compile(r'^([^:]+)::([^:]*):'
                     r'([0-9a-fA-F]+):([0-9a-fA-F]{32,}):([0-9a-fA-F]+)$')
# impacket logt verbindingen als: "Incoming connection (IP,poort)"
_CONN_RE = re.compile(r'Incoming connection \(([0-9.]+),(\d+)\)')
# Dialect na SMB2-onderhandeling: "Dialect used: 0x..."
_DIALECT_RE = re.compile(r'[Dd]ialect.*?0x([0-9A-Fa-f]+)')
_DIALECT_NAMES = {
    '202': 'SMB 2.0.2', '210': 'SMB 2.1', '300': 'SMB 3.0',
    '302': 'SMB 3.0.2', '311': 'SMB 3.1.1',
}


class _HashCaptureHandler(logging.Handler):
    """Onderschept impacket-logberichten: NTLM hashes én verbindingsgebeurtenissen."""

    def __init__(self, hash_cb, conn_cb):
        super().__init__()
        self._hash_cb = hash_cb
        self._conn_cb = conn_cb

    def emit(self, record):
        try:
            msg = record.getMessage()
            m = _JTR_RE.match(msg)
            if m:
                user, domain, part1, part2, part3 = m.groups()
                ntlm_type = 'NTLMv2' if len(part3) > 32 else 'NTLMv1'
                self._hash_cb({
                    'user': user,
                    'domain': domain,
                    'type': ntlm_type,
                    'hash_preview': part2[:16] + '…',
                    'full_hash': msg,
                })
                return
            mc = _CONN_RE.search(msg)
            if mc:
                self._conn_cb({'ip': mc.group(1), 'port': int(mc.group(2)), 'dialect': None})
                return
            md = _DIALECT_RE.search(msg)
            if md:
                hex_val = md.group(1).lstrip('0') or '0'
                dialect = _DIALECT_NAMES.get(hex_val, f'0x{md.group(1)}')
                self._conn_cb({'dialect_update': dialect})
        except Exception:
            pass


class HostedServer:
    """Beheert een lokale directory die via SMB gedeeld kan worden."""

    MAX_LOG = 300

    def __init__(self, config_path):
        self._cfg_path = config_path
        self._root = os.path.join(os.path.dirname(os.path.abspath(config_path)), 'smbshare')
        self._lock = threading.Lock()
        self._server = None
        self._thread = None
        self._cfg = {}
        self._log = []
        self._seq = 0
        self._hashes = []
        self._hash_seq = 0
        self._hash_handler = None
        self._conns = []
        self._conn_seq = 0
        os.makedirs(self._root, exist_ok=True)
        try:
            with open(self._cfg_path) as f:
                self._cfg = json.load(f)
        except (OSError, ValueError):
            pass

    def _save(self):
        try:
            with open(self._cfg_path, 'w') as f:
                json.dump(self._cfg, f, indent=2)
        except OSError:
            pass

    def _log_add(self, msg):
        with self._lock:
            self._seq += 1
            self._log.append({'seq': self._seq, 'ts': time.time(), 'msg': msg})
            if len(self._log) > self.MAX_LOG:
                self._log = self._log[-self.MAX_LOG:]

    def _capture_hash(self, data):
        with self._lock:
            self._hash_seq += 1
            self._hashes.append({'seq': self._hash_seq, 'ts': time.time(), **data})
            if len(self._hashes) > 1000:
                self._hashes = self._hashes[-1000:]

    def clear_hashes(self):
        with self._lock:
            self._hashes = []
            self._hash_seq = 0

    def _capture_conn(self, data):
        with self._lock:
            if 'dialect_update' in data:
                # koppel dialect aan de meest recente verbinding
                if self._conns:
                    self._conns[-1]['dialect'] = data['dialect_update']
                return
            self._conn_seq += 1
            self._conns.append({'seq': self._conn_seq, 'ts': time.time(), **data})
            if len(self._conns) > 500:
                self._conns = self._conns[-500:]

    def clear_conns(self):
        with self._lock:
            self._conns = []
            self._conn_seq = 0

    def status(self, since=0):
        with self._lock:
            alive = bool(self._thread and self._thread.is_alive())
            log = [e for e in self._log if e['seq'] > since]
            return {
                'running': alive,
                'cfg': {**self._cfg, 'password': bool(self._cfg.get('password'))},
                'root': self._root,
                'log': log,
                'log_seq': self._seq,
                'hashes': list(self._hashes),
                'hash_seq': self._hash_seq,
                'conns': list(self._conns),
                'conn_seq': self._conn_seq,
                'has_impacket': _HAS_IMPACKET,
            }

    def start(self, data):
        if not _HAS_IMPACKET:
            raise HostingError('impacket is niet geïnstalleerd — voer requirements.txt opnieuw uit')
        with self._lock:
            if self._thread and self._thread.is_alive():
                raise HostingError('Server draait al; stop hem eerst')

        share = (data.get('share') or 'SHARE').strip().upper()
        port = int(data.get('port') or 4445)
        password = (data.get('password') or '').strip()
        listen = (data.get('listen') or '0.0.0.0').strip() or '0.0.0.0'
        smb2 = bool(data.get('smb2', True))

        if not _SHARE.match(share):
            raise HostingError(f'Ongeldige sharenaam "{share}": alleen A-Z, 0-9, _, $, - (max 12 tekens)')
        if not 1 <= port <= 65535:
            raise HostingError(f'Ongeldige poort: {port}')

        self._cfg = {'share': share, 'port': port, 'password': password, 'listen': listen, 'smb2': smb2}
        self._save()

        server = SimpleSMBServer(listenAddress=listen, listenPort=port)
        server.addShare(share, self._root, 'SMBserver95')
        server.setSMB2Support(smb2)
        if password and _nthash:
            nt = _nthash(password)
            server.addCredential('smb', 0, b'', nt)
        try:
            server.setLogFile('/dev/null')
        except Exception:
            pass

        self._server = server
        display_addr = listen if listen != '0.0.0.0' else _local_ips_str()

        # Koppel hash capture handler aan de impacket logger
        if self._hash_handler:
            logging.getLogger('impacket.smbserver').removeHandler(self._hash_handler)
        handler = _HashCaptureHandler(self._capture_hash, self._capture_conn)
        self._hash_handler = handler
        logging.getLogger('impacket.smbserver').addHandler(handler)

        def _run():
            try:
                self._log_add(
                    f'Gestart op poort {port} · \\\\{display_addr}\\{share}'
                    + (' · gebruiker: smb + wachtwoord' if password else ' · anoniem')
                )
                server.start()
            except Exception as e:
                self._log_add(f'Fout: {e}')
            finally:
                with self._lock:
                    if self._server is server:
                        self._server = None
                self._log_add('Server gestopt')

        self._thread = threading.Thread(target=_run, daemon=True, name='smb-hosting')
        self._thread.start()
        time.sleep(0.4)
        return self.status()

    def stop(self):
        with self._lock:
            s, self._server = self._server, None
        if s:
            try:
                # shutdown() signals serve_forever() to exit; stop() only closes the socket
                s.getServer().shutdown()
            except Exception:
                pass
            try:
                s.stop()
            except Exception:
                pass
        if self._thread:
            self._thread.join(timeout=3.0)
        if self._hash_handler:
            logging.getLogger('impacket.smbserver').removeHandler(self._hash_handler)
            self._hash_handler = None
        return self.status()

    def _path(self, rel):
        """Veilig absoluut pad binnen root, of HostingError."""
        parts = [p for p in str(rel or '').replace('\\', '/').split('/') if p and p not in ('.', '..')]
        full = os.path.join(self._root, *parts) if parts else self._root
        norm = os.path.normpath(full)
        if norm != self._root and not norm.startswith(self._root + os.sep):
            raise HostingError('Ongeldig pad')
        return norm

    def list_files(self, path):
        d = self._path(path)
        if not os.path.isdir(d):
            raise HostingError('Map niet gevonden')
        out = []
        for name in sorted(os.listdir(d), key=str.lower):
            fp = os.path.join(d, name)
            try:
                st = os.stat(fp)
            except OSError:
                continue
            isdir = os.path.isdir(fp)
            out.append({'name': name, 'dir': isdir,
                        'size': None if isdir else st.st_size,
                        'mtime': int(st.st_mtime)})
        return out

    def save_upload(self, path, filename, stream):
        name = os.path.basename(filename)
        if not name or not _SAFE.match(name):
            raise HostingError(f'Ongeldige naam: {name}')
        dest = os.path.join(self._path(path), name)
        size = 0
        with open(dest, 'wb') as f:
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)
        self._log_add(f'Upload: {name} ({size} bytes)')
        return size

    def mkdir(self, path, name):
        if not name or not _SAFE.match(name):
            raise HostingError(f'Ongeldige naam: {name}')
        dest = os.path.join(self._path(path), name)
        if os.path.exists(dest):
            raise HostingError('Bestaat al')
        os.makedirs(dest)

    def delete(self, path):
        target = self._path(path)
        if target == self._root:
            raise HostingError('Root-map kan niet worden verwijderd')
        if not os.path.exists(target):
            raise HostingError('Niet gevonden')
        if os.path.isdir(target):
            shutil.rmtree(target)
        else:
            os.remove(target)
        self._log_add(f'Verwijderd: {os.path.relpath(target, self._root)}')

    def file_path(self, path):
        full = self._path(path)
        if not os.path.isfile(full):
            raise HostingError('Bestand niet gevonden')
        return full
