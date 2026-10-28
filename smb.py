"""SMB-laag bovenop impacket: verbinden, shares/mappen opvragen en bestanden lezen."""
import socket
import threading
import time

from impacket import nt_errors
from impacket.smbconnection import SMBConnection, SessionError
from impacket.smb3structs import (
    FILE_ADD_FILE,
    FILE_CREATE,
    FILE_DIRECTORY_FILE,
    FILE_LIST_DIRECTORY,
    FILE_NON_DIRECTORY_FILE,
    FILE_OPEN,
    FILE_OVERWRITE_IF,
    FILE_READ_DATA,
    FILE_SHARE_DELETE,
    FILE_SHARE_READ,
    FILE_SHARE_WRITE,
    FILE_WRITE_DATA,
)

SMB_PORT = 445
PORT_TIMEOUT = 1.0
CONNECT_TIMEOUT = 6

STYPE_NAMES = {0: 'DISK', 1: 'PRINTER', 2: 'DEVICE', 3: 'IPC'}

RECONNECT_ERRORS = {
    getattr(nt_errors, 'STATUS_NETWORK_SESSION_EXPIRED', 0xC000035C),
    getattr(nt_errors, 'STATUS_USER_SESSION_DELETED', 0xC0000203),
    getattr(nt_errors, 'STATUS_NETWORK_NAME_DELETED', 0xC00000C9),
}


def err_text(e):
    """Leesbare foutmelding voor SMB- en netwerkfouten."""
    if isinstance(e, SessionError):
        code = e.getErrorCode()
        name, desc = nt_errors.ERROR_MESSAGES.get(code, (hex(code), ''))
        return f'{name}: {desc}' if desc else name
    if isinstance(e, socket.timeout):
        return 'Time-out bij verbinden'
    if isinstance(e, OSError):
        return f'Netwerkfout: {e.strerror or e}'
    return str(e) or e.__class__.__name__


def norm_path(path):
    parts = [p for p in (path or '').replace('/', '\\').split('\\') if p and p != '.']
    return '\\'.join(parts)


def is_ip(host):
    try:
        socket.inet_aton(host)
        return host.count('.') == 3
    except OSError:
        return False


def port_open(host, port=None, timeout=None):
    return port_error(host, port, timeout) is None


def port_error(host, port=None, timeout=None):
    """None als de SMB-poort open is, anders een leesbare reden (ook bij een onbekende naam)."""
    port = port or SMB_PORT
    if is_ip(host):
        addrs = [host]
    else:
        try:
            infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        except OSError:
            return f'Naam {host} niet gevonden (DNS)'
        addrs = list(dict.fromkeys(i[4][0] for i in infos))
        # Een domeinnaam wijst vaak naar meerdere DC's; wat ruimere time-out per adres.
        timeout = max(timeout or PORT_TIMEOUT, 2.0)
    for addr in addrs:
        try:
            with socket.create_connection((addr, port), timeout=timeout or PORT_TIMEOUT):
                return None
        except OSError:
            continue
    via = '' if is_ip(host) else f" ({', '.join(addrs[:4])})"
    return f'Poort {port} niet bereikbaar{via}'


def connect(host, cred, timeout=CONNECT_TIMEOUT):
    conn = SMBConnection(host, host, sess_port=SMB_PORT, timeout=timeout)
    lmhash, nthash = '', ''
    raw_hash = (cred.get('nthash') or '').strip()
    if raw_hash:
        lmhash, nthash = raw_hash.split(':', 1) if ':' in raw_hash else ('', raw_hash)
    password = '' if nthash else cred.get('password', '')
    try:
        conn.login(cred.get('username', ''), password, cred.get('domain', ''), lmhash, nthash)
    except Exception:
        _safe_close(conn)
        raise
    return conn


def _safe_close(conn):
    for fn in (getattr(conn, 'logoff', None), getattr(conn, 'close', None)):
        try:
            fn and fn()
        except Exception:
            pass


def list_shares(conn):
    shares = []
    for s in conn.listShares():
        name = s['shi1_netname'][:-1]
        stype = s['shi1_type']
        type_name = STYPE_NAMES.get(stype & 0xFFFF, 'OTHER')
        access = 'NONE'
        if type_name == 'IPC':
            access = 'IPC'
        elif type_name == 'DISK':
            try:
                conn.listPath(name, '*')
                access = 'READ'
            except Exception:
                pass
        shares.append({
            'name': name,
            'remark': s['shi1_remark'][:-1],
            'type': type_name,
            'special': bool(stype & 0x80000000),
            'access': access,
        })
    shares.sort(key=lambda x: (x['access'] != 'READ', x['name'].lower()))
    return shares


