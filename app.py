#!/usr/bin/env python3
"""SMBrowser95 — webinterface om SMB-shares op meerdere hosts te scannen en te doorbladeren."""
import argparse
import io
import json
import mimetypes
import os
import secrets
import sys
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_file, send_from_directory

import hosting
import smb
from store import Store
from targets import parse_targets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PREVIEW_LIMIT = 512 * 1024
HEX_LIMIT = 4096
INLINE_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/x-icon',
                'image/vnd.microsoft.icon'}

SWEEP_THREADS = 256  # gelijktijdige poortchecks; die zijn goedkoop, de SMB-logins niet

app = Flask(__name__, static_folder=None)
store = None
pool = smb.ConnectionPool()
server = None  # eigen SMB-server (hosting.HostedServer), aangemaakt in main()
auth_password = None
notes = {}
notes_path = None


def _load_notes():
    global notes
    if notes_path and os.path.exists(notes_path):
        try:
            with open(notes_path) as f:
                notes = json.load(f)
        except Exception:
            notes = {}


def _save_notes():
    if not notes_path:
        return
    try:
        tmp = notes_path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(notes, f, indent=2, ensure_ascii=False)
        os.replace(tmp, notes_path)
    except Exception:
        pass


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


@app.errorhandler(ApiError)
def _api_error(e):
    return jsonify(status='error', message=e.message), e.status


def ok(data=None):
    return jsonify(status='ok', data=data)


@app.before_request
def _guard():
    if auth_password:
        auth = request.authorization
        given = (auth.password if auth else '') or ''
        if not secrets.compare_digest(given.encode(), auth_password.encode()):
            return Response('Authenticatie vereist', 401, {'WWW-Authenticate': 'Basic realm="SMBrowser95"'})
    # Custom header kan niet cross-origin zonder CORS-preflight: simpele CSRF-bescherming.
    if request.method not in ('GET', 'HEAD') and request.headers.get('X-SMBB') != '1':
        return jsonify(status='error', message='Ontbrekende X-SMBB header'), 403


@app.after_request
def _headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('Referrer-Policy', 'no-referrer')
    resp.headers.setdefault('X-Frame-Options', 'DENY')
    return resp


# --- statische frontend -------------------------------------------------

@app.get('/')
def index():
    return send_from_directory(os.path.join(BASE_DIR, 'static'), 'index.html')


@app.get('/static/<path:name>')
def static_files(name):
    return send_from_directory(os.path.join(BASE_DIR, 'static'), name)


# --- state / credentials ------------------------------------------------

@app.get('/api/state')
def state():
    return ok({'credentials': store.list_credentials(), 'hosts': store.hosts_since(None), 'job': scanner.view()})


@app.get('/api/hosts')
def hosts():
    since = request.args.get('since', type=int)
    return ok(store.hosts_since(since))


@app.post('/api/credentials')
def create_credential():
    data = request.get_json(force=True) or {}
    return ok(store.add_credential(data))


@app.put('/api/credentials/<cred_id>')
def update_credential(cred_id):
    cred = store.update_credential(cred_id, request.get_json(force=True) or {})
    if not cred:
        raise ApiError('Credential niet gevonden', 404)
    pool.drop_credential(cred_id)
    return ok(cred)


@app.delete('/api/credentials/<cred_id>')
def delete_credential(cred_id):
    if not store.delete_credential(cred_id):
        raise ApiError('Credential niet gevonden', 404)
    pool.drop_credential(cred_id)
    return ok()


# --- targets & scannen --------------------------------------------------

@app.post('/api/targets/parse')
def targets_parse():
    ips, errors = parse_targets((request.get_json(force=True) or {}).get('text', ''))
    return ok({'count': len(ips), 'sample': ips[:8], 'errors': errors[:20]})


