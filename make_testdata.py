#!/usr/bin/env python3
"""
Vervangt data/ met fictieve testdata voor README-screenshots.
Draai dit script alleen als je de huidige data wil overschrijven.

    python3 make_testdata.py
"""
import json, os, shutil, time, uuid

DATA = os.path.join(os.path.dirname(__file__), 'data')

# ── helpers ──────────────────────────────────────────────────────────────────
def uid(): return str(uuid.uuid4())[:8]
def ts(): return time.time()

# ── credentials ──────────────────────────────────────────────────────────────
cred_admin = {'id': uid(), 'rev': 1, 'label': 'corp\\pentest', 'domain': 'CORP', 'username': 'pentest', 'password': 'Welcome01!', 'nthash': ''}
cred_svc   = {'id': uid(), 'rev': 1, 'label': 'corp\\svc_backup', 'domain': 'CORP', 'username': 'svc_backup', 'password': '', 'nthash': 'aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c'}
cred_anon  = {'id': uid(), 'rev': 1, 'label': '(null session)', 'domain': '', 'username': '', 'password': '', 'nthash': ''}
CREDS = [cred_admin, cred_svc, cred_anon]

def share(name, remark='', stype='DISK', access='READ'):
    return {'name': name, 'remark': remark, 'type': stype, 'special': name.endswith('$'), 'access': access}

def host(ip, hostname, os_str, cred, status='ok', shares=None, signing=False):
    return {
        ip: {
            'added_at': ts(), 'status': status, 'error': None,
            'shares': shares or [], 'share_error': None,
            'cred_id': cred['id'], 'scanned_at': ts(), '_rev': 1,
            'results': [{
                'status': status, 'cred_id': cred['id'], 'scanned_at': ts(),
                'hostname': hostname, 'domain': 'CORP', 'os': os_str,
                'signing': signing, 'dialect': 'SMB 3.1.1', 'guest': False,
                'shares': shares or [], 'share_error': None,
            }],
            'prev_status': None,
        }
    }

# ── hosts ─────────────────────────────────────────────────────────────────────
dc_shares  = [share('SYSVOL', 'Logon server share'), share('NETLOGON', 'Logon server share'), share('C$', 'Default share'), share('ADMIN$', 'Remote Admin'), share('IPC$', '', 'IPC', 'IPC')]
fs_shares  = [share('Finance', 'Financiële rapporten'), share('HR', 'Personeelsdossiers', access='NONE'), share('IT', 'IT-beheer'), share('C$'), share('ADMIN$'), share('IPC$', '', 'IPC', 'IPC')]
web_shares = [share('wwwroot', 'Webroot'), share('Logs', 'Applicatielogs'), share('C$'), share('ADMIN$'), share('IPC$', '', 'IPC', 'IPC')]
dev_shares = [share('Repos', 'Sourcecode repositories'), share('Builds', 'Build-artefacten'), share('C$', access='NONE'), share('ADMIN$', access='NONE'), share('IPC$', '', 'IPC', 'IPC')]

HOSTS = {}
HOSTS.update(host('10.10.10.1',  'DC01',     'Windows Server 2022 Standard 21H2',  cred_admin, shares=dc_shares,  signing=True))
HOSTS.update(host('10.10.10.2',  'DC02',     'Windows Server 2022 Standard 21H2',  cred_admin, shares=dc_shares,  signing=True))
HOSTS.update(host('10.10.10.10', 'FS01',     'Windows Server 2019 Standard',       cred_admin, shares=fs_shares))
HOSTS.update(host('10.10.10.11', 'FS02',     'Windows Server 2019 Standard',       cred_svc,   shares=fs_shares))
HOSTS.update(host('10.10.10.20', 'WEB01',    'Windows Server 2016 Datacenter',     cred_admin, shares=web_shares))
HOSTS.update(host('10.10.10.21', 'WEB02',    'Windows Server 2016 Datacenter',     cred_admin, shares=web_shares))
HOSTS.update(host('10.10.10.30', 'DEV01',    'Windows 11 Pro 23H2',                cred_admin, shares=dev_shares))
HOSTS.update(host('10.10.10.31', 'DEV02',    'Windows 11 Pro 23H2',                cred_svc,   shares=dev_shares))
HOSTS.update(host('10.10.10.40', 'LAPTOP01', 'Windows 11 Pro 23H2',                cred_admin, shares=[share('C$'), share('ADMIN$'), share('IPC$','','IPC','IPC')]))
HOSTS.update(host('10.10.10.50', 'PRINT01',  'Windows Server 2019 Standard',       cred_anon,  shares=[share('HP_LASERJET', 'Afdeling A', 'PRINTER'), share('IPC$','','IPC','IPC')]))
HOSTS.update(host('10.10.10.99', None,       None,                                 cred_admin, status='closed'))
HOSTS.update(host('10.10.10.100',None,       None,                                 cred_admin, status='pending'))

# ── notes ─────────────────────────────────────────────────────────────────────
NOTES = {
    '10.10.10.1':  'Domain Controller – primair. Kerberoasting geprobeerd, 3 SPN-accounts gevonden.',
    '10.10.10.10': 'Fileserver met Finance-share. svc_backup heeft schrijftoegang tot IT-share!',
    '10.10.10.20': 'Webserver. wwwroot bevat web.config met DB-connectiestring.',
}

# ── bookmarks ─────────────────────────────────────────────────────────────────
BOOKMARKS = [
    {'id': uid(), 'label': r'FS01\Finance', 'host': '10.10.10.10', 'share': 'Finance', 'path': ''},
    {'id': uid(), 'label': r'WEB01\wwwroot', 'host': '10.10.10.20', 'share': 'wwwroot', 'path': ''},
    {'id': uid(), 'label': 'DC01', 'host': '10.10.10.1', 'share': '', 'path': ''},
]

# ── smbserver (leeg) ──────────────────────────────────────────────────────────
SMBSERVER = {'share': 'PENTEST', 'port': 4445, 'password': '', 'listen': '0.0.0.0', 'smb2': True}

# ── schrijven ────────────────────────────────────────────────────────────────
def write(name, data):
    path = os.path.join(DATA, name)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'  ✓  {name}')

print(f'\nData-directory: {DATA}')
print('Bestanden overschrijven:')
write('store.json',     {'credentials': CREDS, 'hosts': HOSTS})
write('notes.json',     NOTES)
write('bookmarks.json', BOOKMARKS)
write('smbserver.json', SMBSERVER)

# smbshare leegmaken
smbshare = os.path.join(DATA, 'smbshare')
if os.path.isdir(smbshare):
    shutil.rmtree(smbshare)
os.makedirs(smbshare, exist_ok=True)
print(f'  ✓  smbshare/ leeggemaakt')

print('\nKlaar. Start de app opnieuw om de testdata te zien.')