def list_dir(conn, share, path):
    p = norm_path(path)
    entries = []
    for f in conn.listPath(share, f'{p}\\*' if p else '*'):
        name = f.get_longname()
        if name in ('.', '..'):
            continue
        entries.append({
            'name': name,
            'dir': bool(f.is_directory()),
            'size': f.get_filesize(),
            'mtime': f.get_mtime_epoch(),
            'ctime': f.get_ctime_epoch(),
            'attrs': f.get_attributes(),
        })
    return entries


def scan_host(host, cred, port_checked=False):
    """Controleer poort 445, log in en inventariseer shares."""
    result = {
        'status': 'closed', 'error': None, 'shares': [], 'share_error': None,
        'cred_id': cred['id'], 'scanned_at': time.time(),
    }
    if not port_checked:
        reason = port_error(host)
        if reason:
            result['error'] = reason
            return result
    try:
        conn = connect(host, cred)
    except SessionError as e:
        result.update(status='auth_failed', error=err_text(e))
        return result
    except Exception as e:
        result.update(status='error', error=err_text(e))
        return result
    try:
        result.update(
            status='ok',
            hostname=conn.getServerName() or None,
            domain=conn.getServerDomain() or None,
            os=conn.getServerOS() or None,
            signing=bool(conn.isSigningRequired()),
            dialect=_dialect_name(conn.getDialect()),
            guest=bool(conn.isGuestSession()),
        )
        try:
            result['shares'] = list_shares(conn)
        except Exception as e:
            result['share_error'] = err_text(e)
    finally:
        _safe_close(conn)
    return result


def _dialect_name(d):
    return {
        0x0202: 'SMB 2.0.2', 0x0210: 'SMB 2.1', 0x0300: 'SMB 3.0',
        0x0302: 'SMB 3.0.2', 0x0311: 'SMB 3.1.1',
    }.get(d, 'SMB 1' if isinstance(d, str) else str(d))


class ConnectionPool:
    """Hergebruikt ingelogde sessies per (host, credential) om browsen snel te houden."""

    def __init__(self):
        self._lock = threading.Lock()
        self._entries = {}

    def run(self, host, cred, fn):
        key = (host, cred['id'], cred.get('rev', 0))
        with self._lock:
            entry = self._entries.setdefault(key, {'lock': threading.Lock(), 'conn': None})
        with entry['lock']:
            for attempt in (0, 1):
                if entry['conn'] is None:
                    entry['conn'] = connect(host, cred)
                try:
                    return fn(entry['conn'])
                except SessionError as e:
                    if e.getErrorCode() not in RECONNECT_ERRORS or attempt:
                        raise
                except Exception:
                    if attempt:
                        _safe_close(entry['conn'])
                        entry['conn'] = None
                        raise
                _safe_close(entry['conn'])
                entry['conn'] = None

    def drop_credential(self, cred_id):
        with self._lock:
            for key in [k for k in self._entries if k[1] == cred_id]:
                conn = self._entries.pop(key)['conn']
                if conn:
                    _safe_close(conn)


class RemoteFile:
    """Open bestand op een eigen verbinding, zodat downloads het browsen niet blokkeren."""

    def __init__(self, host, cred, share, path):
        self.conn = connect(host, cred)
        self.tid = self.fid = None
        try:
            self.tid = self.conn.connectTree(share)
            self.fid = self.conn.openFile(
                self.tid, norm_path(path),
                desiredAccess=FILE_READ_DATA,
                shareMode=FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                creationOption=FILE_NON_DIRECTORY_FILE,
                creationDisposition=FILE_OPEN,
            )
        except Exception:
            self.close()
            raise

    def chunks(self, chunk_size=1 << 20, limit=None):
        offset = 0
        try:
            while limit is None or offset < limit:
                want = chunk_size if limit is None else min(chunk_size, limit - offset)
                data = self.conn.readFile(self.tid, self.fid, offset, want, singleCall=False)
                if not data:
                    break
                offset += len(data)
                yield data
        finally:
            self.close()

    def read(self, limit):
        return b''.join(self.chunks(limit=limit))

    def close(self):
        try:
            if self.fid is not None:
                self.conn.closeFile(self.tid, self.fid)
            if self.tid is not None:
                self.conn.disconnectTree(self.tid)
        except Exception:
            pass
        self.fid = self.tid = None
        _safe_close(self.conn)