@app.post('/api/targets')
def targets_add():
    data = request.get_json(force=True) or {}
    ips, errors = parse_targets(data.get('text', ''))
    if not ips:
        raise ApiError('Geen geldige targets gevonden' + (f": {errors[0]}" if errors else ''))
    scan = bool(data.get('scan'))
    # Bij grote ranges is het meeste dicht; zonder keep_closed worden alleen reagerende hosts bewaard.
    keep_closed = bool(data.get('keep_closed')) or not scan
    cred = require_credential(data.get('cred_id')) if scan else None
    # Namen (bijv. het domein) zijn bewust ingetypt: altijd bewaren en tonen, ook als ze niet reageren.
    added = store.add_hosts(ips if keep_closed else [t for t in ips if not smb.is_ip(t)])
    job = scanner.submit(ips, cred, data.get('threads'), keep_closed) if scan else None
    return ok({'added': added, 'total': len(ips), 'errors': errors, 'job': job, 'keep_closed': keep_closed})


@app.delete('/api/hosts')
def hosts_delete():
    status = request.args.get('status')
    if not status:
        scanner.cancel()  # schoon beginnen: anders vult de lopende scan de lijst weer aan
    n = store.delete_hosts(status=set(status.split(',')) if status else None)
    return ok({'deleted': n})


@app.post('/api/hosts/delete')
def hosts_delete_many():
    ips = (request.get_json(force=True) or {}).get('ips') or []
    return ok({'deleted': store.delete_hosts(ips=set(ips))})


@app.delete('/api/hosts/<path:ip>')
def host_delete(ip):
    return ok({'deleted': store.delete_hosts(ips={ip})})


SCAN_SCOPES = {
    'all': lambda h: True,
    'pending': lambda h: h.get('status') == 'pending',
    'ok': lambda h: h.get('status') == 'ok',
    'failed': lambda h: h.get('status') in ('auth_failed', 'error'),
    'reachable': lambda h: h.get('status') in ('ok', 'auth_failed', 'error'),
}


@app.post('/api/scan')
def scan():
    data = request.get_json(force=True) or {}
    cred = require_credential(data.get('cred_id'))
    ips = data.get('ips')
    if not ips:
        pick = SCAN_SCOPES.get(data.get('scope', 'all'))
        if not pick:
            raise ApiError('Onbekende scope')
        ips = [h['ip'] for h in store.list_hosts() if pick(h)]
    if not ips:
        raise ApiError('Geen hosts om te scannen in deze selectie')
    return ok(scanner.submit(ips, cred, data.get('threads'), keep_closed=True))


@app.get('/api/jobs/current')
def job_current():
    return ok(scanner.view())


@app.post('/api/jobs/current/cancel')
def job_cancel():
    scanner.cancel()
    return ok(scanner.view())


def require_credential(cred_id):
    cred = store.get_credential(cred_id) if cred_id else None
    if not cred:
        raise ApiError('Kies een (bestaande) credential')
    return cred


