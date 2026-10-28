"""Parser voor target-invoer: losse IP's, CIDR, ranges, octet-ranges en hostnames.

Voorbeelden:
    10.0.0.5
    10.0.0.0/24
    10.0.0.10-50
    10.0.0.10-10.0.1.20
    10.0.1-3.1-254   (nmap-stijl per octet, * = 1-254 in het laatste octet)
    fileserver.corp.local
"""
import ipaddress
import itertools
import re

MAX_TARGETS = 65536

_OCTET_RANGE = re.compile(r'^[\d*\-]+(\.[\d*\-]+){3}$')
_HOSTNAME = re.compile(r'^(?=.{1,253}$)[A-Za-z0-9_](?:[A-Za-z0-9_\-]{0,62})(?:\.[A-Za-z0-9_\-]{1,63})*\.?$')


class TargetError(ValueError):
    pass


def _ipv4(s):
    try:
        ip = ipaddress.ip_address(s)
    except ValueError:
        return None
    return ip if ip.version == 4 else None


def _octet_values(part, last):
    if part == '*':
        return range(1, 255) if last else range(0, 256)
    if '-' in part:
        lo, _, hi = part.partition('-')
        if not lo.isdigit() or not hi.isdigit():
            raise TargetError(f'ongeldige octet-range "{part}"')
        lo, hi = int(lo), int(hi)
        if not (0 <= lo <= hi <= 255):
            raise TargetError(f'octet-range "{part}" buiten 0-255')
        return range(lo, hi + 1)
    if not part.isdigit() or int(part) > 255:
        raise TargetError(f'ongeldig octet "{part}"')
    return [int(part)]


def expand(token):
    if '/' in token:
        try:
            net = ipaddress.ip_network(token, strict=False)
        except ValueError:
            raise TargetError('ongeldige CIDR-notatie')
        if net.version != 4:
            raise TargetError('alleen IPv4-ranges worden ondersteund')
        if net.num_addresses > MAX_TARGETS:
            raise TargetError(f'range groter dan {MAX_TARGETS} adressen')
        hosts = net.hosts() if net.prefixlen < 31 else iter(net)
        return [str(ip) for ip in hosts]

    if '-' in token:
        left, _, right = token.partition('-')
        a, b = _ipv4(left), _ipv4(right)
        if a and b:
            if int(b) < int(a):
                raise TargetError('eind-IP ligt vóór start-IP')
            if int(b) - int(a) + 1 > MAX_TARGETS:
                raise TargetError(f'range groter dan {MAX_TARGETS} adressen')
            return [str(ipaddress.IPv4Address(i)) for i in range(int(a), int(b) + 1)]

    if _OCTET_RANGE.match(token) and ('-' in token or '*' in token):
        parts = token.split('.')
        lists = [_octet_values(p, i == 3) for i, p in enumerate(parts)]
        total = 1
        for values in lists:
            total *= len(values)
        if total > MAX_TARGETS:
            raise TargetError(f'range groter dan {MAX_TARGETS} adressen')
        return ['.'.join(map(str, combo)) for combo in itertools.product(*lists)]

    try:
        return [str(ipaddress.ip_address(token))]
    except ValueError:
        pass
    if re.fullmatch(r'[\d.]+', token):
        raise TargetError('ongeldig IP-adres')
    if _HOSTNAME.match(token):
        return [token.rstrip('.').lower()]
    raise TargetError('onbekend formaat')


def parse_targets(text):
    """Geeft (unieke targets in volgorde, lijst met fouten)."""
    seen, out, errors = set(), [], []
    for token in re.split(r'[\s,;]+', (text or '').strip()):
        if not token or token.startswith('#'):
            continue
        try:
            for t in expand(token):
                if t not in seen:
                    seen.add(t)
                    out.append(t)
        except TargetError as e:
            errors.append(f'{token}: {e}')
        if len(out) > MAX_TARGETS:
            errors.append(f'Maximaal {MAX_TARGETS} targets per keer')
            return out[:MAX_TARGETS], errors
    return out, errors
