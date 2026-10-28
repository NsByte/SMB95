#!/usr/bin/env python3
"""Start/stop SMBrowser95.

    python3 smbbrowser.py start              # alleen op deze machine (127.0.0.1)
    python3 smbbrowser.py start --expose     # bereikbaar op het netwerk (0.0.0.0), met wachtwoord
    python3 smbbrowser.py stop
    python3 smbbrowser.py restart [--expose]
    python3 smbbrowser.py status

Gebruikt alleen de standaardbibliotheek; dependencies worden bij de eerste start in .venv/ geïnstalleerd.
"""
import argparse
import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
RUN_FILE = os.path.join(DATA_DIR, 'run.json')
LOG_FILE = os.path.join(DATA_DIR, 'server.log')
VENV_DIR = os.path.join(BASE_DIR, '.venv')
APP = os.path.join(BASE_DIR, 'app.py')


def info(msg):
    print(f'[*] {msg}')


def fail(msg):
    print(f'[!] {msg}', file=sys.stderr)
    sys.exit(1)


# --- runtime-status ------------------------------------------------------

def read_run():
    try:
        with open(RUN_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_run(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd = os.open(RUN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, indent=2)


def clear_run():
    try:
        os.remove(RUN_FILE)
    except OSError:
        pass


def is_ours(pid):
    """Draait dit pid nog, en is het onze app.py (geen hergebruikt pid)?"""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return False
    try:
        with open(f'/proc/{pid}/cmdline', 'rb') as f:
            cmd = f.read().decode(errors='replace')
    except OSError:
        cmd = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
    return APP in cmd


def running():
    run = read_run()
    if run and is_ours(run['pid']):
        return run
    if run:
        clear_run()
    return None


# --- dependencies --------------------------------------------------------

def python_with_deps():
    """Huidige interpreter als flask + impacket er al zijn, anders een eigen virtualenv."""
    probe = 'import flask, impacket'
    if subprocess.run([sys.executable, '-c', probe], capture_output=True).returncode == 0:
        return sys.executable
    venv_py = os.path.join(VENV_DIR, 'bin', 'python')
    if not os.path.exists(venv_py):
        info('Virtualenv aanmaken in .venv/ …')
        subprocess.run([sys.executable, '-m', 'venv', VENV_DIR], check=True)
    if subprocess.run([venv_py, '-c', probe], capture_output=True).returncode != 0:
        info('Dependencies installeren (flask, impacket) …')
        subprocess.run([venv_py, '-m', 'pip', 'install', '-q', '--upgrade', 'pip'], check=True)
        subprocess.run([venv_py, '-m', 'pip', 'install', '-q', '-r', os.path.join(BASE_DIR, 'requirements.txt')], check=True)
    return venv_py


# --- helpers -------------------------------------------------------------

def lan_addresses():
    addrs = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))  # stuurt geen pakketten, kiest alleen de uitgaande interface
            addrs.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        addrs.update(a[4][0] for a in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    return sorted(a for a in addrs if not a.startswith('127.'))


def port_listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.5):
            return True
    except OSError:
        return False


def print_urls(run):
    info(f"Lokaal:  http://127.0.0.1:{run['port']}")
    if run['expose']:
        for ip in lan_addresses():
            info(f"Netwerk: http://{ip}:{run['port']}")
        info(f"Login:   gebruikersnaam willekeurig, wachtwoord: {run['password']}")


# --- commando's ----------------------------------------------------------

def cmd_start(args):
    run = running()
    if run:
        info(f"Draait al (pid {run['pid']}).")
        print_urls(run)
        return

    if args.expose:
        password = args.password or os.environ.get('SMBB_PASSWORD') or secrets.token_urlsafe(12)
    else:
        password = args.password or os.environ.get('SMBB_PASSWORD') or ''
    if port_listening(args.port):
        fail(f'Poort {args.port} is al in gebruik. Kies een andere met --port.')

    py = python_with_deps()
    cmd = [py, APP, '--host', '0.0.0.0' if args.expose else '127.0.0.1', '--port', str(args.port),
           '--smb-port', str(args.smb_port)]
    env = dict(os.environ, SMBB_PASSWORD=password)  # via env i.p.v. argv, zodat het niet in `ps` staat

    if args.foreground:
        info('Draait op de voorgrond, stop met Ctrl+C.')
        print_urls({'port': args.port, 'expose': args.expose, 'password': password})
        os.execve(py, cmd, env)

    os.makedirs(DATA_DIR, exist_ok=True)
    log = open(LOG_FILE, 'ab')
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                            env=env, cwd=BASE_DIR, start_new_session=True)
    run = {'pid': proc.pid, 'port': args.port, 'expose': args.expose, 'password': password or None,
           'started': time.time()}
    write_run(run)

    for _ in range(60):
        if proc.poll() is not None:
            clear_run()
            fail(f'Starten mislukt, zie {LOG_FILE}:\n' + tail(LOG_FILE))
        if port_listening(args.port):
            break
        time.sleep(0.25)
    else:
        info(f'Server reageert nog niet; check {LOG_FILE}')

    info(f"Gestart (pid {proc.pid}), {'BEREIKBAAR OP HET NETWERK' if args.expose else 'alleen lokaal'}.")
    print_urls(run)
    info(f'Log: {LOG_FILE}  ·  stoppen: python3 {os.path.basename(__file__)} stop')


def cmd_stop(_args=None):
    run = running()
    if not run:
        info('Draait niet.')
        return
    pid = run['pid']
    os.kill(pid, signal.SIGTERM)
    for _ in range(40):
        if not is_ours(pid):
            break
        time.sleep(0.125)
    else:
        os.kill(pid, signal.SIGKILL)
    clear_run()
    info(f'Gestopt (pid {pid}).')


def cmd_restart(args):
    cmd_stop()
    cmd_start(args)


def cmd_status(_args):
    run = running()
    if not run:
        info('Draait niet.')
        sys.exit(3)
    started = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(run['started']))
    info(f"Draait (pid {run['pid']}) sinds {started}, {'exposed op het netwerk' if run['expose'] else 'alleen lokaal'}.")
    print_urls(run)


def tail(path, n=15):
    try:
        with open(path, errors='replace') as f:
            return ''.join(f.readlines()[-n:])
    except OSError:
        return ''


def main():
    parser = argparse.ArgumentParser(description='Start/stop SMBrowser95.')
    sub = parser.add_subparsers(dest='command', required=True)

    def add_start_opts(p):
        p.add_argument('--expose', action='store_true',
                       help='luister op alle interfaces (0.0.0.0) i.p.v. alleen 127.0.0.1; vereist wachtwoord')
        p.add_argument('--port', type=int, default=8445, help='webpoort (standaard 8445)')
        p.add_argument('--password', help='wachtwoord voor de webinterface (bij --expose anders willekeurig gegenereerd)')
        p.add_argument('--smb-port', type=int, default=445, help='SMB-poort van de targets (standaard 445)')
        p.add_argument('--foreground', action='store_true', help='niet op de achtergrond draaien')

    add_start_opts(sub.add_parser('start', help='start de server'))
    add_start_opts(sub.add_parser('restart', help='herstart de server'))
    sub.add_parser('stop', help='stop de server')
    sub.add_parser('status', help='toon of de server draait')

    args = parser.parse_args()
    {'start': cmd_start, 'stop': cmd_stop, 'restart': cmd_restart, 'status': cmd_status}[args.command](args)


if __name__ == '__main__':
    main()