class Scanner:
    """Scanwachtrij die op de achtergrond draait, los van de browser.

    Grote opdrachten worden in blokken van CHUNK adressen verwerkt. Kleine opdrachten (een paar hosts
    inloggen, een domeinnaam) gaan voor, zodat ze niet achter de grote range van een collega wachten.
    Per blok volgt eerst een snelle poortsweep (veel threads, korte time-out). Alleen hosts met
    poort 445 open gaan door naar de tragere SMB-login, met het ingestelde aantal threads.
    """
    CHUNK = 1024

    def __init__(self):
        self.lock = threading.Lock()
        self.priority = deque()
        self.batches = deque()
        self.job = None

    def view(self):
        with self.lock:
            if not self.job:
                return None
            view = {k: v for k, v in self.job.items() if k != 'cancel'}
            view['queue'] = [{'cred_label': b['cred']['label'], 'count': len(b['ips'])}
                             for b in (*self.priority, *self.batches)]
            return view

    def submit(self, ips, cred, threads, keep_closed):
        try:
            threads = max(1, min(int(threads or 32), 256))
        except (TypeError, ValueError):
            threads = 32
        store.mark_queued(ips)
        with self.lock:
            batch = {'ips': list(ips), 'cred': cred, 'threads': threads, 'keep_closed': keep_closed}
            (self.priority if len(ips) <= self.CHUNK else self.batches).append(batch)
            if self.job and self.job['running']:
                self.job['total'] += len(ips)
            else:
                self.job = {
                    'id': uuid.uuid4().hex[:8], 'total': len(ips), 'done': 0, 'open': 0, 'found': 0,
                    'auth_failed': 0, 'running': True, 'cancel': False, 'cancelled': False,
                    'started': time.time(), 'finished': None, 'cred_id': cred['id'], 'cred_label': cred['label'],
                    'threads': threads,
                }
                threading.Thread(target=self._run, args=(self.job,), daemon=True).start()
        return self.view()

    def cancel(self):
        with self.lock:
            if self.job and self.job['running']:
                self.job['cancel'] = True

    def _count(self, job, **inc):
        with self.lock:
            for key, n in inc.items():
                job[key] += n

    def _next(self):
        """Volgende blok: eerst kleine opdrachten, dan een stuk van de grote (de rest gaat terug vooraan)."""
        if self.priority:
            return self.priority.popleft()
        batch = self.batches.popleft()
        if len(batch['ips']) > self.CHUNK:
            self.batches.appendleft(dict(batch, ips=batch['ips'][self.CHUNK:]))
            batch = dict(batch, ips=batch['ips'][:self.CHUNK])
        return batch

    def _run(self, job):
        leftover = []
        try:
            while True:
                with self.lock:
                    if job['cancel'] or not (self.priority or self.batches):
                        leftover = [*self.priority, *self.batches]
                        self.priority.clear()
                        self.batches.clear()
                        break
                    batch = self._next()
                    job.update(cred_id=batch['cred']['id'], cred_label=batch['cred']['label'], threads=batch['threads'])
                try:
                    self._run_batch(job, batch)
                finally:
                    store.unqueue(batch['ips'])
        finally:
            for batch in leftover:
                store.unqueue(batch['ips'])
            store.save()
            with self.lock:
                job.update(running=False, cancelled=job['cancel'], finished=time.time())

    def _run_batch(self, job, batch):
        cred = batch['cred']

        def login(ip):
            if not job['cancel']:
                res = smb.scan_host(ip, cred, port_checked=True)
                store.update_host(ip, res)
                self._count(job, found=res['status'] == 'ok', auth_failed=res['status'] == 'auth_failed')
            self._count(job, done=1)

        with ThreadPoolExecutor(max_workers=batch['threads']) as login_pool:
            def sweep(ip):
                if job['cancel']:
                    self._count(job, done=1)
                    return
                reason = smb.port_error(ip)
                if reason is None:
                    self._count(job, open=1)
                    login_pool.submit(login, ip)
                else:
                    # Dichte poort hangt niet af van de credential: alleen de host-status bijwerken.
                    if batch['keep_closed'] or store.has_host(ip):
                        store.update_host(ip, {'status': 'closed', 'error': reason, 'scanned_at': time.time()})
                    self._count(job, done=1)

            with ThreadPoolExecutor(max_workers=SWEEP_THREADS) as sweep_pool:
                for ip in batch['ips']:
                    sweep_pool.submit(sweep, ip)


scanner = Scanner()


# --- browsen ------------------------------------------------------------

def resolve_target(args):
    host, share = args.get('host'), args.get('share')
    if not host or not share:
        raise ApiError('host en share zijn verplicht')
    h = store.get_host(host)
    if not h:
        raise ApiError('Onbekende host', 404)
    cred = require_credential(args.get('cred') or h.get('cred_id'))
    return host, share, args.get('path', ''), cred


@app.get('/api/ls')
def ls():
    host, share, path, cred = resolve_target(request.args)
    try:
        entries = pool.run(host, cred, lambda c: smb.list_dir(c, share, path))
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)
    return ok({'path': smb.norm_path(path), 'entries': entries})


@app.get('/api/shares')
def shares():
    host = request.args.get('host')
    _, _, _, cred = resolve_target({**request.args, 'share': '-'})
    try:
        result = pool.run(host, cred, smb.list_shares)
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)
    store.update_host(host, {'shares': result, 'share_error': None, 'cred_id': cred['id']})
    store.save()
    return ok(result)


# --- toegang en schrijfacties --------------------------------------------

BAD_NAME = set('\\/:*?"<>|')