# --- toegang controleren ------------------------------------------------

SHARE_ALL = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
DENIED_CODES = {
    getattr(nt_errors, 'STATUS_ACCESS_DENIED', 0xC0000022),
    getattr(nt_errors, 'STATUS_NETWORK_ACCESS_DENIED', 0xC00000CA),
}


def _try_open_dir(conn, tid, path, access):
    """True als de map met deze rechten geopend kan worden, False bij 'toegang geweigerd'."""
    try:
        fid = conn.openFile(tid, path, desiredAccess=access, shareMode=SHARE_ALL,
                            creationOption=FILE_DIRECTORY_FILE, creationDisposition=FILE_OPEN)
    except SessionError as e:
        if e.getErrorCode() in DENIED_CODES:
            return False
        raise
    conn.closeFile(tid, fid)
    return True


def probe_dirs(conn, share, path, names):
    """Rechten per map zonder iets te wijzigen: alleen een handle openen met de gevraagde rechten.

    Geeft per naam 'rw' (lezen en schrijven), 'r' (alleen lezen), 'w' (alleen schrijven),
    'denied' of een foutmelding. Een lege naam is de map zelf.
    """
    tid = conn.connectTree(share)
    out = {}
    try:
        for name in names:
            full = norm_path(f'{path}\\{name}') if name else norm_path(path)
            try:
                read = _try_open_dir(conn, tid, full, FILE_LIST_DIRECTORY)
                write = _try_open_dir(conn, tid, full, FILE_ADD_FILE)
                out[name] = ('r' if read else '') + ('w' if write else '') or 'denied'
            except Exception as e:
                out[name] = err_text(e)
    finally:
        conn.disconnectTree(tid)
    return out


# --- schrijven ----------------------------------------------------------

def make_dir(conn, share, path):
    conn.createDirectory(share, norm_path(path))


def rename(conn, share, old, new):
    conn.rename(share, norm_path(old), norm_path(new))


def delete_path(conn, share, path, is_dir):
    """Verwijder een bestand, of een map inclusief inhoud. Geeft het aantal verwijderde items."""
    path = norm_path(path)
    if not is_dir:
        conn.deleteFile(share, path)
        return 1
    n = 0
    for e in conn.listPath(share, f'{path}\\*'):
        name = e.get_longname()
        if name in ('.', '..'):
            continue
        n += delete_path(conn, share, f'{path}\\{name}', e.is_directory())
    conn.deleteDirectory(share, path)
    return n + 1


def write_stream(conn, share, path, stream, overwrite=False, chunk_size=1 << 20):
    """Schrijf een bestand vanuit een file-object. Zonder overwrite faalt het als de naam al bestaat."""
    tid = conn.connectTree(share)
    fid = None
    try:
        fid = conn.openFile(tid, norm_path(path), desiredAccess=FILE_WRITE_DATA, shareMode=FILE_SHARE_READ,
                            creationOption=FILE_NON_DIRECTORY_FILE,
                            creationDisposition=FILE_OVERWRITE_IF if overwrite else FILE_CREATE)
        offset = 0
        while True:
            data = stream.read(chunk_size)
            if not data:
                break
            conn.writeFile(tid, fid, data, offset)
            offset += len(data)
        return offset
    finally:
        if fid is not None:
            conn.closeFile(tid, fid)
        conn.disconnectTree(tid)


class _ChunkStream:
    def __init__(self, chunks):
        self._it = iter(chunks)

    def read(self, _size):
        return next(self._it, b'')


def copy_path(src_host, src_cred, src_share, src_path, dst_conn, dst_share, dst_path, is_dir):
    """Kopieer een bestand of map (recursief) via deze server. Geeft het aantal gekopieerde bestanden."""
    if not is_dir:
        remote = RemoteFile(src_host, src_cred, src_share, src_path)
        write_stream(dst_conn, dst_share, dst_path, _ChunkStream(remote.chunks()))
        return 1
    src = connect(src_host, src_cred)
    try:
        listing = [(e.get_longname(), e.is_directory()) for e in src.listPath(src_share, f'{norm_path(src_path)}\\*')]
    finally:
        _safe_close(src)
    make_dir(dst_conn, dst_share, dst_path)
    n = 0
    for name, sub_dir in listing:
        if name in ('.', '..'):
            continue
        n += copy_path(src_host, src_cred, src_share, f'{src_path}\\{name}', dst_conn, dst_share, f'{dst_path}\\{name}', sub_dir)
    return n