def valid_name(name):
    name = (name or '').strip()
    if not name or name in ('.', '..') or any(c in BAD_NAME for c in name) or name.endswith('.'):
        raise ApiError(f'Ongeldige naam: {name or "(leeg)"}. Deze tekens mogen niet: \\ / : * ? " < > |')
    return name


def fs_call(host, cred, fn):
    try:
        return pool.run(host, cred, fn)
    except ApiError:
        raise
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)


def body_target():
    data = request.get_json(force=True) or {}
    host, share, path, cred = resolve_target(data)
    return data, host, share, smb.norm_path(path), cred


@app.post('/api/probe')
def probe():
    data, host, share, path, cred = body_target()
    names = [str(n) for n in (data.get('names') or [])][:500]
    return ok(fs_call(host, cred, lambda c: smb.probe_dirs(c, share, path, names)))


@app.post('/api/fs/mkdir')
def fs_mkdir():
    data, host, share, path, cred = body_target()
    name = valid_name(data.get('name'))
    fs_call(host, cred, lambda c: smb.make_dir(c, share, f'{path}\\{name}'))
    return ok({'name': name})


@app.post('/api/fs/newfile')
def fs_newfile():
    data, host, share, path, cred = body_target()
    name = valid_name(data.get('name'))
    fs_call(host, cred, lambda c: smb.write_stream(c, share, f'{path}\\{name}', io.BytesIO(b'')))
    return ok({'name': name})


@app.post('/api/fs/rename')
def fs_rename():
    data, host, share, path, cred = body_target()
    old, new = valid_name(data.get('name')), valid_name(data.get('new'))
    fs_call(host, cred, lambda c: smb.rename(c, share, f'{path}\\{old}', f'{path}\\{new}'))
    return ok({'name': new})


@app.post('/api/fs/delete')
def fs_delete():
    data, host, share, path, cred = body_target()
    name = valid_name(data.get('name'))
    n = fs_call(host, cred, lambda c: smb.delete_path(c, share, f'{path}\\{name}', bool(data.get('dir'))))
    return ok({'deleted': n})


@app.post('/api/fs/upload')
def fs_upload():
    host, share, path, cred = resolve_target(request.args)
    f = request.files.get('file')
    if not f:
        raise ApiError('Geen bestand ontvangen')
    name = valid_name(f.filename)
    overwrite = request.args.get('overwrite') == '1'
    try:
        conn = smb.connect(host, cred)  # eigen verbinding, zodat een grote upload het browsen niet blokkeert
        try:
            size = smb.write_stream(conn, share, f'{smb.norm_path(path)}\\{name}', f.stream, overwrite=overwrite)
        finally:
            smb._safe_close(conn)
    except Exception as e:
        exists = 'COLLISION' in smb.err_text(e)
        return jsonify(status='error', message=smb.err_text(e), exists=exists), 409 if exists else 502
    return ok({'name': name, 'size': size})


@app.post('/api/fs/paste')
def fs_paste():
    """Plakken na knippen of kopiëren. Knippen binnen dezelfde share is een rename, anders kopiëren via deze server."""
    data = request.get_json(force=True) or {}
    src, dst = data.get('src') or {}, data.get('dst') or {}
    s_host, s_share, s_path, s_cred = resolve_target(src)
    d_host, d_share, d_path, d_cred = resolve_target(dst)
    name, new_name = valid_name(src.get('name')), valid_name(dst.get('name') or src.get('name'))
    is_dir, cut = bool(src.get('dir')), data.get('mode') == 'cut'
    s_full = f'{smb.norm_path(s_path)}\\{name}'
    d_full = f'{smb.norm_path(d_path)}\\{new_name}'
    if is_dir and (smb.norm_path(d_full).lower() + '\\').startswith(smb.norm_path(s_full).lower() + '\\') \
            and (s_host, s_share.lower()) == (d_host, d_share.lower()):
        raise ApiError('Een map kan niet in zichzelf geplakt worden')
    if cut and (s_host, s_share.lower(), s_cred['id']) == (d_host, d_share.lower(), d_cred['id']):
        fs_call(s_host, s_cred, lambda c: smb.rename(c, s_share, s_full, d_full))
        return ok({'name': new_name, 'files': None, 'moved': True})
    try:
        conn = smb.connect(d_host, d_cred)
        try:
            n = smb.copy_path(s_host, s_cred, s_share, s_full, conn, d_share, d_full, is_dir)
        finally:
            smb._safe_close(conn)
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)
    if cut:
        fs_call(s_host, s_cred, lambda c: smb.delete_path(c, s_share, s_full, is_dir))
    return ok({'name': new_name, 'files': n, 'moved': cut})


# --- eigen SMB-server --------------------------------------------------

def hosting_call(fn):
    try:
        return fn()
    except hosting.HostingError as e:
        raise ApiError(str(e))
    except OSError as e:
        raise ApiError(e.strerror or str(e))


@app.get('/api/notes')
def get_notes():
    return ok(notes)


@app.put('/api/notes/<ip>')
def put_note(ip):
    data = request.get_json(force=True) or {}
    text = str(data.get('text', ''))
    if text.strip():
        notes[ip] = text
    else:
        notes.pop(ip, None)
    _save_notes()
    return ok({})


@app.delete('/api/notes/<ip>')
def delete_note(ip):
    notes.pop(ip, None)
    _save_notes()
    return ok({})


@app.get('/api/server/interfaces')
def server_interfaces():
    return ok(hosting.local_interfaces())


@app.get('/api/server')
def server_status():
    return ok(server.status(request.args.get('since', 0, type=int)))


@app.post('/api/server/start')
def server_start():
    data = request.get_json(force=True) or {}
    return ok(hosting_call(lambda: server.start(data)))


@app.post('/api/server/stop')
def server_stop():
    return ok(server.stop())


@app.post('/api/server/hashes/clear')
def server_hashes_clear():
    server.clear_hashes()
    return ok({})


@app.post('/api/server/conns/clear')
def server_conns_clear():
    server.clear_conns()
    return ok({})


@app.get('/api/server/files')
def server_files():
    return ok(hosting_call(lambda: server.list_files(request.args.get('path', ''))))


@app.post('/api/server/upload')
def server_upload():
    files = request.files.getlist('file')
    if not files:
        raise ApiError('Geen bestand ontvangen')
    path = request.args.get('path', '')
    saved = [hosting_call(lambda f=f: (f.filename, server.save_upload(path, f.filename, f.stream))) for f in files]
    return ok({'saved': [{'name': n, 'size': size} for n, size in saved]})


@app.post('/api/server/mkdir')
def server_mkdir():
    data = request.get_json(force=True) or {}
    hosting_call(lambda: server.mkdir(data.get('path', ''), data.get('name')))
    return ok()


@app.post('/api/server/delete')
def server_delete():
    data = request.get_json(force=True) or {}
    hosting_call(lambda: server.delete(data.get('path', '')))
    return ok()


@app.get('/api/server/download')
def server_download():
    target = hosting_call(lambda: server.file_path(request.args.get('path', '')))
    return send_file(target, as_attachment=True, download_name=os.path.basename(target), max_age=0)


def _open_remote(args):
    host, share, path, cred = resolve_target(args)
    if not smb.norm_path(path):
        raise ApiError('Geen bestand opgegeven')
    try:
        return smb.RemoteFile(host, cred, share, path), smb.norm_path(path).split('\\')[-1]
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)


@app.get('/api/download')
def download():
    remote, name = _open_remote(request.args)
    mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    inline = request.args.get('inline') == '1' and mime in INLINE_TYPES
    disposition = 'inline' if inline else 'attachment'
    headers = {
        'Content-Disposition': f"{disposition}; filename*=UTF-8''{quote(name)}",
        # Bestanden van een (mogelijk vijandige) server nooit als actieve content op deze origin draaien.
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
        'Cache-Control': 'no-store',
    }
    return Response(remote.chunks(), mimetype=mime if inline else 'application/octet-stream', headers=headers)


@app.post('/api/download-zip')
def download_zip():
    """Download meerdere bestanden als ZIP-archief."""
    import zipfile
    import io
    data = request.json or {}
    host, share = data.get('host'), data.get('share')
    if not host or not share:
        raise ApiError('host en share zijn verplicht')
    h = store.get_host(host)
    if not h:
        raise ApiError('Onbekende host', 404)
    cred = require_credential(data.get('cred') or h.get('cred_id'))
    base_path = data.get('path', '')
    filenames = data.get('files') or []
    if not filenames:
        raise ApiError('Geen bestanden opgegeven')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            smb_path = f'{base_path}\\{name}' if base_path else name
            try:
                rf = smb.RemoteFile(host, cred, share, smb_path)
                zf.writestr(name, rf.read(50 * 1024 * 1024))  # max 50 MB per bestand
            except Exception:
                pass  # sla mislukte bestanden over
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name='bestanden.zip', mimetype='application/zip')


@app.post('/api/search')
def search_files():
    """Zoek recursief naar bestanden op een SMB-share."""
    import fnmatch
    data = request.json or {}
    host, share = data.get('host'), data.get('share')
    if not host or not share:
        raise ApiError('host en share zijn verplicht')
    h = store.get_host(host)
    if not h:
        raise ApiError('Onbekende host', 404)
    cred = require_credential(data.get('cred') or h.get('cred_id'))
    pattern = (data.get('pattern') or '*').strip() or '*'
    start_path = (data.get('path') or '').strip()
    max_depth = min(int(data.get('depth') or 5), 8)
    max_results = 500

    results = []
    deadline = time.time() + 30  # maximaal 30 seconden

    try:
        conn = smb.connect(host, cred)
    except Exception as exc:
        raise ApiError(smb.err_text(exc), 502)

    def walk(path, depth):
        if depth > max_depth or len(results) >= max_results or time.time() > deadline:
            return
        try:
            entries = smb.list_dir(conn, share, path)
        except Exception:
            return
        for e in entries:
            if len(results) >= max_results or time.time() > deadline:
                return
            full = f'{path}\\{e["name"]}' if path else e['name']
            if fnmatch.fnmatch(e['name'].lower(), pattern.lower()):
                results.append({'name': e['name'], 'path': full, 'dir': e['dir'],
                                'size': e.get('size'), 'mtime': e.get('mtime')})
            if e['dir']:
                walk(full, depth + 1)

    try:
        walk(start_path, 0)
    finally:
        try:
            conn.logoff(); conn.close()
        except Exception:
            pass

    return ok({'results': results, 'truncated': len(results) >= max_results,
               'pattern': pattern, 'host': host, 'share': share})


@app.get('/api/preview')
def preview():
    remote, name = _open_remote(request.args)
    try:
        data = remote.read(PREVIEW_LIMIT + 1)
    except Exception as e:
        raise ApiError(smb.err_text(e), 502)
    truncated = len(data) > PREVIEW_LIMIT
    data = data[:PREVIEW_LIMIT]
    text = decode_text(data, truncated)
    if text is None:
        return ok({'binary': True, 'hex': hexdump(data[:HEX_LIMIT]), 'truncated': len(data) > HEX_LIMIT or truncated})
    return ok({'binary': False, 'text': text, 'truncated': truncated})


bookmarks = []
bookmarks_path = None


def _load_bookmarks():
    global bookmarks
    if not bookmarks_path:
        return
    try:
        with open(bookmarks_path) as f:
            bookmarks = json.load(f)
    except Exception:
        bookmarks = []


def _save_bookmarks():
    if not bookmarks_path:
        return
    try:
        tmp = bookmarks_path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(bookmarks, f, indent=2, ensure_ascii=False)
        os.replace(tmp, bookmarks_path)
    except Exception:
        pass


@app.get('/api/bookmarks')
def get_bookmarks():
    return ok(bookmarks)


@app.post('/api/bookmarks')
def add_bookmark():
    global bookmarks
    data = request.json or {}
    host = (data.get('host') or '').strip()
    if not host:
        raise ApiError('Host vereist')
    bm = {
        'id': str(int(time.time() * 1000)),
        'label': (data.get('label') or '').strip() or host,
        'host': host,
        'share': (data.get('share') or '').strip(),
        'path': (data.get('path') or '').strip(),
    }
    bookmarks.append(bm)
    _save_bookmarks()
    return ok(bm)


@app.delete('/api/bookmarks/<bm_id>')
def delete_bookmark(bm_id):
    global bookmarks
    bookmarks = [b for b in bookmarks if b['id'] != bm_id]
    _save_bookmarks()
    return ok({})


@app.post('/api/hosts/import')
def hosts_import():
    """Importeer hosts uit nmap XML of Nessus (.nessus) bestanden."""
    import xml.etree.ElementTree as ET
    f = request.files.get('file')
    if not f:
        raise ApiError('Geen bestand ontvangen')
    try:
        tree = ET.parse(f)
    except ET.ParseError as e:
        raise ApiError(f'Ongeldig XML-bestand: {e}')
    root_el = tree.getroot()
    ips = []
    tag = root_el.tag
    if tag == 'nmaprun':
        # nmap XML: <host><address addrtype="ipv4" addr="..."/>
        for host_el in root_el.iter('host'):
            for addr in host_el.findall('address'):
                if addr.get('addrtype') == 'ipv4':
                    ip = addr.get('addr', '').strip()
                    if ip:
                        ips.append(ip)
    elif tag == 'NessusClientData_v2':
        # Nessus XML: <ReportHost name="IP_or_hostname">
        for rh in root_el.iter('ReportHost'):
            name = rh.get('name', '').strip()
            if name:
                ips.append(name)
    else:
        raise ApiError(f'Onbekend formaat: root-element is <{tag}>, verwacht <nmaprun> of <NessusClientData_v2>')
    added = 0
    for ip in dict.fromkeys(ips):  # dedupliceer, behoud volgorde
        if store.add_host(ip):
            added += 1
    return ok({'imported': len(ips), 'added': added, 'ips': list(dict.fromkeys(ips))})


def decode_text(data, truncated):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16', errors='replace')
    if b'\x00' in data[:8192]:
        return None
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError as e:
        if truncated and e.start >= len(data) - 3:
            return data[:e.start].decode('utf-8')
        return data.decode('cp1252', errors='replace')


def hexdump(data):
    lines = []
    for off in range(0, len(data), 16):
        chunk = data[off:off + 16]
        hexpart = ' '.join(f'{b:02x}' for b in chunk)
        asciipart = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        lines.append(f'{off:08x}  {hexpart:<47}  {asciipart}')
    return '\n'.join(lines)


def main():
    global store, auth_password, server, bookmarks
    parser = argparse.ArgumentParser(description='SMBrowser95 webinterface')
    parser.add_argument('--host', default='127.0.0.1', help='luisteradres (standaard 127.0.0.1)')
    parser.add_argument('--port', type=int, default=8445)
    parser.add_argument('--data', default=os.path.join(BASE_DIR, 'data', 'store.json'),
                        help='pad naar opslagbestand voor credentials en hosts')
    parser.add_argument('--smb-port', type=int, default=445, help='SMB-poort van de targets (standaard 445)')
    parser.add_argument('--password', default=os.environ.get('SMBB_PASSWORD'),
                        help='HTTP basic-auth wachtwoord (of env SMBB_PASSWORD); aangeraden bij --host 0.0.0.0')
    args = parser.parse_args()

    global notes_path, bookmarks_path
    smb.SMB_PORT = args.smb_port
    store = Store(args.data)
    data_dir = os.path.dirname(os.path.abspath(args.data))
    server = hosting.HostedServer(os.path.join(data_dir, 'smbserver.json'))
    notes_path = os.path.join(data_dir, 'notes.json')
    bookmarks_path = os.path.join(data_dir, 'bookmarks.json')
    _load_notes()
    _load_bookmarks()
    auth_password = args.password
    if args.host not in ('127.0.0.1', 'localhost', '::1') and not auth_password:
        print('[!] Let op: luistert op een extern adres zonder --password. Credentials zijn dan '
              'bereikbaar voor iedereen op het netwerk.', file=sys.stderr)
    print(f'[*] SMBrowser95 draait op http://{args.host}:{args.port}  (data: {args.data})')
    from werkzeug.serving import run_simple
    run_simple(args.host, args.port, app, threaded=True)


if __name__ == '__main__':
    main()
