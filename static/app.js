'use strict';

/* ======================== helpers ======================== */

const $ = (sel, root = document) => root.querySelector(sel);

/** Element-builder; tekst gaat altijd via textNodes (bestandsnamen komen van vreemde servers). */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** replaceChildren die null/false overslaat, zodat `cond && h(...)` veilig is. */
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

async function api(method, url, body) {
  const opts = { method, headers: { 'X-SMBB': '1' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let json;
  try { json = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (json.status !== 'ok') throw new Error(json.message || 'Onbekende fout');
  return json.data;
}

const qs = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null && v !== '')).toString();

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} bytes`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ${u[i]}`;
}

const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const joinPath = (...parts) => parts.filter(Boolean).join('\\');
const uncPath = (host, share, path) => `\\\\${host}${share ? `\\${share}` : ''}${path ? `\\${path}` : ''}`;

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

/* ======================== iconen (16x16 pixel-art) ======================== */

const PAGE = '<path d="M2.5 .5h7l4 4v11h-11z" fill="#fff" stroke="#000"/><path d="M9.5 .5v4h4" fill="#c0c0c0" stroke="#000"/>';
const FOLDER = '<path d="M.5 3.5l1-1h4l1 1h8v11H.5z" fill="#ffe36b" stroke="#6b5800"/><path d="M1 5.5h14" stroke="#fff3b0"/>';
const COMPUTER = '<rect x="1.5" y=".5" width="13" height="10" fill="#c0c0c0" stroke="#000"/><rect x="3" y="2" width="10" height="7" fill="#008080"/><path d="M3 2h10v1H3z" fill="#004040"/><rect x="5" y="11" width="6" height="1" fill="#808080"/><rect x=".5" y="12.5" width="15" height="3" fill="#c0c0c0" stroke="#000"/><path d="M11 14h3" stroke="#00b000"/>';
const ICONS = {
  file: PAGE,
  doc: `${PAGE}<path d="M4 7h7M4 9h7M4 11h7M4 13h5" stroke="#000080"/>`,
  code: `${PAGE}<path d="M6 7 4 9.5 6 12M9 7l2 2.5L9 12" stroke="#0000c0" fill="none"/>`,
  terminal: `${PAGE}<rect x="3" y="6" width="9" height="8" fill="#000"/><path d="M4 8h1v1h1v1H5v1H4zM7 11h3v1H7z" fill="#ffb000"/>`,
  exec: '<rect x=".5" y="2.5" width="15" height="12" fill="#fff" stroke="#000"/><rect x="1" y="3" width="14" height="3" fill="#000080"/><rect x="12" y="3.5" width="2" height="2" fill="#c0c0c0"/><rect x="3" y="8" width="4" height="4" fill="#ff0000"/><rect x="9" y="8" width="4" height="4" fill="#c0c0c0" stroke="#808080"/>',
  keyfile: `${PAGE}<path d="M3.5 7.5h4v4h-4z" fill="#ffd700" stroke="#000"/><path d="M7 9h5v2h-1v1h-1v-1H7z" fill="#ffd700"/><path d="M7.5 9.5h4" stroke="#000"/>`,
  key: '<path d="M.5 5.5h6v6h-6z" fill="#ffd700" stroke="#000"/><rect x="2" y="7" width="3" height="3" fill="#fff" stroke="#000"/><path d="M6.5 7.5h9v2h-2v2h-2v-2h-1v1h-2v-1h-2z" fill="#ffd700" stroke="#000"/>',
  database: '<path d="M2.5 3.5v9c0 1 2.5 2 5.5 2s5.5-1 5.5-2v-9" fill="#b8b8ff" stroke="#000"/><ellipse cx="8" cy="3.5" rx="5.5" ry="2" fill="#e0e0ff" stroke="#000"/><path d="M2.5 8c0 1 2.5 2 5.5 2s5.5-1 5.5-2" fill="none" stroke="#000"/>',
  archive: '<rect x="2.5" y=".5" width="11" height="15" fill="#ffff9a" stroke="#000"/><path d="M7 1h2v1H7zM8 2h1v1H8zM7 3h1v1H7zM8 4h1v1H8zM7 5h1v1H7zM8 6h1v1H8z" fill="#000"/><rect x="6.5" y="7.5" width="3" height="4" fill="#c0c0c0" stroke="#000"/>',
  image: '<rect x=".5" y="1.5" width="15" height="13" fill="#fff" stroke="#000"/><path d="M1 14l5-6 3 4 2-2 4 4z" fill="#008000"/><rect x="11" y="3" width="3" height="3" fill="#ffd700"/>',
  link: `${PAGE}<rect x=".5" y="9.5" width="6" height="6" fill="#fff" stroke="#000"/><path d="M2 14l3-3M3 11h2v2" stroke="#000" fill="none"/>`,
  folder: FOLDER,
  up: `${FOLDER}<path d="M8 13V7M5 10l3-3 3 3" stroke="#000" stroke-width="1.5" fill="none"/>`,
  computer: COMPUTER,
  addhost: `${COMPUTER}<rect x="8" y="6" width="8" height="8" fill="#fff"/><path d="M12 7v6M9 10h6" stroke="#008000" stroke-width="2"/>`,
  drive: '<rect x=".5" y="4.5" width="15" height="7" fill="#c0c0c0" stroke="#000"/><path d="M1 5h14" stroke="#fff"/><rect x="11" y="8" width="3" height="1" fill="#00c000"/><path d="M8 12v3M3 15.5h10" stroke="#000"/>',
  printer: '<rect x="3.5" y=".5" width="9" height="6" fill="#fff" stroke="#000"/><rect x=".5" y="6.5" width="15" height="6" fill="#c0c0c0" stroke="#000"/><rect x="3.5" y="11.5" width="9" height="4" fill="#fff" stroke="#000"/>',
  lock: '<path d="M5.5 7.5v-3a2.5 2.5 0 0 1 5 0v3" fill="none" stroke="#000"/><rect x="3.5" y="7.5" width="9" height="7" fill="#ffd700" stroke="#000"/><rect x="7.5" y="10" width="1" height="2" fill="#000"/>',
  network: '<circle cx="8" cy="8" r="7" fill="#3a7bd5" stroke="#000"/><path d="M4 3h3v2H5v2H3V5h1zM9 9h4v2h-2v3H9zM10 3h2v1h1v2h-2V5h-1z" fill="#00a000"/>',
  netlink: '<rect x=".5" y="3.5" width="7" height="5" fill="#c0c0c0" stroke="#000"/><rect x="8.5" y="7.5" width="7" height="5" fill="#c0c0c0" stroke="#000"/><rect x="2" y="5" width="4" height="2" fill="#008080"/><rect x="10" y="9" width="4" height="2" fill="#008080"/><path d="M4 9v4h4" stroke="#000" fill="none"/>',
  scan: '<circle cx="8" cy="8" r="7" fill="#d0f0d0" stroke="#004000"/><circle cx="8" cy="8" r="4.5" fill="none" stroke="#008000" stroke-width="1"/><circle cx="8" cy="8" r="2" fill="none" stroke="#008000" stroke-width="1"/><path d="M8 8l5.5-2.5" stroke="#008000" stroke-width="1.8"/><circle cx="8" cy="8" r="1.2" fill="#004000"/>',
  stop: '<path d="M3 3l10 10M13 3L3 13" stroke="#800000" stroke-width="4"/><path d="M3 3l10 10M13 3L3 13" stroke="#ff0000" stroke-width="2.5"/>',
  refresh: '<path d="M13 8A5 5 0 1 1 11.5 4.4" fill="none" stroke="#008000" stroke-width="2"/><path d="M9 1h6v6z" fill="#008000"/>',
  open: `${FOLDER}<path d="M2.5 14.5l2-7h11l-2 7z" fill="#fff3b0" stroke="#6b5800"/>`,
  download: '<rect x=".5" y=".5" width="15" height="15" fill="#303030" stroke="#000"/><rect x="3" y="1" width="9" height="5" fill="#c0c0c0"/><rect x="9" y="2" width="2" height="3" fill="#303030"/><rect x="2" y="8" width="12" height="7" fill="#fff"/><path d="M4 10h8M4 12h8" stroke="#000080"/>',
  copy: '<path d="M.5 .5h8v10h-8z" fill="#fff" stroke="#000"/><path d="M5.5 4.5h9v11h-9z" fill="#fff" stroke="#000"/><path d="M7 7h6M7 9h6M7 11h6M7 13h4" stroke="#000080"/>',
  info: '<circle cx="8" cy="8" r="7" fill="#fff" stroke="#000080"/><rect x="7" y="3" width="2" height="2" fill="#000080"/><rect x="7" y="6" width="2" height="7" fill="#000080"/>',
  alert: '<circle cx="8" cy="8" r="7" fill="#ff0000" stroke="#800000"/><path d="M5 5l6 6M11 5l-6 6" stroke="#fff" stroke-width="2"/>',
  warn: '<path d="M8 .5l7.5 14.5H.5z" fill="#ffff00" stroke="#000"/><rect x="7" y="5" width="2" height="6" fill="#000"/><rect x="7" y="12" width="2" height="2" fill="#000"/>',
  question: '<circle cx="8" cy="8" r="7" fill="#fff" stroke="#000080"/><path d="M5.5 6a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .7-1 1.4V10.5" fill="none" stroke="#000080" stroke-width="2"/><rect x="7" y="12" width="2" height="2" fill="#000080"/>',
  nofolder: `${FOLDER}<circle cx="11.5" cy="11.5" r="3.6" fill="#fff" stroke="#e00000" stroke-width="1.6"/><path d="M9 9l5 5" stroke="#e00000" stroke-width="1.6"/>`,
  newfolder: `${FOLDER}<path d="M12 7v6M9 10h6" stroke="#008000" stroke-width="2"/>`,
  newfile: `${PAGE}<path d="M8 7v6M5 10h6" stroke="#008000" stroke-width="2"/>`,
  upload: '<path d="M8 1l6 6h-4v5H6V7H2z" fill="#008000" stroke="#004000"/><path d="M1.5 13.5h13v2h-13z" fill="#c0c0c0" stroke="#000"/>',
  cut: '<circle cx="4" cy="12.5" r="2.5" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="12" cy="12.5" r="2.5" fill="none" stroke="#000" stroke-width="1.5"/><path d="M5.5 10.5L11 1M10.5 10.5L5 1" stroke="#404040" stroke-width="1.5"/>',
  paste: '<rect x="1.5" y="2.5" width="10" height="13" fill="#c08040" stroke="#000"/><rect x="4" y="1" width="5" height="3" fill="#c0c0c0" stroke="#000"/><path d="M6.5 6.5h8v9h-8z" fill="#fff" stroke="#000"/><path d="M8 9h5M8 11h5M8 13h3" stroke="#000080"/>',
  trash: '<path d="M3.5 4.5h9l-1 11h-7z" fill="#c0c0c0" stroke="#000"/><path d="M2.5 2.5h11v2h-11z" fill="#808080" stroke="#000"/><path d="M6 7v6M8 7v6M10 7v6" stroke="#606060"/>',
  edit: '<path d="M1.5 14.5l1-4 8-8 3 3-8 8z" fill="#ffd700" stroke="#000"/><path d="M2 14l1-3 2 2z" fill="#f0c090"/>',
  user: '<circle cx="8" cy="4.5" r="3.5" fill="#f0c090" stroke="#000"/><path d="M1.5 15.5c0-4 3-6 6.5-6s6.5 2 6.5 6z" fill="#000080" stroke="#000"/>',
  anon: '<circle cx="8" cy="4.5" r="3.5" fill="#c0c0c0" stroke="#000"/><path d="M1.5 15.5c0-4 3-6 6.5-6s6.5 2 6.5 6z" fill="#808080" stroke="#000"/>',
  palette: '<path d="M8 .5a7.5 7 0 1 0 0 14c1.5 0 1.5-1.5.5-2.5s0-2.5 1.5-2.5h3a2.5 2.5 0 0 0 2.5-2.5C15.5 3.5 12 .5 8 .5z" fill="#e0c090" stroke="#000"/><rect x="3" y="5" width="2" height="2" fill="#f00"/><rect x="6" y="2" width="2" height="2" fill="#00f"/><rect x="10" y="3" width="2" height="2" fill="#0a0"/><rect x="3" y="9" width="2" height="2" fill="#ff0"/>',
  winlogo: '<path d="M1 3h6v5H1z" fill="#ff0000"/><path d="M8 2h6v5H8z" fill="#00a000"/><path d="M1 9h6v5H1z" fill="#0000ff"/><path d="M8 8h6v5H8z" fill="#ffd700"/>',
  shutdown: '<rect x=".5" y="2.5" width="15" height="11" fill="#c0c0c0" stroke="#000"/><rect x="2" y="4" width="12" height="8" fill="#000080"/><circle cx="8" cy="8" r="2.5" fill="none" stroke="#ffff00"/>',
  check: '<path d="M3 8l3 3 7-7" stroke="#000" stroke-width="2" fill="none"/>',
  back: '<path d="M4 8h9M8 4l-4 4 4 4" stroke="#000080" stroke-width="2" fill="none"/>',
  forward: '<path d="M3 8h9M8 4l4 4-4 4" stroke="#000080" stroke-width="2" fill="none"/>',
  hash: '<rect x="1" y="1" width="14" height="14" rx="1" fill="#fff8e0" stroke="#000"/><path d="M5 4v8M11 4v8M3 6h10M3 10h10" stroke="#804000" stroke-width="1.5" fill="none"/>',
  star: '<path d="M8 1l1.8 5H15l-4.4 3.2 1.7 5.3L8 11.5l-4.3 3 1.7-5.3L1 6h5.2z" fill="#ffd700" stroke="#b8860b"/>',
  search: '<circle cx="6" cy="6" r="4.5" fill="#bfe4ff" stroke="#000"/><path d="M3.5 5a3 3 0 0 1 2-2" stroke="#fff" fill="none"/><path d="M9.5 9.5l5 5" stroke="#804000" stroke-width="2.5"/>',
  'w-min': '<rect x="1" y="5" width="6" height="2" fill="#000"/>',
  'w-max': '<rect x=".5" y=".5" width="8" height="6" fill="none" stroke="#000"/><rect x="0" y="0" width="9" height="2" fill="#000"/>',
  'w-close': '<path d="M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0z" fill="#000"/>',
};
const ICON_BOX = { 'w-min': '0 0 8 7', 'w-max': '0 0 9 7', 'w-close': '0 0 8 7' };

function icon(name, cls) {
  const span = document.createElement('span');
  span.className = `i${cls ? ` ${cls}` : ''}`;
  // alleen vaste, eigen SVG's
  span.innerHTML = `<svg viewBox="${ICON_BOX[name] || '0 0 16 16'}" shape-rendering="crispEdges">${ICONS[name] || ICONS.file}</svg>`;
  return span;
}

/* ======================== bestandscategorieën ======================== */

/** Volgorde = prioriteit (eerste match wint). Kleuren staan in style.css als --c-<key>. */
const CATEGORIES = [
  { key: 'dir', label: 'Map', icon: 'folder' },
  { key: 'secret', label: 'Gevoelig', icon: 'keyfile',
    re: /(passw|wachtw|secret|credential|creds?[._-]|\.kdbx?$|unattend|sysprep|web\.config$|id_(rsa|dsa|ecdsa|ed25519)|\.pem$|\.pfx$|\.p12$|\.key$|\.ppk$|\.ovpn$|\.rdp$|groups\.xml$|ntds\.dit|\.htpasswd$|^\.env$|\.git-credentials$|\.vnc$|^(sam|system|security)$)/i },
  { key: 'exec', label: 'Uitvoerbaar', icon: 'exec', re: /\.(exe|dll|sys|msi|msp|msix|appx|com|scr|cpl|ocx|drv|jar|hta|elf|bin|so|apk|run|appimage)$/i },
  { key: 'script', label: 'Script', icon: 'terminal', re: /\.(ps1|psm1|psd1|bat|cmd|vbs|vbe|js|jse|wsf|wsh|sh|bash|zsh|py|pl|rb|php|lua|ahk|au3)$/i },
  { key: 'config', label: 'Config / code', icon: 'code', re: /\.(config|conf|cfg|ini|inf|xml|json|ya?ml|toml|reg|properties|policy|pol|admx|adml|cs|java|c|h|cpp|hpp|go|rs|ts|aspx?|jsp|ascx|asmx|sql|vb|csproj|sln|tf)$/i },
  { key: 'data', label: 'Database / backup', icon: 'database', re: /\.(mdb|accdb|sqlite3?|db|mdf|ldf|ndf|dbf|bak|old|orig|backup|bkf|dmp|dump|edb|pst|ost)$/i },
  { key: 'archive', label: 'Archief / image', icon: 'archive', re: /\.(zip|7z|rar|tar|gz|tgz|bz2|xz|zst|cab|iso|img|vhdx?|vmdk|vdi|ova|ovf|wim|dmg)$/i },
  { key: 'doc', label: 'Document', icon: 'doc', re: /\.(txt|log|md|csv|tsv|docx?|docm|xlsx?|xlsm|pptx?|pdf|rtf|odt|ods|odp|msg|eml|one|vsdx?|html?)$/i },
  { key: 'media', label: 'Media', icon: 'image', re: /\.(png|jpe?g|gif|bmp|webp|ico|svg|tiff?|heic|mp[34]|m4a|wav|avi|mkv|mov|wmv|flac)$/i },
  { key: 'link', label: 'Snelkoppeling', icon: 'link', re: /\.(lnk|url|website|symlink)$/i },
  { key: 'other', label: 'Overig', icon: 'file' },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const CAT_ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, i]));
const INLINE_IMG = /\.(png|jpe?g|gif|bmp|webp|ico)$/i;

// Windows-bestandsattributen (FILE_ATTRIBUTE_*)
const ATTR = { READONLY: 0x1, HIDDEN: 0x2, SYSTEM: 0x4, REPARSE: 0x400, COMPRESSED: 0x800, OFFLINE: 0x1000, ENCRYPTED: 0x4000 };
const ATTR_BADGES = [
  [ATTR.READONLY, 'R', 'ro', 'Alleen-lezen'],
  [ATTR.HIDDEN, 'H', 'hid', 'Verborgen'],
  [ATTR.SYSTEM, 'S', 'sys', 'Systeembestand'],
  [ATTR.REPARSE, 'L', 'lnk', 'Symlink / junction (reparse point)'],
  [ATTR.COMPRESSED, 'C', 'cmp', 'Gecomprimeerd'],
  [ATTR.ENCRYPTED, 'E', 'enc', 'Versleuteld (EFS)'],
  [ATTR.OFFLINE, 'O', 'off', 'Offline'],
];

function category(entry) {
  if (entry._cat) return entry._cat;
  let cat = CAT_BY_KEY.other;
  if (entry.dir) cat = CAT_BY_KEY.dir;
  else if (entry.attrs & ATTR.REPARSE) cat = CAT_BY_KEY.link;
  else cat = CATEGORIES.find((c) => c.re && c.re.test(entry.name)) || cat;
  entry._cat = cat;
  return cat;
}

const isHidden = (e) => Boolean(e.attrs & ATTR.HIDDEN) || e.name.startsWith('.');
const extOf = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };

/* ======================== state ======================== */

const S = {
  creds: [],
  notes: {}, // {ip: text}
  bookmarks: [], // [{id, label, host, share, path}]
  bmOpen: true, // favorieten-sectie in de boom uitgeklapt
  netClosed: false, // netwerkomgeving-sectie ingeklapt
  fileSel: new Set(), // geselecteerde bestandsnamen in huidige share-weergave
  fileAnchor: null,
  hosts: [],
  job: null,
  expanded: new Set(JSON.parse(localStorageGet('smbb.expanded') || '[]')),
  hostFilter: '',
  onlyReadable: localStorageGet('smbb.onlyReadable') === '1',
  showAll: localStorageGet('smbb.showAll') === '1',
  showHidden: localStorageGet('smbb.showHidden') !== '0',
  rawHosts: [], // zoals de server ze levert; S.hosts is dezelfde lijst gezien door de credential van het tabblad
  tabs: [],
  activeTab: 0,
  view: { kind: 'root' }, // root | host {host} | share {host, share, path}
  entries: [],
  loading: false,
  error: null,
  listFilter: '',
  catFilter: null,
  sort: { key: 'name', dir: 1 },
  selected: null,
  list: { items: [], keyOf: null, open: null, menu: null },
  reqSeq: 0,
  dirCache: new Map(),
  treeOpen: new Set(),
  hostSel: new Set(),
  hostAnchor: null,
  history: [],
  historyPos: -1,
  _histNavFlag: false,
  statusMsg: '',
  clip: null, // geknipt of gekopieerd bestand/map: { mode, host, share, path, name, dir, cred }
};

const credById = (id) => S.creds.find((c) => c.id === id);
const hostByIp = (ip) => S.hosts.find((x) => x.ip === ip);

/* ======================== tabbladen (workspaces) ======================== */

// Elk tabblad is een workspace met een eigen credential en locatie. De velden van het
// actieve tabblad staan direct in S; bij wisselen worden ze in het tabblad-object bewaard.
const TAB_FIELDS = ['view', 'entries', 'loading', 'error', 'listFilter', 'catFilter', 'sort', 'selected', 'list', 'reqSeq', 'dirCache', 'treeOpen', 'hostSel', 'hostAnchor', 'history', 'historyPos'];
const CRED_COLORS = ['#000080', '#008000', '#800000', '#808000', '#800080', '#008080', '#c05800', '#404040'];

const activeTab = () => S.tabs[S.activeTab];
const curCred = () => activeTab()?.credId || null;
const credColor = (id) => {
  const i = S.creds.findIndex((c) => c.id === id);
  return i < 0 ? '#808080' : CRED_COLORS[i % CRED_COLORS.length];
};
const credSwatch = (id) => h('span', { class: 'cred-swatch', style: { background: credColor(id) } });

function newTabState(credId, view = { kind: 'root' }, name = null) {
  return {
    credId, view, name, entries: [], loading: false, error: null, listFilter: '', catFilter: null,
    dirCache: new Map(), // submappen per pad, voor de boom (hangt af van de credential)
    treeOpen: new Set(), // uitgeklapte shares/mappen in de boom
    hostSel: new Set(), // geselecteerde hosts (Ctrl/Shift-klik), in boom en hostoverzicht
    hostAnchor: null,
    sort: { key: 'name', dir: 1 }, selected: null, reqSeq: 0, stale: view.kind === 'share',
    list: { items: [], keyOf: (x) => x, open: () => {}, menu: () => [] },
    history: [view], historyPos: 0,
  };
}

function stashTab() {
  const t = activeTab();
  if (t) for (const f of TAB_FIELDS) t[f] = S[f];
}

function unstashTab() {
  const t = activeTab();
  for (const f of TAB_FIELDS) S[f] = t[f];
  $('#list-filter').value = S.listFilter;
}

function saveTabs() {
  if (!S.tabs.length) return;
  const tabs = S.tabs.map((t, i) => ({ credId: t.credId, name: t.name, view: i === S.activeTab ? S.view : t.view }));
  localStorageSet('smbb.tabs', JSON.stringify({ active: S.activeTab, tabs }));
}

function restoreTabs() {
  let saved = null;
  try { saved = JSON.parse(localStorageGet('smbb.tabs') || 'null'); } catch { /* ignore */ }
  const valid = (id) => (credById(id) ? id : S.creds[0]?.id || null);
  const list = saved?.tabs?.length ? saved.tabs : [{ credId: null }];
  S.tabs = list.map((t) => newTabState(valid(t.credId), t.view?.kind ? t.view : { kind: 'root' }, t.name || null));
  S.activeTab = Math.max(0, Math.min(saved?.active || 0, S.tabs.length - 1));
  unstashTab();
}

/** Tabbladen met een verwijderde (of nog geen) credential krijgen de eerste beschikbare. */
function fixTabCreds() {
  for (const t of S.tabs) if (!credById(t.credId)) t.credId = S.creds[0]?.id || null;
}

function activateTab(i) {
  S.activeTab = i;
  unstashTab();
  applyHostCtx();
  renderAll();
  const t = activeTab();
  if (t.stale) {
    t.stale = false;
    browse({ ...S.view }, S.selected);
  }
}

function switchTab(i) {
  if (i === S.activeTab || !S.tabs[i]) return;
  stashTab();
  activateTab(i);
}

function addTab(credId, view = { kind: 'root' }) {
  stashTab();
  S.tabs.push(newTabState(credId, view));
  activateTab(S.tabs.length - 1);
}

function closeTab(i) {
  if (S.tabs.length < 2) return;
  stashTab();
  S.tabs.splice(i, 1);
  let next = S.activeTab;
  if (i < next) next -= 1;
  else if (i === next) next = Math.min(i, S.tabs.length - 1);
  activateTab(next);
}

async function renameTab(i) {
  const t = S.tabs[i];
  const name = await promptBox('Naam voor dit tabblad (leeg = naam van de credential):', {
    title: 'Tabblad hernoemen', value: t.name || credById(t.credId)?.label || '',
  });
  if (name === null) return;
  t.name = name.trim() || null;
  renderTabs();
  renderTitle();
}

function closeOtherTabs(i) {
  stashTab();
  S.tabs = [S.tabs[i]];
  activateTab(0);
}

/** Wissel de credential van het actieve tabblad en laad de huidige locatie opnieuw. */
function setTabCred(credId) {
  activeTab().credId = credId;
  S.dirCache = new Map();
  applyHostCtx();
  if (S.view.kind === 'share') browse({ ...S.view }, S.selected);
  else renderAll();
}

/**
 * Een host zoals de credential van het tabblad hem ziet. Scanresultaten worden per credential
 * bewaard (host.results[credId]); poort-dicht en hostinformatie gelden voor iedereen.
 */
function hostCtx(host, credId) {
  // Een host in de wachtrij houdt zijn vorige status; 'queued' is alleen een vlag.
  const queued = host.status === 'queued';
  const top = queued ? (host.prev_status || 'pending') : host.status;
  const r = host.results?.[credId];
  if (r && top !== 'closed') return { ...host, ...r, cred_id: credId, queued, status: r.status };
  let status = 'unscanned';
  if (top === 'closed') status = 'closed';
  else if (top === 'pending' || !top) status = 'pending';
  return {
    ...host, cred_id: credId, queued, status, shares: [], share_error: null, guest: false, scanned_at: null,
    error: status === 'closed' ? host.error : null,
  };
}

const statusText = (x) => {
  if (x.queued) return STATUS_TEXT.queued;
  if (x.status === 'closed' && x.error?.startsWith('Naam ')) return 'Naam niet gevonden (DNS)';
  return STATUS_TEXT[x.status] || x.status;
};

function applyHostCtx() {
  S.hosts = S.rawHosts.map((x) => hostCtx(x, curCred()));
}

function tabLocation(view) {
  if (view.kind === 'root') return 'Netwerkomgeving';
  if (view.kind === 'host') return view.host;
  const last = view.path ? view.path.split('\\').pop() : '';
  return `${view.host}\\${view.share}${last ? `\\...\\${last}` : ''}`;
}

function renderTabs() {
  fill($('#tabs'),
    S.tabs.map((t, i) => {
      const active = i === S.activeTab;
      const view = active ? S.view : t.view;
      const cred = credById(t.credId);
      const who = cred ? (cred.username ? `${cred.domain ? `${cred.domain}\\` : ''}${cred.username}` : 'null session') : '';
      return h('div', {
        class: `tab ${active ? 'active' : ''}`,
        title: `${t.name ? `${t.name}\n` : ''}${cred ? `${cred.label} (${who})` : 'Geen credential'}\n${view.kind === 'root' ? 'Netwerkomgeving' : uncPath(view.host, view.share, view.path)}\n\nDubbelklik of rechtsklik om te hernoemen, middelste muisknop sluit.`,
        onmousedown: (e) => {
          if (e.button === 1) { e.preventDefault(); closeTab(i); } else if (e.button === 0) switchTab(i);
        },
        ondblclick: (e) => { if (!e.target.closest('button')) renameTab(i); },
        oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, tabMenu(i)); },
      },
      credSwatch(t.credId),
      icon(cred && !cred.username ? 'anon' : 'user'),
      h('span', { class: 'tab-cred' }, t.name || (cred ? cred.label : '(geen credential)')),
      t.name && cred && h('span', { class: 'tab-user' }, `(${cred.label})`),
      h('span', { class: 'tab-loc' }, tabLocation(view)),
      S.tabs.length > 1 && h('button', {
        class: 'tab-close', title: 'Tabblad sluiten',
        onmousedown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); closeTab(i); },
      }, icon('w-close')));
    }),
    h('button', {
      class: 'tab-new', title: 'Nieuw tabblad met een (andere) credential',
      onmousedown: (e) => e.stopPropagation(),
      onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom, newTabMenu()); },
    }, '+'));
  saveTabs();
}

/** Menu om de huidige (of een gegeven) locatie in een nieuw tabblad te openen. */
function newTabMenu(view = S.view) {
  const manage = { label: 'Credentials beheren...', iconName: 'key', action: () => openCredsDialog() };
  if (!S.creds.length) return [manage];
  return [
    ...S.creds.map((c) => ({ label: `Nieuw tabblad als ${c.label}`, iconName: c.username ? 'user' : 'anon', action: () => addTab(c.id, { ...view }) })),
    'sep',
    manage,
  ];
}

function tabMenu(i) {
  const t = S.tabs[i];
  return [
    { label: 'Naam wijzigen...', iconName: 'edit', action: () => renameTab(i) },
    { label: 'Dupliceren', action: () => addTab(t.credId, { ...(i === S.activeTab ? S.view : t.view) }) },
    'sep',
    ...S.creds.map((c) => ({ label: `Credential: ${c.label}`, checked: c.id === t.credId, action: () => { switchTab(i); setTabCred(c.id); } })),
    'sep',
    { label: 'Sluiten', disabled: S.tabs.length < 2, action: () => closeTab(i) },
    { label: 'Andere tabbladen sluiten', disabled: S.tabs.length < 2, action: () => closeOtherTabs(i) },
  ];
}

async function loadState() {
  const [d, notesData, bmData] = await Promise.all([
    api('GET', '/api/state'),
    api('GET', '/api/notes').catch(() => ({})),
    api('GET', '/api/bookmarks').catch(() => []),
  ]);
  S.creds = d.credentials;
  S.rawHosts = d.hosts.hosts;
  S.hostsRev = d.hosts.rev;
  S.job = d.job;
  S.notes = notesData || {};
  S.bookmarks = Array.isArray(bmData) ? bmData : [];
  if (!S.tabs.length) restoreTabs();
  else fixTabCreds();
  applyHostCtx();
  renderAll();
  const t = activeTab();
  if (t.stale) { t.stale = false; browse({ ...S.view }, S.selected); }
  if (S.job?.running) pollJob();
}

/** Vernieuw alleen de credentiallijst — geen browse(), geen pollJob(). Veilig zonder netwerk. */
async function loadCreds() {
  const d = await api('GET', '/api/state');
  S.creds = d.credentials;
  fixTabCreds();
  applyHostCtx();
  renderAll();
}

const ipSortKey = (ip) => (/^\d+\.\d+\.\d+\.\d+$/.test(ip) ? `0${ip.split('.').map((p) => p.padStart(3, '0')).join('.')}` : `1${ip}`);

/**
 * Haal alleen gewijzigde hosts op (sinds de laatst bekende revisie) en voeg ze samen.
 * Geeft false terug als er niets veranderd is, zodat er niet onnodig opnieuw getekend wordt.
 */
async function fetchHosts() {
  const d = await api('GET', `/api/hosts?since=${S.hostsRev ?? ''}`);
  S.hostsRev = d.rev;
  if (d.full) {
    S.rawHosts = d.hosts;
    return true;
  }
  if (!d.hosts.length) return false;
  const index = new Map(S.rawHosts.map((x, i) => [x.ip, i]));
  let added = false;
  for (const host of d.hosts) {
    if (index.has(host.ip)) S.rawHosts[index.get(host.ip)] = host;
    else { S.rawHosts.push(host); added = true; }
  }
  if (added) S.rawHosts.sort((a, b) => (ipSortKey(a.ip) < ipSortKey(b.ip) ? -1 : 1));
  return true;
}

async function loadHosts(onlyIfChanged = false) {
  const changed = await fetchHosts();
  if (onlyIfChanged && !changed) return;
  applyHostCtx();
  renderTree();
  if (S.view.kind !== 'share') renderList();
  renderStatus();
}

/* ======================== meldingen ======================== */

let statusTimer;
function notify(msg) {
  S.statusMsg = msg;
  renderStatus();
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { S.statusMsg = ''; renderStatus(); }, 6000);
}

/** Blijvende statusmelding tijdens een langere actie; null wist hem. */
function setStatusMsg(msg) {
  clearTimeout(statusTimer);
  S.statusMsg = msg || '';
  renderStatus();
}

function errorBox(msg, title = 'SMBrowser95') {
  return msgBox(msg, { title, iconName: 'alert' });
}

/* ======================== navigatie ======================== */

function setView(view) {
  const same = JSON.stringify(view) === JSON.stringify(S.view);
  S.view = view;
  if (!same) {
    if (!S._histNavFlag) {
      S.history = S.history.slice(0, S.historyPos + 1).concat([view]);
      if (S.history.length > 50) S.history.shift();
      S.historyPos = S.history.length - 1;
    }
    S.listFilter = '';
    $('#list-filter').value = '';
    S.catFilter = null;
    S.sort = { key: 'name', dir: 1 };
    S.selected = null;
    S.fileSel = new Set();
    S.fileAnchor = null;
  }
}

function navBack() {
  if (S.historyPos <= 0) return;
  S.historyPos--;
  const v = S.history[S.historyPos];
  S._histNavFlag = true;
  if (v.kind === 'share') browse(v);
  else if (v.kind === 'host') openHost(v.host);
  else goRoot();
  S._histNavFlag = false;
}

function navForward() {
  if (S.historyPos >= S.history.length - 1) return;
  S.historyPos++;
  const v = S.history[S.historyPos];
  S._histNavFlag = true;
  if (v.kind === 'share') browse(v);
  else if (v.kind === 'host') openHost(v.host);
  else goRoot();
  S._histNavFlag = false;
}

function goRoot() {
  setView({ kind: 'root' });
  renderAll();
}

function openHost(ip) {
  setView({ kind: 'host', host: ip });
  if (!S.expanded.has(ip)) toggleExpand(ip, true);
  renderAll();
}

function openShare(ip, share, path = '') {
  browse({ kind: 'share', host: ip, share, path });
}

async function browse(view, selectName) {
  setView(view);
  if (selectName) S.selected = selectName;
  S.loading = true;
  S.error = null;
  S.entries = [];
  renderAll();
  const tab = activeTab();
  const seq = ++S.reqSeq;
  let entries = [];
  let error = null;
  try {
    entries = (await api('GET', `/api/ls?${qs({ host: view.host, share: view.share, path: view.path, cred: curCred() })}`)).entries;
  } catch (e) {
    error = e.message;
  }
  // Is er intussen van tabblad gewisseld, dan hoort het resultaat bij het bewaarde tabblad.
  const target = activeTab() === tab ? S : tab;
  if (seq !== target.reqSeq) return;
  Object.assign(target, { entries, error, loading: false });
  if (!error) {
    // Houd de boom synchroon: deze map en alle bovenliggende mappen uitklappen.
    target.dirCache.set(treeKey(view.host, view.share, view.path), { dirs: dirsOf(entries) });
    const segs = view.path ? view.path.split('\\') : [];
    for (let i = 0; i <= segs.length; i++) target.treeOpen.add(treeKey(view.host, view.share, segs.slice(0, i).join('\\')));
    S.expanded.add(view.host);
  }
  else if (/ACCESS_DENIED/.test(error)) ACCESS.set(accessKey(tab.credId, view.host, view.share, view.path), 'denied');
  if (!error) probeAccess(view.host, view.share, view.path, ['', ...entries.filter((e) => e.dir).map((e) => e.name)], { force: true, credId: tab.credId });
  if (target !== S) return;
  renderList();
  renderStatus();
  renderToolbar();
  renderTree();
  $('#tree .tnode.sel')?.scrollIntoView({ block: 'nearest' });
}

function refresh() {
  S.dirCache = new Map();
  if (S.view.kind === 'share') browse({ ...S.view }, S.selected);
  else loadHosts().then(() => notify('Vernieuwd'));
}

function goUp() {
  const v = S.view;
  if (v.kind === 'share' && v.path) {
    const segs = v.path.split('\\');
    browse({ ...v, path: segs.slice(0, -1).join('\\') }, segs[segs.length - 1]);
  } else if (v.kind === 'share') {
    openHost(v.host);
    S.selected = v.share;
    renderList();
  } else if (v.kind === 'host') {
    goRoot();
    S.selected = v.host;
    renderList();
  }
}

/** Navigeer naar een getypt UNC-pad: \\host\share\map */
function goAddress(text) {
  const parts = text.trim().replace(/\//g, '\\').replace(/^\\+/, '').split('\\').filter(Boolean);
  if (!parts.length) { goRoot(); return; }
  const [host, share, ...rest] = parts;
  const known = hostByIp(host) || S.hosts.find((x) => (x.hostname || '').toLowerCase() === host.toLowerCase());
  if (!known) {
    errorBox(`Kan '\\\\${host}' niet vinden.\n\nVoeg de host eerst toe via Bestand > Targets toevoegen.`, host);
    renderAddress();
    return;
  }
  if (!share) openHost(known.ip);
  else openShare(known.ip, share, rest.join('\\'));
}

/* ======================== acties ======================== */

function selectedItem() {
  const { items, keyOf } = S.list;
  return items.find((it) => keyOf(it) === S.selected) || null;
}

function openSelected() {
  const it = selectedItem();
  if (it) S.list.open(it);
}

function fileParams(entry) {
  const { host, share, path } = S.view;
  return qs({ host, share, path: joinPath(path, entry.name), cred: curCred() });
}

function downloadEntry(entry) {
  if (!entry || entry.dir) return;
  const a = h('a', { href: `/api/download?${fileParams(entry)}` });
  document.body.append(a);
  a.click();
  a.remove();
  notify(`Download gestart: ${entry.name}`);
}

async function downloadSelectedFiles() {
  const v = S.view;
  const files = [...S.fileSel].filter((name) => {
    const e = S.entries.find((x) => x.name === name);
    return e && !e.dir;
  });
  if (!files.length) { notify('Geen bestanden geselecteerd (mappen worden overgeslagen).'); return; }
  notify(`ZIP samenstellen: ${files.length} bestand(en)...`);
  try {
    const resp = await fetch('/api/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: v.host, share: v.share, path: v.path || '', cred: curCred(), files }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      errorBox(j.message || `HTTP ${resp.status}`, 'Download mislukt');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'bestanden.zip' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify(`Download gereed: ${files.length} bestand(en).`);
  } catch (err) {
    errorBox(err.message, 'Download mislukt');
  }
}

async function openSearchDialog() {
  const v = S.view;
  const { body, foot, close, box } = dialog({ title: 'Bestanden zoeken', width: 440 });

  const hostInput = h('input', { type: 'text', class: 'dval', value: v.kind !== 'root' ? v.host : '', placeholder: 'bijv. 10.0.0.1', onkeydown: (e) => { if (e.key === 'Enter') doSearch(); } });
  const shareInput = h('input', { type: 'text', class: 'dval', value: v.kind === 'share' ? v.share : '', placeholder: 'bijv. C$', onkeydown: (e) => { if (e.key === 'Enter') doSearch(); } });
  const patternInput = h('input', { type: 'text', class: 'dval', value: '*.txt', placeholder: 'bijv. *.config of password*', onkeydown: (e) => { if (e.key === 'Enter') doSearch(); } });
  const pathInput = h('input', { type: 'text', class: 'dval', value: v.kind === 'share' ? (v.path || '') : '', placeholder: '(laat leeg voor root)' });

  const row = (label, ctrl) => [h('label', { class: 'dlab' }, label), ctrl];
  fill(body, h('div', { class: 'dform' },
    ...row('Host / IP:', hostInput),
    ...row('Share:', shareInput),
    ...row('Patroon:', patternInput),
    ...row('Startmap:', pathInput),
  ));

  const status = h('div', { style: { padding: '4px 8px', color: 'var(--navy)', minHeight: '18px', fontSize: '11px' } });
  const resultList = h('div', { style: { margin: '4px 8px 8px', maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--shadow)', background: '#fff' } });
  body.append(status, resultList);

  fill(foot,
    h('button', { class: 'btn', onclick: doSearch }, 'Zoeken'),
    h('button', { class: 'btn', onclick: close }, 'Sluiten'),
  );

  async function doSearch() {
    const host = hostInput.value.trim();
    const share = shareInput.value.trim();
    let pattern = patternInput.value.trim() || '*';
    const startPath = pathInput.value.trim();
    if (!host || !share) { fill(status, 'Vul een host en share in.'); return; }
    // Geen wildcards → behandel als substring-zoekopdracht
    if (!pattern.includes('*') && !pattern.includes('?')) pattern = `*${pattern}*`;
    fill(status, icon('scan'), ' Zoeken...');
    fill(resultList);
    try {
      const data = await api('POST', '/api/search', { host, share, pattern, path: startPath, cred: curCred() });
      const results = data.results || [];
      fill(status, `${results.length} resultaat/resultaten gevonden${data.truncated ? ' (afgekapt)' : ''}.`);
      if (!results.length) { fill(resultList, h('div', { style: { padding: '6px' } }, 'Geen resultaten.')); return; }
      fill(resultList, h('table', { class: 'files', style: { width: '100%', tableLayout: 'fixed', fontSize: '11px' } },
        h('thead', null, h('tr', null,
          h('th', { style: { width: '50%' } }, 'Naam'),
          h('th', { style: { width: '50%' } }, 'Pad'),
        )),
        h('tbody', null, results.map((r) => h('tr', {
          class: 'row',
          title: r.path,
          ondblclick: () => {
            close();
            const dir = r.dir ? r.path : r.path.includes('\\') ? r.path.slice(0, r.path.lastIndexOf('\\')) : '';
            browse({ kind: 'share', host, share, path: dir }, r.dir ? null : r.name);
          },
        },
          h('td', null, h('div', { class: 'fname' }, icon(r.dir ? 'folder' : category(r).icon), h('span', { class: 'n' }, r.name))),
          h('td', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.path),
        ))),
      ));
    } catch (err) {
      fill(status, `Fout: ${err.message}`);
    }
  }

  patternInput.select();
}

function currentUnc(item) {
  const v = S.view;
  if (v.kind === 'root') return item ? uncPath(item.ip) : '';
  if (v.kind === 'host') return uncPath(v.host, item?.name);
  return uncPath(v.host, v.share, joinPath(v.path, item?.name));
}

/**
 * Kopieer naar het klembord. navigator.clipboard werkt alleen via https of localhost; bij --expose over
 * http valt het terug op execCommand, en als laatste redmiddel op een venster met de tekst geselecteerd.
 */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Gekopieerd: ${text}`);
      return;
    } catch { /* terugvallen */ }
  }
  const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' }, readonly: true });
  ta.value = text;
  const keep = document.activeElement;
  document.body.append(ta);
  ta.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* geen klembord */ }
  ta.remove();
  keep?.focus?.();
  if (copied) { notify(`Gekopieerd: ${text}`); return; }
  promptBox('Kopiëren lukt niet automatisch in deze browser. Druk op Ctrl+C om te kopiëren:', { title: 'Kopiëren', value: text });
}

function toggleExpand(ip, open) {
  const shouldOpen = open ?? !S.expanded.has(ip);
  if (shouldOpen) S.expanded.add(ip); else S.expanded.delete(ip);
  localStorageSet('smbb.expanded', JSON.stringify([...S.expanded]));
  renderTree();
}

async function rescanHosts(ips, credId) {
  const cid = credId && credById(credId) ? credId : S.creds[0]?.id;
  if (!cid) { await errorBox('Voeg eerst een credential toe.'); openCredsDialog(); return; }
  try {
    S.job = await api('POST', '/api/scan', { ips, cred_id: cid, threads: Math.min(ips.length, 32) });
    renderStatus();
    renderToolbar();
    pollJob();
  } catch (e) { errorBox(e.message); }
}

/* ---------- meervoudige hostselectie ---------- */

/**
 * Verwerk een klik op een host. Ctrl/Cmd voegt toe of haalt weg, Shift selecteert een reeks
 * vanaf de vorige klik (in de volgorde `order`). Geeft true terug bij Ctrl/Shift: dan is de
 * klik alleen een selectie en wordt de host niet geopend.
 */
function clickFile(name, e, order) {
  const toggle = e.ctrlKey || e.metaKey;
  if (e.shiftKey && S.fileAnchor && order.includes(S.fileAnchor)) {
    const a = order.indexOf(S.fileAnchor);
    const b = order.indexOf(name);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    if (!toggle) S.fileSel = new Set();
    for (const x of range) S.fileSel.add(x);
  } else if (toggle) {
    if (S.fileSel.has(name)) S.fileSel.delete(name); else S.fileSel.add(name);
    S.fileAnchor = name;
  } else {
    S.fileSel = new Set([name]);
    S.fileAnchor = name;
  }
  S.selected = name;
  return toggle || e.shiftKey;
}

function clickHost(ip, e, order) {
  const toggle = e.ctrlKey || e.metaKey;
  if (e.shiftKey && S.hostAnchor && order.includes(S.hostAnchor)) {
    const a = order.indexOf(S.hostAnchor);
    const b = order.indexOf(ip);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    if (!toggle) S.hostSel = new Set();
    for (const x of range) S.hostSel.add(x);
  } else if (toggle) {
    if (S.hostSel.has(ip)) S.hostSel.delete(ip); else S.hostSel.add(ip);
    S.hostAnchor = ip;
  } else {
    S.hostSel = new Set([ip]);
    S.hostAnchor = ip;
  }
  S.selected = ip;
  return toggle || e.shiftKey;
}

function hostSelectionChanged() {
  renderTree();
  paintSelection();
  renderToolbar();
  renderStatus();
}

function clearHostSel() {
  S.hostSel = new Set();
  S.hostAnchor = null;
  hostSelectionChanged();
}

/** Hosts die in de huidige weergave nog niet met de credential van dit tabblad zijn geprobeerd. */
const unscannedIps = () => S.hosts.filter((x) => x.status === 'unscanned' && !x.queued).map((x) => x.ip);

async function loginHosts(ips) {
  const cred = credById(curCred());
  if (!cred) { await errorBox('Dit tabblad heeft nog geen credential.'); openCredsDialog(); return; }
  if (!ips.length) return;
  await rescanHosts(ips, cred.id);
  notify(`${ips.length} host(s) in de wachtrij om in te loggen als ${cred.label}`);
}

async function deleteHosts(ips) {
  if (ips.length === 1) { deleteHost(ips[0]); return; }
  const answer = await msgBox(`Weet u zeker dat u deze ${ips.length} hosts en de scanresultaten wilt verwijderen?`, { title: 'Hosts verwijderen', iconName: 'question', buttons: ['Ja', 'Nee'] });
  if (answer !== 'Ja') return;
  await api('POST', '/api/hosts/delete', { ips });
  if (ips.includes(S.view.host)) setView({ kind: 'root' });
  S.hostSel = new Set();
  await loadHosts();
  renderAll();
}

async function deleteHost(ip) {
  const answer = await msgBox(`Weet u zeker dat u '${ip}' en de scanresultaten wilt verwijderen?`, { title: 'Host verwijderen', iconName: 'question', buttons: ['Ja', 'Nee'] });
  if (answer !== 'Ja') return;
  await api('DELETE', `/api/hosts/${encodeURIComponent(ip)}`);
  if (S.view.host === ip) setView({ kind: 'root' });
  await loadHosts();
  renderAll();
}

async function cleanupClosed() {
  const d = await api('DELETE', '/api/hosts?status=closed');
  notify(`${d.deleted} onbereikbare host(s) verwijderd`);
  await loadHosts();
}

async function deleteAllHosts() {
  if (!S.rawHosts.length && !S.job?.running) return;
  const scanNote = S.job?.running ? '\n\nDe lopende scan en de wachtrij worden gestopt.' : '';
  const answer = await msgBox(
    `Alle ${S.rawHosts.length} hosts en scanresultaten wissen om schoon te beginnen?\n\nDit geldt voor iedereen die deze server gebruikt. Credentials blijven bewaard.${scanNote}`,
    { title: 'Alle hosts wissen', iconName: 'warn', buttons: ['Ja', 'Nee'] },
  );
  if (answer !== 'Ja') return;
  const d = await api('DELETE', '/api/hosts');
  stashTab();
  for (const t of S.tabs) Object.assign(t, newTabState(t.credId, { kind: 'root' }, t.name));
  unstashTab();
  setView({ kind: 'root' });
  await loadHosts();
  S.job = await api('GET', '/api/jobs/current');
  renderAll();
  notify(`${d.deleted} host(s) gewist`);
}

async function stopScan() {
  S.job = await api('POST', '/api/jobs/current/cancel');
  renderStatus();
}

function setPref(key, value) {
  S[key] = value;
  localStorageSet(`smbb.${key}`, value ? '1' : '0');
  renderAll();
}

/* ======================== scan-voortgang ======================== */

let polling = false;
async function pollJob() {
  if (polling) return;
  polling = true;
  let lastHosts = Date.now();
  try {
    while (true) {
      S.job = await api('GET', '/api/jobs/current');
      renderStatus();
      renderToolbar();
      if (!S.job?.running) break;
      if (Date.now() - lastHosts > 3000) { lastHosts = Date.now(); await loadHosts(true); }
      await new Promise((r) => setTimeout(r, 1500));
    }
    await loadHosts();
    const j = S.job;
    if (j) {
      const elsewhere = j.cred_id && j.cred_id !== curCred() ? ` Bekijk de resultaten in een tabblad als ${j.cred_label}.` : '';
      notify(`Scan als ${j.cred_label} ${j.cancelled ? 'gestopt' : 'voltooid'}: ${j.found} host(s) met SMB-toegang, ${j.done} gescand.${elsewhere}`);
    }
  } catch (e) {
    errorBox(`Scanstatus ophalen mislukt: ${e.message}`);
  } finally {
    polling = false;
    renderToolbar();
  }
}

/* ======================== chrome: titel, toolbar, adres, status ======================== */

function renderTitle() {
  const v = S.view;
  const where = v.kind === 'root' ? 'Netwerkomgeving' : currentUnc();
  const cred = credById(curCred());
  const title = `SMBrowser95 - ${cred ? `[${cred.label}] ` : ''}${where}`;
  $('#title-text').textContent = title;
  document.title = title;
}

function renderToolbar() {
  const sel = selectedItem();
  const v = S.view;
  const running = Boolean(S.job?.running);
  const tb = (iconName, label, onclick, opts = {}) => h('button', { class: 'tbtn', title: opts.title || label, disabled: opts.disabled, onclick }, icon(iconName), label);
  fill($('#toolbar'),
    tb('key', 'Credentials', () => openCredsDialog(), { title: 'Credentials beheren' }),
    tb('addhost', 'Targets', () => openTargetsDialog(), { title: 'IP-adressen of ranges toevoegen' }),
    tb('scan', 'Scannen', () => openScanDialog(), { title: running ? 'Scannen (sluit aan in de wachtrij)' : 'Scannen' }),
    tb('user', 'Inloggen', () => loginHosts([...S.hostSel]), {
      disabled: !S.hostSel.size || !curCred(),
      title: S.hostSel.size ? `Inloggen als ${credById(curCred())?.label || '...'} op ${S.hostSel.size} geselecteerde host(s)` : 'Selecteer eerst hosts (Ctrl/Shift-klik)',
    }),
    tb('stop', 'Stop', stopScan, { disabled: !running, title: 'Lopende scan stoppen' }),
    tb('trash', 'Wissen', deleteAllHosts, { disabled: !S.rawHosts.length && !running, title: 'Alle hosts en scanresultaten wissen (credentials blijven)' }),
    h('div', { class: 'tsep' }),
    tb('back', 'Terug', navBack, { disabled: S.historyPos <= 0, title: 'Terug (Alt+Links)' }),
    tb('forward', 'Vooruit', navForward, { disabled: S.historyPos >= S.history.length - 1, title: 'Vooruit (Alt+Rechts)' }),
    tb('up', 'Omhoog', goUp, { disabled: v.kind === 'root', title: 'Eén niveau omhoog (Backspace)' }),
    tb('refresh', 'Vernieuwen', refresh, { title: 'Vernieuwen (F5)' }),
    tb('open', 'Openen', openSelected, { disabled: !sel, title: 'Openen (Enter)' }),
    v.kind === 'share' && S.fileSel.size > 1
      ? tb('download', `Download (${S.fileSel.size})`, downloadSelectedFiles, { title: `${S.fileSel.size} geselecteerde bestanden downloaden als ZIP` })
      : tb('download', 'Download', () => downloadEntry(sel), { disabled: !(v.kind === 'share' && sel && !sel.dir) }),
    tb('search', 'Zoeken', openSearchDialog, { title: 'Bestanden zoeken op een share' }),
    tb('copy', 'UNC-pad', () => copyText(currentUnc(sel)), { disabled: v.kind === 'root' && !sel, title: 'UNC-pad kopiëren' }),
    h('div', { class: 'tsep' }),
    tb('palette', 'Legenda', openLegendDialog, { title: 'Kleurenlegenda' }),
    tb('info', 'Info', openAboutDialog),
    h('div', { class: 'tsep' }),
    h('button', { class: 'tbtn', title: 'Bladwijzers', onclick: (e) => openBookmarksMenu(e) }, icon('star'), 'Favorieten'),
  );
}

function renderAddress() {
  const v = S.view;
  fill($('#addr-icon'), icon(v.kind === 'root' ? 'network' : v.kind === 'host' ? 'computer' : (v.path ? 'folder' : 'drive')));
  $('#addr').value = v.kind === 'root' ? 'Netwerkomgeving' : currentUnc();
  const sel = $('#cred-select');
  fill(sel, S.creds.length
    ? S.creds.map((c) => h('option', { value: c.id, selected: c.id === curCred() }, c.label))
    : h('option', { value: '' }, '(geen credentials)'));
  sel.disabled = !S.creds.length;
  fill($('#cred-swatch'), credSwatch(curCred()));
}

function renderStatus() {
  const v = S.view;
  const items = S.list.items || [];
  $('#st-objects').textContent = `${items.length} object(en)`;

  let info = '';
  const sel = selectedItem();
  if (v.kind === 'share') {
    const total = items.reduce((n, e) => n + (e.dir ? 0 : e.size), 0);
    info = sel && !sel.dir ? `${sel.name}: ${fmtSize(sel.size)}` : fmtSize(total);
    const hidden = S.entries.filter(isHidden).length;
    if (hidden && !S.showHidden) info += ` (${hidden} verborgen)`;
    const here = accessOf(v.host, v.share, v.path);
    if (here && !S.error) info += ` · Deze map: ${accessText(here).toLowerCase()}`;
  } else if (v.kind === 'root') {
    info = S.hostSel.size > 1
      ? `${S.hostSel.size} hosts geselecteerd`
      : `${S.hosts.filter((x) => x.status === 'ok').length} van ${S.hosts.length} ingelogd`;
  } else {
    const host = hostByIp(v.host);
    info = host?.os || host?.hostname || '';
  }
  $('#st-info').textContent = info;

  const j = S.job;
  const msg = $('#st-msg');
  if (j?.running) {
    const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    fill(msg, h('div', { class: 'progress' }, h('div', { style: { width: `${pct}%` } })),
      `Scannen als ${j.cred_label}: ${j.done.toLocaleString('nl-NL')}/${j.total.toLocaleString('nl-NL')} · ${j.open} poort open · ${j.found} met SMB`
      + `${j.auth_failed ? ` · ${j.auth_failed} login mislukt` : ''}${j.queue?.length ? ` · nog ${j.queue.length} in wachtrij` : ''}`);
    msg.title = (j.queue || []).map((q) => `Wachtrij: ${q.count} targets als ${q.cred_label}`).join('\n');
  } else {
    fill(msg, S.statusMsg || (v.kind === 'share' && S.loading ? 'Map laden...' : 'Gereed'));
  }

  const cred = credById(curCred());
  fill($('#st-cred'), cred ? [credSwatch(cred.id), icon(cred.username ? 'user' : 'anon'), cred.label] : 'Geen credential');
}

/* ======================== boomweergave ======================== */

const STATUS_TEXT = {
  ok: 'Ingelogd', auth_failed: 'Login mislukt', error: 'Fout', closed: 'Poort 445 dicht',
  pending: 'Nog niet gescand', queued: 'In wachtrij...', unscanned: 'Niet gescand met deze credential',
};
const MAX_TREE = 1500;
const MAX_ROWS = 2000;

function hostVisible(host, q) {
  // Hosts die op naam zijn toegevoegd (bijv. het domein) blijven altijd zichtbaar, ook als ze niet reageren.
  const byName = !/^\d+\.\d+\.\d+\.\d+$/.test(host.ip);
  if (!S.showAll && !byName && (host.status === 'closed' || host.status === 'pending')) return false;
  if (S.onlyReadable && !hasReadableShare(host)) return false;
  if (!q) return true;
  const hay = [host.ip, host.hostname, host.domain, host.os, ...(host.shares || []).map((s) => s.name)].join(' ').toLowerCase();
  return hay.includes(q);
}

function treeNode({ iconName, label, sub, cls, selected, expander, onclick, ondblclick, oncontextmenu, title }) {
  return h('div', { class: `tnode ${cls || ''} ${selected ? 'sel' : ''}`, title },
    expander && h('button', { class: `texp ${expander.open ? '' : 'plus'}`, tabindex: -1, onclick: (e) => { e.stopPropagation(); expander.toggle(); } }),
    icon(iconName),
    h('span', { class: 'tlabel', onclick, ondblclick, oncontextmenu }, label),
    sub && h('span', { class: 'tsub' }, sub));
}

/* ---------- mappen in de boom (zoals de Verkenner) ---------- */

const MAX_TREE_DIRS = 500;
const treeKey = (ip, share, path = '') => `${ip}\\${share}${path ? `\\${path}` : ''}`;
const dirsOf = (entries) => entries.filter((e) => e.dir).map(({ name, attrs }) => ({ name, attrs }));
const byName = (a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true, sensitivity: 'base' });

/* ---------- toegang per map ---------- */

// Rechten per map en credential: 'rw', 'r', 'w', 'denied' of een foutmelding. Gedeeld door alle tabbladen.
const ACCESS = new Map();
const accessKey = (credId, ip, share, path) => `${credId}|${treeKey(ip, share, path)}`;
const accessOf = (ip, share, path, credId = curCred()) => ACCESS.get(accessKey(credId, ip, share, path));
const ACCESS_TEXT = { rw: 'Lezen en schrijven', r: 'Alleen lezen', w: 'Alleen schrijven', denied: 'Geen toegang' };
const isDenied = (a) => a === 'denied' || a === 'w';
const accessText = (a) => (a === undefined ? '...' : ACCESS_TEXT[a] || `Onbekend (${a})`);

/**
 * Vraag de rechten op van mappen (namen binnen path; '' is de map zelf). Dit opent alleen een handle met
 * lees- of schrijfrechten, er wordt niets aangemaakt of gewijzigd.
 */
async function probeAccess(ip, share, path, names, { force = false, credId = curCred() } = {}) {
  const todo = force ? names : names.filter((n) => !ACCESS.has(accessKey(credId, ip, share, joinPath(path, n))));
  for (let i = 0; i < todo.length; i += 200) {
    let res;
    try {
      res = await api('POST', '/api/probe', { host: ip, share, path, cred: credId, names: todo.slice(i, i + 200) });
    } catch { return; }
    for (const [n, a] of Object.entries(res)) ACCESS.set(accessKey(credId, ip, share, joinPath(path, n)), a);
    if (credId !== curCred()) continue;
    const v = S.view;
    if (v.kind === 'share' && v.host === ip && v.share === share && v.path === path) { renderList(); renderStatus(); }
    renderTree();
  }
}

async function loadDirs(ip, share, path) {
  const cache = S.dirCache; // hoort bij dit tabblad, ook als er intussen gewisseld wordt
  const key = treeKey(ip, share, path);
  const params = qs({ host: ip, share, path, cred: curCred() });
  cache.set(key, { loading: true });
  renderTree();
  try {
    cache.set(key, { dirs: dirsOf((await api('GET', `/api/ls?${params}`)).entries) });
  } catch (e) {
    cache.set(key, { error: e.message });
    if (/ACCESS_DENIED/.test(e.message)) ACCESS.set(accessKey(curCred(), ip, share, path), 'denied');
  }
  if (cache === S.dirCache) renderTree();
  const info = cache.get(key);
  if (info.dirs) probeAccess(ip, share, path, info.dirs.map((d) => d.name));
}

function toggleDir(ip, share, path) {
  const key = treeKey(ip, share, path);
  if (S.treeOpen.has(key)) {
    S.treeOpen.delete(key);
  } else {
    S.treeOpen.add(key);
    const info = S.dirCache.get(key);
    if (!info || info.error) { loadDirs(ip, share, path); return; }
  }
  renderTree();
}

function dirMenu(ip, share, path) {
  const view = { kind: 'share', host: ip, share, path };
  return [
    { label: 'Openen', iconName: 'open', action: () => browse(view) },
    { label: S.treeOpen.has(treeKey(ip, share, path)) ? 'Samenvouwen' : 'Uitvouwen', action: () => toggleDir(ip, share, path) },
    { label: 'Openen in nieuw tabblad...', action: () => showMenu(lastMenuPos.x, lastMenuPos.y, newTabMenu(view)) },
    'sep',
    { label: S.clip ? `Plakken (${S.clip.name})` : 'Plakken', iconName: 'paste', disabled: !S.clip, action: () => pasteInto({ host: ip, share, path }) },
    { label: 'Nieuwe map...', iconName: 'newfolder', action: () => newFolder({ host: ip, share, path }) },
    { label: 'Bestanden uploaden...', iconName: 'upload', action: () => pickUpload({ host: ip, share, path }) },
    'sep',
    { label: 'UNC-pad kopiëren', iconName: 'copy', action: () => copyText(uncPath(ip, share, path)) },
    { label: 'Toevoegen aan favorieten...', iconName: 'star', action: () => addBookmarkFor({ kind: 'share', host: ip, share, path }) },
    { label: 'Eigenschappen', iconName: 'info', action: () => openFolderProperties({ host: ip, share, path }) },
  ];
}

/** Uitgeklapte submappen van een share of map, of null als die dicht is. */
function renderDirKids(ip, share, path) {
  if (!S.treeOpen.has(treeKey(ip, share, path))) return null;
  const info = S.dirCache.get(treeKey(ip, share, path));
  const msg = (iconName, text, title) => h('ul', null, h('li', null, h('div', { class: 'tnode tmsg', title }, iconName && icon(iconName), text)));
  if (!info) {
    // Uitgeklapt maar nog niet geladen (bijv. een bovenliggende map na een sprong via de adresbalk).
    S.dirCache.set(treeKey(ip, share, path), { loading: true });
    setTimeout(() => loadDirs(ip, share, path), 0);
  }
  if (!info || info.loading) return msg(null, 'Laden...');
  if (info.error) return msg('alert', 'Niet toegankelijk', info.error);
  const dirs = info.dirs.filter((d) => S.showHidden || !isHidden(d)).sort(byName);
  if (!dirs.length) return null;
  const v = S.view;
  return h('ul', null,
    dirs.slice(0, MAX_TREE_DIRS).map((d) => {
      const sub = joinPath(path, d.name);
      const key = treeKey(ip, share, sub);
      const known = S.dirCache.get(key);
      const open = S.treeOpen.has(key);
      // Zolang een map niet geladen is, weten we niet of hij submappen heeft: dan een [+] tonen.
      const hasKids = !known?.dirs || known.dirs.some((x) => S.showHidden || !isHidden(x));
      const selected = v.kind === 'share' && v.host === ip && v.share === share && v.path === sub;
      const access = accessOf(ip, share, sub);
      const denied = isDenied(access);
      return h('li', null, treeNode({
        iconName: denied ? 'nofolder' : selected || open ? 'open' : 'folder',
        label: d.name,
        cls: [isHidden(d) && 'hiddendir', denied && 'denied'].filter(Boolean).join(' '),
        title: `${uncPath(ip, share, sub)}\n${accessText(access)}`,
        selected,
        expander: !denied && hasKids ? { open, toggle: () => toggleDir(ip, share, sub) } : null,
        onclick: () => browse({ kind: 'share', host: ip, share, path: sub }),
        oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, dirMenu(ip, share, sub)); },
      }), renderDirKids(ip, share, sub));
    }),
    dirs.length > MAX_TREE_DIRS && h('li', null, h('div', { class: 'tnode tmsg' }, `... nog ${dirs.length - MAX_TREE_DIRS} mappen`)));
}

const smbOpen = (x) => !['closed', 'pending'].includes(x.status);
const hasReadableShare = (x) => (x.shares || []).some((s) => s.access === 'READ');

function renderTreeFilters() {
  $('#f-open').checked = !S.showAll;
  $('#f-shares').checked = S.onlyReadable;
  $('#f-open-n').textContent = `(${S.hosts.filter(smbOpen).length})`;
  $('#f-shares-n').textContent = `(${S.hosts.filter(hasReadableShare).length})`;
}

function renderTree() {
  renderTreeFilters();
  const tree = $('#tree');
  const q = S.hostFilter.trim().toLowerCase();
  const visible = S.hosts.filter((x) => hostVisible(x, q));
  const v = S.view;

  const order = visible.map((x) => x.ip);
  const hostItems = visible.slice(0, MAX_TREE).map((host) => {
    const open = S.expanded.has(host.ip);
    const shares = host.shares || [];
    const hasKids = shares.length || host.error || host.share_error;
    const dim = ['closed', 'pending'].includes(host.status);
    const kids = open && hasKids ? h('ul', null,
      host.error && h('li', null, h('div', { class: 'tnode tmsg' }, icon(host.status === 'closed' ? 'warn' : 'alert'), host.error)),
      host.share_error && h('li', null, h('div', { class: 'tnode tmsg' }, icon('alert'), `Shares: ${host.share_error}`)),
      shares.map((s) => {
        const browsable = s.type === 'DISK' && s.access === 'READ';
        return h('li', null, treeNode({
          iconName: s.type === 'IPC' ? 'lock' : s.type === 'PRINTER' ? 'printer' : 'drive',
          label: s.name,
          sub: s.access === 'READ' ? s.remark : (s.access === 'NONE' ? 'geen toegang' : s.remark),
          cls: s.access === 'READ' ? '' : 'noaccess',
          selected: v.kind === 'share' && v.host === host.ip && v.share === s.name && !v.path,
          title: `${uncPath(host.ip, s.name)}${s.remark ? ` - ${s.remark}` : ''}\nToegang: ${s.access}`,
          expander: browsable ? { open: S.treeOpen.has(treeKey(host.ip, s.name)), toggle: () => toggleDir(host.ip, s.name, '') } : null,
          onclick: () => openShare(host.ip, s.name),
          oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, shareMenu(host.ip, s)); },
        }), browsable && renderDirKids(host.ip, s.name, ''));
      })) : null;

    const signingBadge = host.status === 'ok'
      ? (host.signing ? ' 🔒' : ' 🔓') : '';
    const noteBadge = S.notes[host.ip] ? ' 📝' : '';
    const subText = host.queued ? STATUS_TEXT.queued : (host.hostname || STATUS_TEXT[host.status]) + signingBadge + noteBadge;

    return h('li', null, treeNode({
      iconName: 'computer',
      label: host.ip,
      sub: subText,
      cls: `${dim ? 'dim' : ''} st-${host.status} ${host.queued ? 'st-queued' : ''}`,
      selected: (v.kind === 'host' && v.host === host.ip) || (S.hostSel.size > 1 && S.hostSel.has(host.ip)),
      title: `${host.ip}${host.hostname ? ` (${host.hostname})` : ''}\n${statusText(host)}${host.os ? `\n${host.os}` : ''}${host.status === 'ok' ? `\nSigning: ${host.signing ? 'vereist' : 'niet vereist'}` : ''}${S.notes[host.ip] ? `\n📝 ${S.notes[host.ip].slice(0, 80)}` : ''}`,
      expander: hasKids ? { open, toggle: () => toggleExpand(host.ip) } : null,
      onclick: (e) => { if (clickHost(host.ip, e, order)) hostSelectionChanged(); else openHost(host.ip); },
      ondblclick: () => toggleExpand(host.ip),
      oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, hostMenu(host)); },
    }), kids);
  });

  const hidden = S.hosts.length - visible.length;

  const bmIsSelected = (bm) => {
    if (!bm.share) return v.kind === 'host' && v.host === bm.host;
    return v.kind === 'share' && v.host === bm.host && v.share.toLowerCase() === bm.share.toLowerCase() && (v.path || '') === (bm.path || '');
  };
  const bmKids = S.bmOpen && S.bookmarks.length ? h('ul', null, S.bookmarks.map((bm) =>
    h('li', null, treeNode({
      iconName: bm.share ? (bm.path ? 'folder' : 'drive') : 'computer',
      label: bm.label,
      sub: bm.share ? uncPath(bm.host, bm.share, bm.path || '') : bm.host,
      selected: bmIsSelected(bm),
      title: bm.share ? uncPath(bm.host, bm.share, bm.path || '') : bm.host,
      onclick: () => navigateBookmark(bm),
      oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
        { label: 'Verwijderen', iconName: 'trash', action: () => { deleteBookmark(bm.id); renderTree(); } },
      ]); },
    }))
  )) : (S.bmOpen && !S.bookmarks.length ? h('div', { class: 'tnote' }, 'Nog geen bladwijzers. Rechtsklik op een host of share.') : null);

  fill(tree,
    treeNode({
      iconName: 'star', label: 'Favorieten',
      expander: { open: S.bmOpen, toggle: () => { S.bmOpen = !S.bmOpen; renderTree(); } },
      onclick: () => { S.bmOpen = !S.bmOpen; renderTree(); },
    }),
    bmKids,
    h('div', { class: 'tree-section-sep' }),
    treeNode({
      iconName: 'network', label: 'Netwerkomgeving', selected: v.kind === 'root', onclick: goRoot,
      expander: { open: !S.netClosed, toggle: () => { S.netClosed = !S.netClosed; renderTree(); } },
      oncontextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, rootMenu()); },
    }),
    !S.netClosed && h('ul', null, hostItems),
    !S.netClosed && !S.hosts.length && h('div', { class: 'tnote' }, 'Nog geen targets. Klik op "Targets" om IP-adressen of ranges toe te voegen.'),
    !S.netClosed && S.hosts.length > 0 && hidden > 0 && h('div', { class: 'tnote' }, `${hidden} host(s) verborgen door filter of omdat ze onbereikbaar/ongescand zijn (Beeld > Onbereikbare hosts tonen).`),
    !S.netClosed && visible.length > MAX_TREE && h('div', { class: 'tnote' }, `${visible.length - MAX_TREE} hosts niet getoond, verfijn de zoekopdracht.`),
  );
}

/* ======================== lijstweergave ======================== */

function sortItems(items, cols, groupDirs) {
  const col = cols.find((c) => c.key === S.sort.key) || cols[0];
  const val = col.sort || ((it) => it[col.key]);
  const cmpName = (a, b) => String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    if (groupDirs && a.dir !== b.dir) return a.dir ? -1 : 1;
    const va = val(a); const vb = val(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : cmpName(va ?? '', vb ?? '');
    return cmp * S.sort.dir;
  });
}

/** Generieke detailweergave (zoals de Verkenner): klik = selecteren, dubbelklik/Enter = openen. */
function renderTable({ cols, items, keyOf, rowClass, onOpen, menuFor, emptyText, groupDirs, multi, fileMulti }) {
  const q = S.listFilter.trim().toLowerCase();
  const filtered = q ? items.filter((it) => String(keyOf(it)).toLowerCase().includes(q)) : items;
  const sorted = sortItems(filtered, cols, groupDirs);
  S.list = { items: sorted, keyOf, open: onOpen, menu: menuFor, multi: Boolean(multi), fileMulti: Boolean(fileMulti) };
  if (S.selected != null && !sorted.some((it) => keyOf(it) === S.selected)) S.selected = null;

  const thead = h('thead', null, h('tr', null, cols.map((c) => h('th', {
    class: c.cls, style: c.width ? { width: c.width } : null,
    onclick: () => { S.sort = { key: c.key, dir: S.sort.key === c.key ? -S.sort.dir : 1 }; renderList(); },
  }, c.label, S.sort.key === c.key && h('span', { class: 'arrow' }, S.sort.dir > 0 ? '▲' : '▼')))));

  const shown = sorted.length > MAX_ROWS ? sorted.slice(0, MAX_ROWS) : sorted;
  const tbody = h('tbody', null, shown.map((it) => {
    const key = keyOf(it);
    return h('tr', {
      class: `row ${rowClass ? rowClass(it) : ''} ${isRowSelected(key) ? 'sel' : ''}`,
      'data-key': key,
      onmousedown: (e) => {
        if (e.button !== 0) return;
        if (fileMulti) { clickFile(key, e, sorted.map(keyOf)); renderToolbar(); renderStatus(); paintSelection(); }
        else if (multi) { clickHost(key, e, sorted.map(keyOf)); hostSelectionChanged(); }
        else select(key);
      },
      ondblclick: (e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onOpen(it); },
      oncontextmenu: (e) => {
        e.preventDefault();
        if (fileMulti) { if (!S.fileSel.has(key)) { S.fileSel = new Set([key]); S.fileAnchor = key; S.selected = key; paintSelection(); renderToolbar(); } }
        else if (!(multi && S.hostSel.has(key))) select(key);
        showMenu(e.clientX, e.clientY, menuFor(it));
      },
    }, cols.map((c) => h('td', { class: c.cls }, c.cell(it))));
  }));

  return [
    h('table', { class: 'files' }, thead, tbody),
    !sorted.length && h('div', { class: 'empty' }, items.length ? 'Geen items die aan de zoekopdracht voldoen.' : emptyText),
    sorted.length > MAX_ROWS && h('div', { class: 'empty' }, `Nog ${(sorted.length - MAX_ROWS).toLocaleString('nl-NL')} items niet getoond. Gebruik Zoek om te filteren.`),
  ];
}

const isRowSelected = (key) => (S.list.fileMulti ? S.fileSel.has(key) : S.list.multi ? S.hostSel.has(key) : key === S.selected);

function paintSelection() {
  for (const tr of document.querySelectorAll('#list tr.row')) tr.classList.toggle('sel', isRowSelected(tr.dataset.key));
}

function select(key) {
  S.selected = key;
  if (S.list.multi) {
    S.hostSel = new Set(key == null ? [] : [key]);
    S.hostAnchor = key;
    renderTree();
  }
  paintSelection();
  renderToolbar();
  renderStatus();
}

function moveSelection(delta) {
  const { items, keyOf } = S.list;
  if (!items.length) return;
  const idx = items.findIndex((it) => keyOf(it) === S.selected);
  const next = items[Math.max(0, Math.min(items.length - 1, idx < 0 ? 0 : idx + delta))];
  select(keyOf(next));
  for (const tr of document.querySelectorAll('#list tr.row')) {
    if (tr.dataset.key === String(keyOf(next))) tr.scrollIntoView({ block: 'nearest' });
  }
}

function renderList() {
  const v = S.view;
  const list = $('#list');
  const head = $('#list-head');
  if (v.kind === 'root') renderRootList(list, head);
  else if (v.kind === 'host') renderHostList(list, head);
  else renderShareList(list, head);
  renderStatus();
  renderToolbar();
}

function renderRootList(list, head) {
  fill(head);
  if (!S.creds.length || !S.hosts.length) {
    S.list = { items: [], keyOf: (x) => x, open: () => {}, menu: () => [], multi: false };
    const step = (iconName, done, title, text, label, onclick) => h('div', { class: `wstep ${done ? 'done' : ''}` },
      icon(iconName, 'big'), h('div', null, h('b', null, title), text), h('button', { class: 'btn', onclick }, label));
    fill(list, h('div', { class: 'welcome' },
      h('h1', null, 'Welkom bij ', h('span', null, 'SMBrowser95')),
      h('p', null, 'Blader door SMB-shares op het hele netwerk. Volg deze stappen om te beginnen:'),
      h('div', { class: 'wsteps' },
        step('key', S.creds.length > 0, '1. Credentials opslaan', 'Gebruikersnaam en wachtwoord, NT-hash of null session.', 'Credentials...', () => openCredsDialog()),
        step('addhost', S.hosts.length > 0, '2. Targets toevoegen', "Losse IP's, 10.0.0.0/24, 10.0.0.1-50 of hostnames.", 'Targets...', () => openTargetsDialog()),
        step('scan', S.hosts.some((x) => x.status === 'ok'), '3. Scannen en bladeren', 'Scan op SMB en dubbelklik op een host of share.', 'Scannen...', () => openScanDialog()))));
    return;
  }
  const q = S.hostFilter.trim().toLowerCase();
  const hosts = S.hosts.filter((x) => hostVisible(x, q));
  const readable = (x) => (x.shares || []).filter((s) => s.access === 'READ').length;
  const cred = credById(curCred());
  const todo = unscannedIps();
  fill(head, todo.length > 0 && cred && h('div', { class: 'infobar' },
    icon('info'),
    h('span', null, h('b', null, todo.length.toLocaleString('nl-NL')), ` host(s) met SMB zijn nog niet geprobeerd als ${cred.label}.`),
    h('button', { class: 'btn small', onclick: () => loginHosts(todo) }, `Allemaal inloggen als ${cred.label}`),
    h('button', {
      class: 'btn small',
      onclick: () => { S.hostSel = new Set(todo); S.hostAnchor = null; hostSelectionChanged(); },
    }, 'Selecteren'),
    h('span', { style: { color: 'var(--shadow)' } }, 'Tip: Ctrl/Shift-klik selecteert meerdere hosts, Ctrl+A alles.')));
  fill(list, ...renderTable({
    cols: [
      { key: 'name', label: 'Naam', sort: (x) => x.ip.split('.').map((p) => p.padStart(3, '0')).join('.'),
        cell: (x) => h('div', { class: 'fname' }, icon('computer'), h('span', { class: 'n' }, x.ip)) },
      { key: 'hostname', label: 'Computernaam', cell: (x) => [x.domain && x.domain !== x.hostname ? `${x.domain}\\` : '', x.hostname || ''] },
      { key: 'status', label: 'Status', cell: (x) => h('span', { class: x.queued ? 'st-queued' : `st-${x.status}` }, statusText(x)) },
      { key: 'shares', label: 'Leesbare shares', cls: 'c-num', sort: readable, cell: (x) => (x.status === 'ok' ? `${readable(x)} van ${(x.shares || []).length}` : '') },
      { key: 'os', label: 'Besturingssysteem', cell: (x) => x.os || '' },
      { key: 'signing', label: 'Signing', sort: (x) => (x.status === 'ok' ? Number(x.signing) : -1), cell: (x) => (x.status === 'ok' ? (x.signing ? 'Vereist' : h('span', { class: 'st-auth_failed' }, 'Niet vereist')) : '') },
    ],
    items: hosts,
    keyOf: (x) => x.ip,
    multi: true,
    rowClass: (x) => `st-row-${x.status}`,
    onOpen: (x) => openHost(x.ip),
    menuFor: hostMenu,
    emptyText: 'Geen hosts om te tonen. Pas het filter aan of kies Beeld > Onbereikbare hosts tonen.',
  }));
}

function renderHostList(list, head) {
  const host = hostByIp(S.view.host);
  if (!host) { goRoot(); return; }
  const cred = credById(curCred());
  fill(head, h('div', { class: 'infobar' },
    h('span', null, icon('computer'), ' ', h('b', null, host.hostname || host.ip)),
    h('span', { class: host.queued ? 'st-queued' : `st-${host.status}` }, statusText(host)),
    host.os && h('span', null, host.os),
    host.dialect && h('span', null, host.dialect),
    host.status === 'ok' && h('span', { class: host.signing ? '' : 'st-auth_failed' }, host.signing ? 'Signing vereist' : 'Signing niet vereist'),
    host.guest && h('span', { class: 'st-auth_failed' }, 'Guest-sessie'),
    cred && h('span', null, credSwatch(cred.id), ' Als: ', cred.label),
    host.scanned_at && h('span', null, 'Laatste scan: ', fmtDate(host.scanned_at))));

  const accText = { READ: 'Lezen', NONE: 'Geen toegang', IPC: 'IPC', OTHER: '-' };
  fill(list, ...renderTable({
    cols: [
      { key: 'name', label: 'Naam', cell: (s) => h('div', { class: 'fname' }, icon(s.type === 'IPC' ? 'lock' : s.type === 'PRINTER' ? 'printer' : 'drive'), h('span', { class: 'n' }, s.name)) },
      { key: 'type', label: 'Type', cell: (s) => ({ DISK: 'Schijf', IPC: 'IPC', PRINTER: 'Printer', DEVICE: 'Apparaat' }[s.type] || s.type) },
      { key: 'access', label: 'Toegang', sort: (s) => ({ READ: 0, IPC: 2, NONE: 1 }[s.access] ?? 3), cell: (s) => h('span', { class: `acc-${s.access}` }, accText[s.access] || s.access) },
      { key: 'remark', label: 'Opmerking', cell: (s) => s.remark || '' },
    ],
    items: host.shares || [],
    keyOf: (s) => s.name,
    onOpen: (s) => openShare(host.ip, s.name),
    menuFor: (s) => shareMenu(host.ip, s),
    emptyText: host.status === 'unscanned' || host.status === 'pending'
      ? [`Deze host is nog niet gescand als ${cred?.label || '...'}.\n\n`,
        h('button', { class: 'btn', onclick: () => rescanHosts([host.ip], curCred()) }, 'Nu scannen')]
      : host.error || host.share_error || (host.status === 'ok' ? 'Geen shares gevonden.' : 'Deze host is niet succesvol gescand.'),
  }));
}

function attrBadges(e) {
  const out = ATTR_BADGES.filter(([bit]) => e.attrs & bit).map(([, letter, cls, title]) => h('span', { class: `attr ${cls}`, title }, letter));
  if (!(e.attrs & ATTR.HIDDEN) && e.name.startsWith('.')) out.push(h('span', { class: 'attr hid', title: 'Dotfile (verborgen)' }, 'H'));
  return out;
}

function renderShareList(list, head) {
  const visible = S.entries.filter((e) => S.showHidden || !isHidden(e));
  const counts = {};
  for (const e of visible) counts[category(e).key] = (counts[category(e).key] || 0) + 1;
  const chip = (key, label, n) => h('button', {
    class: `chip ${key ? `cat-${key}` : ''} ${S.catFilter === key ? 'on' : ''}`,
    title: key ? `Toon alleen: ${label}` : 'Alle typen tonen',
    onclick: () => { S.catFilter = S.catFilter === key ? null : key; renderList(); },
  }, key && h('span', { class: 'swatch' }), label, h('span', { class: 'chip-n' }, `(${n})`));

  fill(head, h('div', { class: 'legend' },
    h('span', { class: 'lbl' }, 'Type:'),
    chip(null, 'Alles', visible.length),
    CATEGORIES.filter((c) => counts[c.key]).map((c) => chip(c.key, c.label, counts[c.key])),
    h('span', { class: 'spacer' }),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.showHidden, onchange: (e) => setPref('showHidden', e.target.checked) }), 'Verborgen bestanden')));

  if (S.loading) { fill(list, h('div', { class: 'empty' }, icon('scan', 'big'), 'Map laden...')); return; }
  if (S.error) {
    fill(list, h('div', { class: 'empty err' }, icon('alert', 'big'), `${currentUnc()} is niet toegankelijk.\n\n${S.error}`));
    S.list = { items: [], keyOf: (e) => e.name, open: () => {}, menu: () => [] };
    return;
  }

  const items = S.catFilter ? visible.filter((e) => category(e).key === S.catFilter) : visible;
  fill(list, ...renderTable({
    cols: [
      { key: 'name', label: 'Naam', cell: (e) => h('div', { class: 'fname' }, icon(e.dir && isDenied(dirAccess(e)) ? 'nofolder' : category(e).icon), h('span', { class: 'n' }, e.name)) },
      { key: 'size', label: 'Grootte', cls: 'c-size', sort: (e) => (e.dir ? -1 : e.size), cell: (e) => (e.dir ? '' : fmtSize(e.size)) },
      { key: 'type', label: 'Type', sort: (e) => `${String(CAT_ORDER[category(e).key]).padStart(2, '0')}${extOf(e.name)}`,
        cell: (e) => [h('span', { class: 'type-label' }, category(e).label), !e.dir && extOf(e.name) && h('span', { class: 'ext' }, `.${extOf(e.name)}`)] },
      { key: 'mtime', label: 'Gewijzigd', cell: (e) => fmtDate(e.mtime) },
      { key: 'attrs', label: 'Attributen', cls: 'attrs', sort: (e) => e.attrs || 0, cell: attrBadges },
      { key: 'access', label: 'Toegang', sort: (e) => (e.dir ? ACCESS_ORDER[dirAccess(e)] ?? 9 : 10),
        cell: (e) => e.dir && h('span', { class: `acc acc-${dirAccess(e) ?? 'pending'}` }, accessText(dirAccess(e))) },
    ],
    items,
    keyOf: (e) => e.name,
    groupDirs: true,
    rowClass: (e) => [`cat-${category(e).key}`, isHidden(e) && 'is-hidden', e.dir && isDenied(dirAccess(e)) && 'denied', isCut(e) && 'cut'].filter(Boolean).join(' '),
    onOpen: openEntry,
    menuFor: entryMenu,
    emptyText: 'Deze map is leeg.',
    fileMulti: true,
  }));
}

const ACCESS_ORDER = { rw: 0, r: 1, w: 2, denied: 3 };
const dirAccess = (e) => accessOf(S.view.host, S.view.share, joinPath(S.view.path, e.name));

function openEntry(e) {
  const v = S.view;
  if (e.dir) browse({ ...v, path: joinPath(v.path, e.name) });
  else openPreview(e);
}

/* ======================== bestandsacties ======================== */

const hereLoc = () => ({ host: S.view.host, share: S.view.share, path: S.view.path || '' });
const sameLoc = (a, b) => a.host === b.host && a.share.toLowerCase() === b.share.toLowerCase() && (a.path || '').toLowerCase() === (b.path || '').toLowerCase();
const isCut = (e) => S.clip?.mode === 'cut' && S.clip.name === e.name && sameLoc(S.clip, hereLoc()) && S.clip.cred === curCred();

/** Na een wijziging: de boom onder deze map vergeten en de map opnieuw laden als hij open staat. */
function afterChange(loc, selectName) {
  const prefix = treeKey(loc.host, loc.share, loc.path);
  for (const k of [...S.dirCache.keys()]) if (k === prefix || k.startsWith(`${prefix}\\`)) S.dirCache.delete(k);
  if (S.view.kind === 'share' && sameLoc(S.view, loc)) browse({ ...S.view }, selectName);
  else renderTree();
}

/** Eerste vrije naam: 'Nieuwe map', 'Nieuwe map (2)', ... (alleen bekend voor de geopende map). */
function freeName(loc, base, ext = '') {
  const taken = sameLoc(S.view, loc) ? new Set(S.entries.map((x) => x.name.toLowerCase())) : new Set();
  for (let i = 1; ; i++) {
    const name = `${base}${i > 1 ? ` (${i})` : ''}${ext}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

async function fsAction(url, body, failTitle) {
  try {
    return await api('POST', url, { cred: curCred(), ...body });
  } catch (err) {
    errorBox(/ACCESS_DENIED/.test(err.message) ? `Toegang geweigerd.\n\n${err.message}` : err.message, failTitle);
    return null;
  }
}

async function newFolder(loc = hereLoc()) {
  const name = await promptBox('Naam van de nieuwe map:', { title: 'Nieuwe map', value: freeName(loc, 'Nieuwe map') });
  if (!name) return;
  if (await fsAction('/api/fs/mkdir', { ...loc, name }, 'Map maken mislukt')) afterChange(loc, name);
}

async function newTextFile(loc = hereLoc()) {
  const name = await promptBox('Naam van het nieuwe bestand:', { title: 'Nieuw tekstdocument', value: freeName(loc, 'Nieuw tekstdocument', '.txt') });
  if (!name) return;
  if (await fsAction('/api/fs/newfile', { ...loc, name }, 'Bestand maken mislukt')) afterChange(loc, name);
}

async function renameEntry(e) {
  const loc = hereLoc();
  const name = await promptBox(`Nieuwe naam voor '${e.name}':`, { title: 'Naam wijzigen', value: e.name });
  if (!name || name === e.name) return;
  if (await fsAction('/api/fs/rename', { ...loc, name: e.name, new: name }, 'Naam wijzigen mislukt')) afterChange(loc, name);
}

async function deleteEntry(e) {
  const loc = hereLoc();
  const text = e.dir
    ? `Weet u zeker dat u de map '${e.name}' en alle inhoud wilt verwijderen?\n\nEen netwerkshare heeft geen prullenbak: dit kan niet ongedaan gemaakt worden.`
    : `Weet u zeker dat u '${e.name}' wilt verwijderen?\n\nEen netwerkshare heeft geen prullenbak: dit kan niet ongedaan gemaakt worden.`;
  if (await msgBox(text, { title: e.dir ? 'Map verwijderen' : 'Bestand verwijderen', iconName: 'warn', buttons: ['Ja', 'Nee'] }) !== 'Ja') return;
  const r = await fsAction('/api/fs/delete', { ...loc, name: e.name, dir: e.dir }, 'Verwijderen mislukt');
  if (!r) return;
  if (isCut(e)) S.clip = null;
  notify(e.dir ? `${e.name} verwijderd (${r.deleted} items)` : `${e.name} verwijderd`);
  afterChange(loc);
}

function clipEntry(e, mode) {
  S.clip = { mode, ...hereLoc(), name: e.name, dir: e.dir, cred: curCred() };
  notify(`${mode === 'cut' ? 'Geknipt' : 'Gekopieerd'}: ${e.name}. Plak met Ctrl+V of rechtsklik > Plakken.`);
  renderList();
}

async function pasteInto(loc = hereLoc()) {
  const c = S.clip;
  if (!c) return;
  // Kopiëren naar dezelfde map: 'naam - Kopie.ext', zoals Verkenner.
  let name = c.name;
  if (sameLoc(c, loc)) {
    if (c.mode === 'cut') return;
    const dot = c.dir ? -1 : c.name.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [c.name.slice(0, dot), c.name.slice(dot)] : [c.name, ''];
    name = freeName(loc, `${base} - Kopie`, ext);
  }
  setStatusMsg(`${c.mode === 'cut' ? 'Verplaatsen' : 'Kopiëren'}: ${c.name}...`);
  const r = await fsAction('/api/fs/paste', {
    mode: c.mode,
    src: { host: c.host, share: c.share, path: c.path, name: c.name, dir: c.dir, cred: c.cred },
    dst: { ...loc, name, cred: curCred() },
  }, c.mode === 'cut' ? 'Verplaatsen mislukt' : 'Kopiëren mislukt');
  setStatusMsg(null);
  if (!r) return;
  if (c.mode === 'cut') { S.clip = null; afterChange(c); }
  notify(`${r.moved ? 'Verplaatst' : 'Gekopieerd'}: ${c.name}${r.files != null && c.dir ? ` (${r.files} bestanden)` : ''}`);
  afterChange(loc, sameLoc(loc, hereLoc()) ? name : undefined);
}

function pickUpload(loc = hereLoc()) {
  const input = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
  input.addEventListener('change', () => { uploadFiles([...input.files], loc); input.remove(); });
  document.body.append(input);
  input.click();
}

async function uploadFiles(files, loc) {
  let done = 0;
  for (const [i, file] of files.entries()) {
    setStatusMsg(`Uploaden ${i + 1}/${files.length}: ${file.name}...`);
    let overwrite = false;
    for (;;) {
      const form = new FormData();
      form.append('file', file, file.name);
      const url = `/api/fs/upload?${qs({ ...loc, cred: curCred(), overwrite: overwrite ? '1' : '' })}`;
      let json;
      try {
        json = await (await fetch(url, { method: 'POST', headers: { 'X-SMBB': '1' }, body: form })).json();
      } catch (err) {
        json = { status: 'error', message: err.message };
      }
      if (json.status === 'ok') { done++; break; }
      if (json.exists && !overwrite) {
        const answer = await msgBox(`'${file.name}' bestaat al in deze map. Vervangen?`, { title: 'Bestand vervangen', iconName: 'question', buttons: ['Ja', 'Nee', 'Annuleren'] });
        if (answer === 'Ja') { overwrite = true; continue; }
        if (answer === 'Annuleren') { setStatusMsg(null); afterChange(loc); return; }
        break;
      }
      errorBox(`'${file.name}' uploaden mislukt.\n\n${json.message}`, 'Uploaden mislukt');
      break;
    }
  }
  setStatusMsg(null);
  if (done) notify(`${done} bestand(en) geüpload`);
  afterChange(loc, files.length === 1 && done ? files[0].name : undefined);
}

/** Sneltoetsen in een map. Geeft true als de toets is afgehandeld. */
function fileKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const sel = selectedItem();
  if (e.key === 'Delete' && sel) deleteEntry(sel);
  else if (e.key === 'F2' && sel) renameEntry(sel);
  else if (e.key === 'Enter' && e.altKey && sel) openPropertiesDialog(sel);
  else if (mod && e.key.toLowerCase() === 'c' && sel) clipEntry(sel, 'copy');
  else if (mod && e.key.toLowerCase() === 'x' && sel) clipEntry(sel, 'cut');
  else if (mod && e.key.toLowerCase() === 'v' && S.clip) pasteInto();
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'n') newFolder();
  else return false;
  return true;
}

function openFolderProperties(loc) {
  const name = loc.path ? loc.path.split('\\').pop() : loc.share;
  const d = dialog({ title: `Eigenschappen van ${name}`, iconName: 'folder', width: 380 });
  const row = (k, v) => h('tr', null, h('td', null, k), h('td', { style: { userSelect: 'text' } }, v));
  const access = accessOf(loc.host, loc.share, loc.path);
  const here = sameLoc(S.view, loc);
  fill(d.body,
    h('div', { class: 'msg', style: { alignItems: 'center' } }, icon(isDenied(access) ? 'nofolder' : 'folder', 'big'), h('b', null, name)),
    h('fieldset', null, h('table', { class: 'legend-table' },
      row('Locatie:', uncPath(loc.host, loc.share, loc.path)),
      row('Toegang:', accessText(access)),
      here && row('Inhoud:', `${S.entries.filter((x) => !x.dir).length} bestanden, ${S.entries.filter((x) => x.dir).length} mappen`),
      here && row('Grootte:', fmtSize(S.entries.reduce((n, x) => n + (x.dir ? 0 : x.size), 0))))));
  fill(d.foot, h('button', { class: 'btn default', onclick: d.close }, 'OK'));
  d.center();
}

/* ======================== menu's ======================== */

let openMenuEl = null;
let openMenuCleanup = null;
let lastMenuPos = { x: 0, y: 0 };

function closeMenu() {
  if (openMenuEl) openMenuEl.remove();
  openMenuEl = null;
  if (openMenuCleanup) openMenuCleanup();
  openMenuCleanup = null;
}

/** items: [{label, action, iconName, disabled, checked, key}] of 'sep' */
function buildMenu(items, cls = '') {
  return h('div', { class: `menu ${cls}` }, items.map((it) => {
    if (it === 'sep') return h('div', { class: 'menu-sep' });
    return h('div', {
      class: `menu-item ${it.disabled ? 'disabled' : ''}`,
      onclick: (e) => { e.stopPropagation(); if (it.disabled) return; closeMenu(); it.action(); },
    },
    h('span', { class: 'mi-check' }, it.checked ? icon('check') : (it.iconName ? icon(it.iconName) : null)),
    it.label,
    it.key && h('span', { class: 'mi-key' }, it.key));
  }));
}

function showMenu(x, y, items, { cls = '', onClose, el } = {}) {
  closeMenu();
  lastMenuPos = { x, y };
  const menu = el || buildMenu(items, cls);
  menu.style.left = '0px';
  menu.style.top = '0px';
  $('#menu-root').append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width - 2))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height - 2))}px`;
  openMenuEl = menu;
  const away = (e) => { if (!menu.contains(e.target)) closeMenu(); };
  const esc = (e) => { if (e.key === 'Escape') closeMenu(); };
  // Pas na deze klik luisteren; is het menu dan al dicht, dan niet meer (anders blijft de listener hangen).
  let closed = false;
  setTimeout(() => { if (!closed) document.addEventListener('mousedown', away); }, 0);
  document.addEventListener('keydown', esc);
  openMenuCleanup = () => {
    closed = true;
    document.removeEventListener('mousedown', away);
    document.removeEventListener('keydown', esc);
    if (onClose) onClose();
  };
}

function rootMenu() {
  const todo = unscannedIps();
  const cred = credById(curCred());
  return [
    { label: `Inloggen als ${cred?.label || '...'} op niet-geprobeerde hosts (${todo.length})`, iconName: 'user', disabled: !todo.length || !cred, action: () => loginHosts(todo) },
    'sep',
    { label: 'Targets toevoegen...', iconName: 'addhost', action: () => openTargetsDialog() },
    { label: 'Scannen...', iconName: 'scan', action: () => openScanDialog() },
    'sep',
    { label: 'Vernieuwen', iconName: 'refresh', key: 'F5', action: refresh },
  ];
}

function hostMenu(host) {
  if (S.hostSel.size > 1 && S.hostSel.has(host.ip)) return multiHostMenu();
  const cred = credById(curCred());
  return [
    { label: `Inloggen als ${cred?.label || '...'}`, iconName: 'user', disabled: !cred, action: () => loginHosts([host.ip]) },
    { label: 'Openen', iconName: 'open', action: () => openHost(host.ip) },
    { label: 'Openen in nieuw tabblad...', action: () => showMenu(lastMenuPos.x, lastMenuPos.y, newTabMenu({ kind: 'host', host: host.ip })) },
    { label: S.expanded.has(host.ip) ? 'Samenvouwen' : 'Uitvouwen', action: () => toggleExpand(host.ip) },
    'sep',
    { label: S.notes[host.ip] ? 'Notitie bewerken...' : 'Notitie toevoegen...', iconName: 'edit', action: () => openNoteDialog(host.ip) },
    { label: 'Scannen als...', iconName: 'key', action: () => openScanDialog([host.ip]) },
    'sep',
    { label: 'IP-adres kopiëren', iconName: 'copy', action: () => copyText(host.ip) },
    { label: 'UNC-pad kopiëren', action: () => copyText(uncPath(host.ip)) },
    { label: 'Toevoegen aan favorieten...', iconName: 'star', action: () => addBookmarkFor({ kind: 'host', host: host.ip, share: '', path: '' }) },
    'sep',
    { label: 'Verwijderen', iconName: 'trash', key: 'Del', action: () => deleteHost(host.ip) },
  ];
}

function openBookmarksMenu(e) {
  const btn = e.currentTarget;
  const r = btn.getBoundingClientRect();
  const items = [
    { label: 'Huidige locatie toevoegen...', iconName: 'star', action: addCurrentBookmark },
    S.bookmarks.length > 0 && 'sep',
    ...S.bookmarks.map((bm) => ({
      label: bm.label,
      action: () => navigateBookmark(bm),
      onRmb: () => showMenu(lastMenuPos.x, lastMenuPos.y, [
        { label: 'Verwijderen', iconName: 'trash', action: () => deleteBookmark(bm.id) },
      ]),
    })),
    !S.bookmarks.length && { label: '(Geen bladwijzers)', disabled: true },
  ].filter(Boolean);
  showMenu(r.left, r.bottom, items);
}

async function addCurrentBookmark() {
  return addBookmarkFor(S.view);
}

async function addBookmarkFor({ kind, host, share, path }) {
  if (!host) { notify('Navigeer eerst naar een host, share of map.'); return; }
  const defaultLabel = path
    ? `${host}\\${share}\\${path.split('\\').pop()}`
    : share ? `${host}\\${share}` : host;
  const label = await promptBox('Naam voor de bladwijzer:', { title: 'Bladwijzer toevoegen', value: defaultLabel });
  if (label === null) return;
  const bm = await api('POST', '/api/bookmarks', {
    label: label || defaultLabel, host, share: share || '', path: path || '',
  });
  S.bookmarks.push(bm);
  renderTree();
  notify(`Bladwijzer '${bm.label}' toegevoegd`);
}

async function deleteBookmark(id) {
  await api('DELETE', `/api/bookmarks/${encodeURIComponent(id)}`);
  S.bookmarks = S.bookmarks.filter((b) => b.id !== id);
  renderTree();
}

function navigateBookmark(bm) {
  if (bm.share) browse({ kind: 'share', host: bm.host, share: bm.share, path: bm.path || '' });
  else { setView({ kind: 'host', host: bm.host }); renderAll(); }
}

async function openNoteDialog(ip) {
  const current = S.notes[ip] || '';
  const dlg = dialog({ title: `Notitie — ${ip}`, iconName: 'edit', width: 420 });
  const ta = h('textarea', {
    rows: 8, style: { width: '100%', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '11px', boxSizing: 'border-box' },
    spellcheck: false,
  });
  ta.value = current;
  dlg.body.append(ta);
  dlg.foot.append(
    h('button', { class: 'btn default', onclick: save }, 'Opslaan'),
    h('button', { class: 'btn', onclick: doDelete }, 'Wissen'),
    h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annuleren'),
  );
  ta.focus();

  async function save() {
    const text = ta.value;
    await api('PUT', `/api/notes/${encodeURIComponent(ip)}`, { text });
    if (text.trim()) S.notes[ip] = text; else delete S.notes[ip];
    dlg.close();
    renderTree();
  }
  async function doDelete() {
    await api('DELETE', `/api/notes/${encodeURIComponent(ip)}`);
    delete S.notes[ip];
    dlg.close();
    renderTree();
  }
}

function multiHostMenu() {
  const ips = [...S.hostSel];
  const cred = credById(curCred());
  return [
    { label: `Inloggen als ${cred?.label || '...'} (${ips.length} hosts)`, iconName: 'user', disabled: !cred, action: () => loginHosts(ips) },
    { label: 'Scannen als...', iconName: 'key', action: () => openScanDialog(ips) },
    'sep',
    { label: 'IP-adressen kopiëren', iconName: 'copy', action: () => copyText(ips.join('\n')) },
    { label: `Verwijderen (${ips.length})`, iconName: 'trash', key: 'Del', action: () => deleteHosts(ips) },
    'sep',
    { label: 'Selectie opheffen', key: 'Esc', action: clearHostSel },
  ];
}

function shareMenu(ip, share) {
  return [
    { label: 'Openen', iconName: 'open', action: () => openShare(ip, share.name) },
    { label: 'Openen in nieuw tabblad...', action: () => showMenu(lastMenuPos.x, lastMenuPos.y, newTabMenu({ kind: 'share', host: ip, share: share.name, path: '' })) },
    { label: 'UNC-pad kopiëren', iconName: 'copy', action: () => copyText(uncPath(ip, share.name)) },
    { label: 'Toevoegen aan favorieten...', iconName: 'star', action: () => addBookmarkFor({ kind: 'share', host: ip, share: share.name, path: '' }) },
  ];
}

function entryMenu(e) {
  const here = hereLoc();
  const inside = { ...here, path: joinPath(here.path, e.name) };
  return [
    { label: e.dir ? 'Openen' : 'Voorbeeld', iconName: 'open', key: 'Enter', action: () => openEntry(e) },
    e.dir && { label: 'Openen in nieuw tabblad...', action: () => showMenu(lastMenuPos.x, lastMenuPos.y, newTabMenu({ ...S.view, path: inside.path })) },
    !e.dir && { label: 'Downloaden', iconName: 'download', action: () => downloadEntry(e) },
    'sep',
    { label: 'Knippen', iconName: 'cut', key: 'Ctrl+X', action: () => clipEntry(e, 'cut') },
    { label: 'Kopiëren', iconName: 'copy', key: 'Ctrl+C', action: () => clipEntry(e, 'copy') },
    e.dir && { label: 'Plakken in deze map', iconName: 'paste', disabled: !S.clip, action: () => pasteInto(inside) },
    'sep',
    e.dir && { label: 'Nieuwe map hierin...', iconName: 'newfolder', action: () => newFolder(inside) },
    e.dir && { label: 'Uploaden naar deze map...', iconName: 'upload', action: () => pickUpload(inside) },
    e.dir && 'sep',
    { label: 'Verwijderen', iconName: 'trash', key: 'Del', action: () => deleteEntry(e) },
    { label: 'Naam wijzigen', iconName: 'edit', key: 'F2', action: () => renameEntry(e) },
    'sep',
    { label: 'UNC-pad kopiëren', iconName: 'copy', action: () => copyText(currentUnc(e)) },
    { label: 'Naam kopiëren', action: () => copyText(e.name) },
    e.dir && { label: 'Toevoegen aan favorieten...', iconName: 'star', action: () => addBookmarkFor({ kind: 'share', host: here.host, share: here.share, path: inside.path }) },
    'sep',
    { label: 'Eigenschappen', iconName: 'info', key: 'Alt+Enter', action: () => openPropertiesDialog(e) },
  ].filter(Boolean);
}

/** Rechtsklik op een lege plek in een map. */
function folderMenu(loc = hereLoc()) {
  return [
    { label: 'Vernieuwen', iconName: 'refresh', key: 'F5', action: refresh },
    { label: 'Omhoog', iconName: 'up', key: 'Backspace', action: goUp },
    'sep',
    { label: S.clip ? `Plakken (${S.clip.name})` : 'Plakken', iconName: 'paste', key: 'Ctrl+V', disabled: !S.clip, action: () => pasteInto(loc) },
    'sep',
    { label: 'Nieuwe map...', iconName: 'newfolder', key: 'Ctrl+Shift+N', action: () => newFolder(loc) },
    { label: 'Nieuw tekstdocument...', iconName: 'newfile', action: () => newTextFile(loc) },
    { label: 'Bestanden uploaden...', iconName: 'upload', action: () => pickUpload(loc) },
    'sep',
    { label: 'Verborgen bestanden', checked: S.showHidden, action: () => setPref('showHidden', !S.showHidden) },
    { label: 'UNC-pad kopiëren', iconName: 'copy', action: () => copyText(uncPath(loc.host, loc.share, loc.path)) },
    { label: 'Huidige map aan favorieten...', iconName: 'star', action: () => addBookmarkFor({ kind: 'share', host: loc.host, share: loc.share, path: loc.path }) },
    { label: 'Eigenschappen', iconName: 'info', action: () => openFolderProperties(loc) },
  ];
}

const MENUBAR = {
  file: () => [
    { label: 'Nieuw tabblad...', action: () => { const b = $('.tab-new').getBoundingClientRect(); showMenu(b.left, b.bottom, newTabMenu()); } },
    { label: 'Tabblad sluiten', action: () => closeTab(S.activeTab), disabled: S.tabs.length < 2 },
    'sep',
    { label: 'Credentials...', iconName: 'key', action: () => openCredsDialog() },
    { label: 'Targets toevoegen...', iconName: 'addhost', action: () => openTargetsDialog() },
    'sep',
    S.view.kind === 'share' && { label: 'Nieuwe map...', iconName: 'newfolder', action: () => newFolder() },
    S.view.kind === 'share' && { label: 'Nieuw tekstdocument...', iconName: 'newfile', action: () => newTextFile() },
    S.view.kind === 'share' && { label: 'Bestanden uploaden...', iconName: 'upload', action: () => pickUpload() },
    S.view.kind === 'share' && 'sep',
    { label: 'Onbereikbare hosts verwijderen', action: cleanupClosed, disabled: !S.hosts.some((x) => x.status === 'closed') },
    { label: 'Alle hosts wissen...', iconName: 'trash', action: deleteAllHosts, disabled: !S.rawHosts.length && !S.job?.running },
    'sep',
    { label: 'Sluiten', action: () => minimize(true) },
  ].filter(Boolean),
  view: () => [
    { label: 'Verborgen bestanden', checked: S.showHidden, action: () => setPref('showHidden', !S.showHidden) },
    { label: 'Onbereikbare hosts tonen', checked: S.showAll, action: () => setPref('showAll', !S.showAll) },
    { label: 'Alleen hosts met toegankelijke share', checked: S.onlyReadable, action: () => setPref('onlyReadable', !S.onlyReadable) },
    'sep',
    { label: 'Netwerkomgeving', iconName: 'network', action: goRoot },
    { label: 'Omhoog', iconName: 'up', key: 'Backspace', action: goUp, disabled: S.view.kind === 'root' },
    { label: 'Vernieuwen', iconName: 'refresh', key: 'F5', action: refresh },
  ],
  tools: () => [
    { label: 'Scannen...', iconName: 'scan', action: () => openScanDialog() },
    { label: 'Scan stoppen', iconName: 'stop', action: stopScan, disabled: !S.job?.running },
    'sep',
    { label: 'UNC-pad kopiëren', iconName: 'copy', action: () => copyText(currentUnc(selectedItem())), disabled: S.view.kind === 'root' && !selectedItem() },
  ],
  help: () => [
    { label: 'Kleurenlegenda', iconName: 'palette', action: openLegendDialog },
    'sep',
    { label: 'Info over SMBrowser95', iconName: 'info', action: openAboutDialog },
  ],
};

function openMenubar(btn) {
  const r = btn.getBoundingClientRect();
  document.querySelectorAll('.menubar button').forEach((b) => b.classList.toggle('open', b === btn));
  showMenu(r.left, r.bottom, MENUBAR[btn.dataset.menu](), {
    onClose: () => btn.classList.remove('open'),
  });
}

function openStartMenu() {
  const btn = $('#start-btn');
  btn.classList.add('open');
  const items = [
    { label: 'Netwerkomgeving', iconName: 'network', action: () => { minimize(false); goRoot(); } },
    { label: 'Credentials...', iconName: 'key', action: () => { minimize(false); openCredsDialog(); } },
    { label: 'Targets toevoegen...', iconName: 'addhost', action: () => { minimize(false); openTargetsDialog(); } },
    { label: 'Scannen...', iconName: 'scan', action: () => { minimize(false); openScanDialog(); } },
    'sep',
    { label: 'Kleurenlegenda', iconName: 'palette', action: openLegendDialog },
    { label: 'Info', iconName: 'info', action: openAboutDialog },
    'sep',
    { label: 'Afsluiten...', iconName: 'shutdown', action: openShutdownDialog },
  ];
  const el = h('div', { class: 'menu startmenu' }, h('div', { class: 'start-banner' }, h('b', null, 'SMB'), ' Browser 95'), h('div', { class: 'start-items' }, [...buildMenu(items).childNodes]));
  const r = btn.getBoundingClientRect();
  showMenu(r.left, r.top - 4 - 300, null, { el, onClose: () => btn.classList.remove('open') });
  const mr = el.getBoundingClientRect();
  el.style.top = `${r.top - mr.height}px`;
}

/* ======================== dialoogvensters ======================== */

/** Win95-dialoog: versleepbaar aan de titelbalk, modaal. */
function dialog({ title, iconName, width }) {
  const block = h('div', { class: 'dialog-block' });
  const body = h('div', { class: 'dialog-body' });
  const foot = h('div', { class: 'dialog-foot' });
  // Zoals in Windows 95: klik op het icoon linksboven opent het systeemmenu, dubbelklik sluit het venster.
  const sysIcon = h('span', {
    class: 'title-icon', title: 'Dubbelklik om te sluiten',
    onmousedown: (e) => e.stopPropagation(),
    onclick: (e) => {
      if (e.detail > 1) return; // tweede klik van een dubbelklik
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.left, r.bottom, [{ label: 'Sluiten', iconName: 'w-close', key: 'Alt+F4', action: () => close() }]);
    },
    ondblclick: () => { closeMenu(); close(); },
  }, icon(iconName || 'winlogo'));
  const titlebar = h('div', { class: 'titlebar' }, sysIcon, h('span', { class: 'title-text' }, title),
    h('div', { class: 'title-btns' }, h('button', { title: 'Sluiten', onclick: () => close() }, icon('w-close'))));
  const box = h('div', { class: 'dialog', style: width ? { width: `${width}px` } : null }, titlebar, body, foot);
  const onKey = (e) => {
    const top = $('#dialog-root').lastElementChild === box;
    if (top && (e.key === 'Escape' || (e.key === 'F4' && e.altKey))) { e.preventDefault(); e.stopPropagation(); close(); }
  };
  function close() {
    block.remove();
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    if (!$('#dialog-root .dialog')) $('#titlebar').classList.remove('inactive');
    if (dlg.onClose) dlg.onClose();
  }
  $('#dialog-root').append(block, box);
  $('#titlebar').classList.add('inactive');
  document.addEventListener('keydown', onKey, true);
  block.addEventListener('mousedown', () => { box.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 160, iterations: 2 }); });

  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev) => {
      box.style.left = `${Math.max(0, Math.min(ev.clientX - dx, window.innerWidth - 60))}px`;
      box.style.top = `${Math.max(0, Math.min(ev.clientY - dy, window.innerHeight - 40))}px`;
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  const dlg = {
    body, foot, close, box,
    center() {
      const r = box.getBoundingClientRect();
      box.style.left = `${Math.max(4, (window.innerWidth - r.width) / 2)}px`;
      box.style.top = `${Math.max(4, (window.innerHeight - 28 - r.height) / 2)}px`;
    },
  };
  return dlg;
}

/** Vervanger voor alert/confirm in Win95-stijl. Resolvet met het label van de gekozen knop. */
function msgBox(text, { title = 'SMBrowser95', iconName = 'info', buttons = ['OK'] } = {}) {
  return new Promise((resolve) => {
    const d = dialog({ title });
    let result = buttons[buttons.length - 1];
    d.onClose = () => resolve(result);
    fill(d.body, h('div', { class: 'msg' }, icon(iconName, 'big'), h('div', null, text)));
    d.foot.style.justifyContent = 'center';
    const btns = buttons.map((label, i) => h('button', { class: `btn ${i === 0 ? 'default' : ''}`, onclick: () => { result = label; d.close(); } }, label));
    fill(d.foot, btns);
    d.center();
    btns[0].focus();
  });
}

/** Invoervenster in Win95-stijl. Resolvet met de tekst, of null bij Annuleren. */
function promptBox(text, { title = 'SMBrowser95', value = '' } = {}) {
  return new Promise((resolve) => {
    const d = dialog({ title, width: 380 });
    let result = null;
    d.onClose = () => resolve(result);
    const accept = () => { result = input.value; d.close(); };
    const input = h('input', { type: 'text', value, style: { width: '100%' }, onkeydown: (e) => { if (e.key === 'Enter') accept(); } });
    fill(d.body, h('div', { style: { marginBottom: '6px' } }, text), input);
    fill(d.foot, h('button', { class: 'btn default', onclick: accept }, 'OK'), h('button', { class: 'btn', onclick: d.close }, 'Annuleren'));
    d.center();
    input.focus();
    input.select();
  });
}

function frow(label, input, id) {
  if (id) input.id = id;
  return h('div', { class: 'frow' }, h('label', { for: id }, label), input);
}

function credSelect(selected) {
  return h('select', null, S.creds.map((c) => h('option', { value: c.id, selected: c.id === selected }, c.label)));
}

/* ---------- credentials ---------- */

function openCredsDialog() {
  const d = dialog({ title: 'Credentials', iconName: 'key' });
  let selectedId = S.creds[0]?.id || null;
  let mode = S.creds.length ? 'view' : 'new';

  const render = () => {
    const cur = mode === 'new' ? null : credById(selectedId);
    const f = {
      label: h('input', { type: 'text', value: cur?.label || '' }),
      domain: h('input', { type: 'text', value: cur?.domain || '', spellcheck: 'false' }),
      username: h('input', { type: 'text', value: cur?.username || '', spellcheck: 'false', autocomplete: 'off' }),
      password: h('input', { type: 'password', autocomplete: 'off', placeholder: cur?.has_password ? '(ongewijzigd)' : '' }),
      nthash: h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: cur?.has_hash ? '(ongewijzigd)' : 'LM:NT of NT' }),
    };
    const showPw = h('input', { type: 'checkbox', onchange: (e) => { f.password.type = f.nthash.type = e.target.checked ? 'text' : 'password'; } });

    const save = async () => {
      const data = {
        label: f.label.value, domain: f.domain.value, username: f.username.value,
        password: f.password.value, nthash: f.nthash.value,
      };
      if (data.nthash && !/^([0-9a-f]{32}:)?[0-9a-f]{32}$/i.test(data.nthash.trim())) {
        await errorBox('De NT-hash moet uit 32 hexadecimale tekens bestaan (optioneel als LM:NT).', 'Ongeldige hash');
        return;
      }
      try {
        const saved = cur ? await api('PUT', `/api/credentials/${cur.id}`, data) : await api('POST', '/api/credentials', data);
        selectedId = saved.id;
        mode = 'view';
        await loadCreds();
        notify(cur ? 'Credential bijgewerkt' : 'Credential opgeslagen');
        render();
      } catch (e) { errorBox(e.message); }
    };

    const remove = async () => {
      if (!cur) return;
      const answer = await msgBox(`Credential '${cur.label}' verwijderen?`, { title: 'Bevestigen', iconName: 'question', buttons: ['Ja', 'Nee'] });
      if (answer !== 'Ja') return;
      await api('DELETE', `/api/credentials/${cur.id}`);
      await loadCreds();
      selectedId = S.creds[0]?.id || null;
      mode = S.creds.length ? 'view' : 'new';
      render();
    };

    const listbox = h('div', { class: 'listbox field' }, S.creds.length
      ? S.creds.map((c) => h('div', {
        class: `lb-item ${mode !== 'new' && c.id === selectedId ? 'sel' : ''}`,
        onmousedown: () => { selectedId = c.id; mode = 'view'; render(); },
      }, credSwatch(c.id), icon(c.username ? 'user' : 'anon'), h('div', null, c.label,
        h('small', null, c.username ? `${c.domain ? `${c.domain}\\` : ''}${c.username}` : 'null session', c.has_hash ? ' · NT-hash' : ''))))
      : h('div', { class: 'lb-empty' }, '(leeg)'));

    fill(d.body, h('div', { class: 'cred-dlg' },
      h('div', null,
        h('div', { style: { marginBottom: '4px' } }, 'Opgeslagen credentials:'),
        listbox,
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
          h('button', { class: 'btn', onclick: () => { mode = 'new'; render(); } }, 'Nieuw...'),
          h('button', { class: 'btn', disabled: !cur, onclick: remove }, 'Verwijderen'))),
      h('div', null,
        h('fieldset', null, h('legend', null, cur ? 'Eigenschappen' : 'Nieuwe credential'),
          frow('Naam:', f.label, 'cr-label'),
          frow('Domein:', f.domain, 'cr-domain'),
          frow('Gebruikersnaam:', f.username, 'cr-user'),
          h('div', { class: 'hint' }, 'Leeg laten voor een null session.'),
          frow('Wachtwoord:', f.password, 'cr-pw'),
          frow('NT-hash:', f.nthash, 'cr-hash'),
          h('div', { class: 'hint' }, 'Een ingevulde hash gaat voor het wachtwoord (pass-the-hash).'),
          h('div', { class: 'frow' }, h('span'), h('label', { class: 'check' }, showPw, 'Tekens tonen')),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
            h('button', { class: 'btn default', onclick: save }, cur ? 'Toepassen' : 'Opslaan'))),
        h('div', { class: 'hint', style: { margin: 0 } },
          'Opgeslagen in data/store.json (chmod 600). Wachtwoorden worden nooit naar de browser teruggestuurd.'))));
    (mode === 'new' ? f.label : null)?.focus();
  };

  fill(d.foot, h('button', { class: 'btn default', onclick: d.close }, 'OK'));
  render();
  d.center();
}

/* ---------- targets ---------- */

function openTargetsDialog() {
  const d = dialog({ title: 'Targets toevoegen', iconName: 'addhost', width: 560 });
  const ta = h('textarea', { rows: 8, style: { width: '100%' }, spellcheck: 'false', placeholder: '192.168.1.10\n192.168.1.0/24\n10.0.0.1-50\n10.0.0.10-10.0.1.20\n10.0.1-3.*\nfileserver.corp.local' });
  const parseBox = h('div', { class: 'parse-box field' }, 'Voer targets in, gescheiden door enters, spaties of komma\'s.');
  const cred = credSelect(curCred() || S.creds[0]?.id);
  cred.disabled = !S.creds.length;
  const threads = h('input', { type: 'number', min: 1, max: 256, value: 32 });
  const scanNow = h('input', { type: 'checkbox', checked: S.creds.length > 0, disabled: !S.creds.length });
  const keepClosed = h('input', { type: 'checkbox' });
  scanNow.addEventListener('change', () => { keepClosed.disabled = !scanNow.checked; });

  const update = debounce(async () => {
    if (!ta.value.trim()) { fill(parseBox, 'Nog niets ingevoerd.'); return; }
    try {
      const r = await api('POST', '/api/targets/parse', { text: ta.value });
      fill(parseBox,
        h('div', null, h('span', { class: 'cnt' }, r.count.toLocaleString('nl-NL')), ` host${r.count === 1 ? '' : 's'}`),
        r.sample.length > 0 && h('div', null, r.sample.join(', '), r.count > r.sample.length ? ', ...' : ''),
        r.errors.length > 0 && h('div', { class: 'errs' }, r.errors.join('\n')));
    } catch (e) { fill(parseBox, h('div', { class: 'errs' }, e.message)); }
  }, 250);
  ta.addEventListener('input', update);
  const example = (t) => h('button', { class: 'btn small', onclick: () => { ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + t; update(); ta.focus(); } }, t);

  const importFile = h('input', { type: 'file', accept: '.xml,.nessus', style: { display: 'none' } });
  importFile.addEventListener('change', async () => {
    const f = importFile.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch('/api/hosts/import', { method: 'POST', headers: { 'X-SMBB': '1' }, body: fd });
      const j = await r.json();
      if (j.status !== 'ok') throw new Error(j.message);
      const ips = j.data.ips || [];
      if (ips.length) ta.value = (ta.value ? ta.value + '\n' : '') + ips.join('\n');
      update();
      notify(`${j.data.added} nieuwe hosts geladen uit ${f.name}`);
    } catch (e) { errorBox(e.message); }
    importFile.value = '';
  });

  fill(d.body,
    h('div', { style: { marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('span', null, 'IP-adressen, ranges of hostnames:'),
      h('button', { class: 'btn small', onclick: () => importFile.click(), title: 'Importeer hosts uit nmap XML of Nessus bestand' }, icon('open'), ' Importeer nmap/Nessus...'),
    ),
    importFile,
    ta,
    h('div', { class: 'examples' }, 'Voorbeelden:', example('192.168.1.0/24'), example('10.0.0.1-254'), example('10.0.0.10-10.0.0.40'), example('172.16.1-4.*')),
    h('fieldset', null, h('legend', null, 'Resultaat'), parseBox),
    h('fieldset', null, h('legend', null, 'Scannen'),
      h('div', null, h('label', { class: 'check' }, scanNow, 'Direct scannen na toevoegen')),
      h('div', { style: { margin: '6px 0 8px' } }, h('label', { class: 'check' }, keepClosed, 'Ook hosts bewaren waarop poort 445 dicht is')),
      frow('Credential:', S.creds.length ? cred : h('span', null, '(voeg eerst een credential toe)'), 'tg-cred'),
      frow('SMB-logins tegelijk:', threads, 'tg-threads'),
      h('div', { class: 'hint', style: { margin: 0 } },
        'Eerst wordt poort 445 op alle adressen gecontroleerd (256 tegelijk). Alleen hosts die reageren gaan door naar de login. '
        + 'Zonder het tweede vinkje worden alleen bereikbare hosts bewaard. Dat houdt grote ranges overzichtelijk. '
        + 'Loopt er al een scan, dan sluiten deze targets achteraan in de wachtrij aan.')));

  const submit = async () => {
    if (!ta.value.trim()) { errorBox('Voer minstens één target in.'); return; }
    try {
      const r = await api('POST', '/api/targets', {
        text: ta.value, scan: scanNow.checked, keep_closed: keepClosed.checked, cred_id: cred.value, threads: Number(threads.value),
      });
      d.close();
      const ignored = r.errors.length ? `, ${r.errors.length} regel(s) genegeerd` : '';
      notify(r.keep_closed
        ? `${r.added} nieuwe target(s) toegevoegd${ignored}`
        : `${r.total.toLocaleString('nl-NL')} adressen in de scanwachtrij; bereikbare hosts verschijnen vanzelf${ignored}`);
      if (!S.showAll && !scanNow.checked) setPref('showAll', true);
      await loadHosts();
      if (r.job) { S.job = r.job; pollJob(); }
    } catch (e) { errorBox(e.message); }
  };

  fill(d.foot,
    h('span', { class: 'grow' }, 'Maximaal 65.536 adressen per keer.'),
    h('button', { class: 'btn default', onclick: submit }, S.job?.running ? 'Aan wachtrij toevoegen' : 'Toevoegen'),
    h('button', { class: 'btn', onclick: d.close }, 'Annuleren'));
  d.center();
  ta.focus();
}

/* ---------- scannen ---------- */

async function openScanDialog(ips) {
  if (!S.creds.length) { await errorBox('Voeg eerst een credential toe.'); openCredsDialog(); return; }
  if (!S.hosts.length) { await errorBox('Voeg eerst targets toe.'); openTargetsDialog(); return; }
  const d = dialog({ title: ips ? `Scannen: ${ips.length > 3 ? `${ips.length} hosts` : ips.join(', ')}` : 'Scannen', iconName: 'scan', width: 460 });
  const cred = credSelect(curCred() || S.creds[0].id);
  const threads = h('input', { type: 'number', min: 1, max: 256, value: 32 });

  // Welke hosts er in een selectie vallen hangt af van de gekozen credential.
  const SCOPES = [
    ['all', 'Alle targets', () => true],
    ['pending', 'Nog niet gescand met deze credential', (x) => ['pending', 'unscanned'].includes(x.status)],
    ['reachable', 'Poort 445 open', (x) => ['ok', 'auth_failed', 'error', 'unscanned'].includes(x.status)],
    ['failed', 'Mislukt / login fout', (x) => ['auth_failed', 'error'].includes(x.status)],
  ];
  const scopeIps = (key) => {
    const pick = SCOPES.find(([k]) => k === key)[2];
    return S.rawHosts.map((x) => hostCtx(x, cred.value)).filter(pick).map((x) => x.ip);
  };
  const radios = h('div', { class: 'radios' });
  const renderScopes = () => {
    const prev = radios.querySelector('input:checked')?.value || (scopeIps('pending').length ? 'pending' : 'all');
    fill(radios, SCOPES.map(([key, label]) => h('label', { class: 'check' },
      h('input', { type: 'radio', name: 'scope', value: key, checked: key === prev }),
      h('span', null, label, ' ', h('small', null, `(${scopeIps(key).length})`)))));
  };
  cred.addEventListener('change', renderScopes);
  renderScopes();

  fill(d.body,
    !ips && h('fieldset', null, h('legend', null, 'Welke hosts'), radios),
    h('fieldset', null, h('legend', null, 'Instellingen'),
      frow('Credential:', cred, 'sc-cred'),
      frow('Gelijktijdig:', threads, 'sc-threads')),
    h('div', { class: 'msg', style: { padding: 0 } }, icon('info'),
      'Resultaten worden per credential bewaard. Open een tabblad per credential om te vergelijken wat elke gebruiker kan zien.'));

  const start = async () => {
    const list = ips || scopeIps(radios.querySelector('input:checked').value);
    if (!list.length) { errorBox('Er vallen geen hosts in deze selectie.'); return; }
    try {
      S.job = await api('POST', '/api/scan', { ips: list, cred_id: cred.value, threads: Number(threads.value) });
      d.close();
      renderStatus();
      loadHosts();
      pollJob();
    } catch (e) { errorBox(e.message); }
  };
  fill(d.foot, h('button', { class: 'btn default', onclick: start }, S.job?.running ? 'Aan wachtrij toevoegen' : 'Start'), h('button', { class: 'btn', onclick: d.close }, 'Annuleren'));
  d.center();
}

/* ---------- voorbeeld & eigenschappen ---------- */

async function openPreview(entry) {
  const params = fileParams(entry);
  const d = dialog({ title: `${entry.name} - Voorbeeld`, iconName: category(entry).icon });
  const wrap = h('input', { type: 'checkbox' });
  const box = h('div', { class: 'preview' });
  fill(d.body, box);
  fill(d.foot,
    h('span', { class: 'grow' }, `${fmtSize(entry.size)} · ${fmtDate(entry.mtime)}`),
    h('label', { class: 'check' }, wrap, 'Terugloop'),
    h('button', { class: 'btn', onclick: () => copyText(currentUnc(entry)) }, 'UNC-pad'),
    h('button', { class: 'btn', onclick: () => downloadEntry(entry) }, 'Downloaden'),
    h('button', { class: 'btn default', onclick: d.close }, 'Sluiten'));

  if (INLINE_IMG.test(entry.name)) {
    const img = h('img', { src: `/api/download?${params}&inline=1`, alt: entry.name, onload: () => d.center() });
    fill(box, h('div', { class: 'img-wrap field' }, img));
    d.center();
    return;
  }
  fill(box, h('pre', { class: 'field' }, 'Laden...'));
  d.center();
  try {
    const r = await api('GET', `/api/preview?${params}`);
    const pre = h('pre', { class: 'field' }, r.binary ? r.hex : r.text);
    wrap.addEventListener('change', () => pre.classList.toggle('wrap', wrap.checked));
    fill(box, pre,
      r.binary && h('div', { class: 'trunc' }, 'Binair bestand: hexdump van de eerste 4 KB.'),
      !r.binary && r.truncated && h('div', { class: 'trunc' }, 'Voorbeeld ingekort tot 512 KB. Download het bestand voor de volledige inhoud.'));
  } catch (e) {
    fill(box, h('div', { class: 'msg' }, icon('alert', 'big'), `Voorbeeld niet beschikbaar.\n\n${e.message}`));
  }
  d.center();
}

function openPropertiesDialog(e) {
  const d = dialog({ title: `Eigenschappen van ${e.name}`, iconName: category(e).icon, width: 380 });
  const row = (k, v) => h('tr', null, h('td', null, k), h('td', { style: { userSelect: 'text' } }, v));
  const attrs = ATTR_BADGES.filter(([bit]) => e.attrs & bit).map(([, , , title]) => title);
  fill(d.body,
    h('div', { class: 'msg', style: { alignItems: 'center' } }, icon(category(e).icon, 'big'), h('b', null, e.name)),
    h('fieldset', null, h('table', { class: 'legend-table' },
      row('Type:', `${category(e).label}${extOf(e.name) && !e.dir ? ` (.${extOf(e.name)})` : ''}`),
      row('Locatie:', currentUnc()),
      e.dir && row('Toegang:', accessText(dirAccess(e))),
      !e.dir && row('Grootte:', `${fmtSize(e.size)} (${e.size.toLocaleString('nl-NL')} bytes)`),
      row('Gemaakt:', fmtDate(e.ctime)),
      row('Gewijzigd:', fmtDate(e.mtime)),
      row('Attributen:', attrs.length ? attrs.join(', ') : 'Geen'))));
  fill(d.foot, h('button', { class: 'btn default', onclick: d.close }, 'OK'));
  d.center();
}

/* ---------- legenda, info, afsluiten ---------- */

function legendTable() {
  return h('table', { class: 'legend-table' },
    CATEGORIES.map((c) => h('tr', { class: `cat-${c.key}` },
      h('td', null, h('span', { class: 'sw', style: { background: `var(--c-${c.key})` } })),
      h('td', null, icon(c.icon)),
      h('td', { style: { color: `var(--c-${c.key})`, fontWeight: ['secret', 'exec'].includes(c.key) ? 'bold' : null } }, c.label))),
    h('tr', null, h('td', { colspan: 3, style: { paddingTop: '8px' } }, h('b', null, 'Attributen'))),
    ATTR_BADGES.map(([, letter, cls, title]) => h('tr', null, h('td', null), h('td', { class: 'attrs' }, h('span', { class: `attr ${cls}` }, letter)), h('td', null, title))));
}

function openLegendDialog() {
  const d = dialog({ title: 'Kleurenlegenda', iconName: 'palette', width: 300 });
  fill(d.body, legendTable());
  fill(d.foot, h('button', { class: 'btn default', onclick: d.close }, 'OK'));
  d.center();
}

function openAboutDialog() {
  const d = dialog({ title: 'Info over SMBrowser95', iconName: 'info' });
  fill(d.body, h('div', { class: 'about' }, icon('network', 'big'), h('div', null,
    h('b', null, 'SMBrowser95'), h('br'), 'Versie 1.0', h('br'), h('br'),
    'Scant hosts en ranges op SMB, inventariseert shares en laat u door leesbare shares bladeren.', h('br'), h('br'),
    'Dubbelklik om te openen, rechtsklik voor meer opties. Backspace gaat omhoog, F5 vernieuwt.', h('br'), h('br'),
    `${S.creds.length} credential(s) · ${S.hosts.length} target(s)`)));
  fill(d.foot, h('button', { class: 'btn default', onclick: d.close }, 'OK'));
  d.center();
}

function openShutdownDialog() {
  msgBox('De webinterface kan de server niet zelf afsluiten.\n\nStop de server op de machine waar hij draait met:\n\npython3 smbbrowser.py stop', { title: 'SMBrowser95 afsluiten', iconName: 'shutdown' });
}

/* ======================== venster & taakbalk ======================== */

function minimize(on) {
  $('#win').classList.toggle('minimized', on);
  $('#task-win').classList.toggle('active', !on);
}

/* ======================== SMBserver95 venster ======================== */

let SRV = {
  running: false, cfg: {}, log: [], log_seq: 0, files: null, curPath: '', has_impacket: true,
  interfaces: null,
  hashes: [], hash_seq: 0, hashSel: new Set(), hashAnchor: null,
  conns: [], conn_seq: 0, srvTab: 'hashes',
};
let _srvPollTimer = null;

function minimizeServer(on) {
  $('#win-server').classList.toggle('minimized', on);
  $('#task-server').classList.toggle('active', !on);
  if (on) clearTimeout(_srvPollTimer);
  else { renderServerPanel(); renderServerBreadcrumb(); if (SRV.files === null) loadServerFiles(''); }
}

function focusWindow(which) {
  const isSrv = which === 'server';
  $('#titlebar').classList.toggle('inactive', isSrv);
  $('#titlebar-server').classList.toggle('inactive', !isSrv);
  $('#win').style.zIndex = isSrv ? '1' : '2';
  $('#win-server').style.zIndex = isSrv ? '2' : '1';
}

async function loadServerStatus() {
  try {
    const [data] = await Promise.all([
      api('GET', `/api/server?since=${SRV.log_seq}`),
      SRV.interfaces === null
        ? api('GET', '/api/server/interfaces').then((d) => { SRV.interfaces = d; }).catch(() => { SRV.interfaces = []; })
        : Promise.resolve(),
    ]);
    const wasRunning = SRV.running;
    const newHashes = (data.hashes || []).filter((h) => h.seq > SRV.hash_seq);
    const newConns = (data.conns || []).filter((c) => c.seq > SRV.conn_seq);
    Object.assign(SRV, {
      running: data.running,
      cfg: data.cfg || {},
      root: data.root,
      log: [...SRV.log, ...data.log].slice(-200),
      log_seq: data.log_seq,
      has_impacket: data.has_impacket !== false,
      hashes: [...SRV.hashes, ...newHashes].slice(-1000),
      hash_seq: data.hash_seq ?? SRV.hash_seq,
      conns: [...SRV.conns, ...newConns].slice(-500),
      conn_seq: data.conn_seq ?? SRV.conn_seq,
    });
    if (newHashes.length && SRV.srvTab === 'hashes') renderHashTable();
    if (newConns.length && SRV.srvTab === 'conns') renderConnTable();
    renderServerPanel();
    if (!wasRunning && data.running) loadServerFiles(SRV.curPath);
    scheduleServerPoll();
  } catch { /* ignore */ }
}

function scheduleServerPoll() {
  clearTimeout(_srvPollTimer);
  // Alleen pollen terwijl server draait, zodat config-formulier niet wordt overschreven
  if (SRV.running && !$('#win-server').classList.contains('minimized'))
    _srvPollTimer = setTimeout(loadServerStatus, 3000);
}

async function startServer() {
  const share = ($('#srv-share')?.value || '').trim().toUpperCase() || 'SHARE';
  const port = parseInt($('#srv-port')?.value) || 4445;
  const listen = $('#srv-listen')?.value || '0.0.0.0';
  const password = $('#srv-password')?.value || '';
  const smb2 = $('#srv-smb2')?.checked !== false;
  try {
    const data = await api('POST', '/api/server/start', { share, port, listen, password, smb2 });
    Object.assign(SRV, {
      running: data.running, cfg: data.cfg,
      log: [...SRV.log, ...data.log].slice(-200), log_seq: data.log_seq,
    });
    renderServerPanel();
    loadServerFiles('');
    scheduleServerPoll();
  } catch (e) { errorBox(e.message, 'SMBserver95'); }
}

async function stopServer() {
  try {
    const data = await api('POST', '/api/server/stop', {});
    Object.assign(SRV, {
      running: data.running, cfg: data.cfg,
      log: [...SRV.log, ...data.log].slice(-200), log_seq: data.log_seq,
    });
    renderServerPanel();
    clearTimeout(_srvPollTimer);
  } catch (e) { errorBox(e.message, 'SMBserver95'); }
}

async function loadServerFiles(path) {
  SRV.curPath = path;
  renderServerBreadcrumb();
  const el = $('#srv-files-list');
  if (el) fill(el, h('div', { class: 'empty' }, 'Laden...'));
  try {
    SRV.files = await api('GET', `/api/server/files?${qs({ path })}`);
  } catch { SRV.files = []; }
  renderServerFiles();
}

function renderServerFiles() {
  const el = $('#srv-files-list');
  if (!el || !SRV.files) return;
  const path = SRV.curPath;
  if (!SRV.files.length) { fill(el, h('div', { class: 'empty' }, '(lege map)')); return; }

  const SRV_ICON_MAP = { archive: 'archive', image: 'image', link: 'link', exec: 'exec', code: 'code', doc: 'doc', database: 'database' };
  const srvIcon = (f) => {
    if (f.dir) return 'folder';
    const cat = CATEGORIES.find((c) => c.re && c.re.test(f.name));
    return (cat && SRV_ICON_MAP[cat.key]) || 'file';
  };

  const rows = SRV.files.map((f) => {
    const sub = path ? `${path}/${f.name}` : f.name;
    return h('tr', { class: 'row' + (f.dir ? ' cat-dir' : ''), ondblclick: f.dir ? () => loadServerFiles(sub) : null },
      h('td', null, h('div', { class: 'fname' }, icon(srvIcon(f)), h('span', { class: 'n' }, f.name))),
      h('td', { class: 'c-size' }, f.dir ? '' : fmtSize(f.size)),
      h('td', null, fmtDate(f.mtime)),
      h('td', null,
        !f.dir && h('a', {
          class: 'btn small', title: 'Downloaden',
          href: `/api/server/download?${qs({ path: sub })}`, download: f.name,
        }, icon('download')),
      ),
      h('td', null, h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); confirmDeleteServer(sub, f); } }, icon('trash'))),
    );
  });

  fill(el, h('table', { class: 'files' },
    h('thead', null, h('tr', null,
      h('th', null, 'Naam'), h('th', null, 'Grootte'), h('th', null, 'Datum'),
      h('th', null, ''), h('th', null, ''),
    )),
    h('tbody', null, ...rows),
  ));
}

async function confirmDeleteServer(fullPath, entry) {
  const label = entry.dir ? `map "${entry.name}" en alles erin` : `bestand "${entry.name}"`;
  if (await msgBox(`${label} verwijderen?`, { title: 'SMBserver95', iconName: 'alert', buttons: ['Verwijderen', 'Annuleren'] }) !== 'Verwijderen') return;
  try {
    await api('POST', '/api/server/delete', { path: fullPath });
    loadServerFiles(SRV.curPath);
  } catch (e) { errorBox(e.message, 'SMBserver95'); }
}

async function serverMkdir() {
  const name = await promptBox('Naam van de nieuwe map:', { title: 'Nieuwe map — SMBserver95' });
  if (!name?.trim()) return;
  try {
    await api('POST', '/api/server/mkdir', { path: SRV.curPath, name: name.trim() });
    loadServerFiles(SRV.curPath);
  } catch (e) { errorBox(e.message, 'SMBserver95'); }
}

function pickServerUpload() {
  const inp = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    inp.remove();
    if (!inp.files.length) return;
    for (const f of inp.files) {
      const fd = new FormData(); fd.append('file', f);
      try {
        const res = await fetch(`/api/server/upload?${qs({ path: SRV.curPath })}`, {
          method: 'POST', headers: { 'X-SMBB': '1' }, body: fd,
        });
        const json = await res.json();
        if (json.status !== 'ok') throw new Error(json.message);
      } catch (e) { errorBox(e.message, 'SMBserver95'); return; }
    }
    loadServerFiles(SRV.curPath);
  });
  document.body.appendChild(inp); inp.click();
}

function renderServerPanel() {
  const panel = $('#srv-panel');
  if (!panel) return;
  const { running, cfg, log, has_impacket } = SRV;

  const displayAddr = cfg.listen && cfg.listen !== '0.0.0.0'
    ? cfg.listen
    : (SRV.interfaces?.length ? SRV.interfaces.map((i) => i.ip).join(', ') : '<IP>');
  const connInfo = running && cfg.port
    ? `\\\\${displayAddr}\\${cfg.share}  ·  poort ${cfg.port}${cfg.password ? '  ·  gebruiker: smb' : '  ·  anoniem'}`
    : '';

  const ifaceOptions = [
    h('option', { value: '0.0.0.0' }, 'Alle interfaces (0.0.0.0)'),
    ...(SRV.interfaces || []).map((i) =>
      h('option', { value: i.ip, selected: cfg.listen === i.ip },
        i.name ? `${i.ip}  (${i.name})` : i.ip)
    ),
  ];

  const cfgForm = !running && h('div', { class: 'srv-cfg-form' },
    h('label', null, 'Share naam'), h('input', { id: 'srv-share', maxlength: 12, value: cfg.share || 'SHARE', placeholder: 'SHARE' }),
    h('label', null, 'Poort (SMB)'), h('input', { id: 'srv-port', type: 'number', min: 1025, max: 65535, value: cfg.port || 4445 }),
    h('label', null, 'Luisteradres'), h('select', { id: 'srv-listen' }, ...ifaceOptions),
    h('label', null, 'Wachtwoord'), h('input', { id: 'srv-password', type: 'password', placeholder: '(leeg = anoniem)' }),
    h('span', null),
    h('label', { class: 'srv-smb2-label' },
      h('input', { id: 'srv-smb2', type: 'checkbox', checked: cfg.smb2 !== false }),
      ' SMB2/3 inschakelen (vereist voor Windows 10/11)',
    ),
  );

  const logEl = log.length && h('div', { class: 'srv-log' },
    log.slice(-8).reverse().map((e) =>
      h('div', { class: 'srv-log-line' },
        h('span', { class: 'srv-log-time' }, new Date(e.ts * 1000).toLocaleTimeString('nl-NL')), ' ', e.msg,
      ),
    ),
  );

  fill(panel,
    h('div', { class: 'srv-status-row' },
      h('span', { class: running ? 'srv-on' : 'srv-off' }, running ? '▶ Actief' : '■ Gestopt'),
      connInfo && h('span', { class: 'srv-conninfo' }, connInfo),
      h('div', { style: { flex: '1' } }),
      running
        ? h('button', { class: 'btn', onclick: stopServer }, icon('stop'), ' Stoppen')
        : h('button', {
            class: 'btn default', onclick: has_impacket ? startServer : null, disabled: !has_impacket,
            title: has_impacket ? 'SMB-share starten' : 'impacket niet geïnstalleerd',
          }, icon('netlink'), ' Starten'),
    ),
    cfgForm,
    !has_impacket && h('div', { class: 'empty err' }, 'impacket ontbreekt. Installeer: pip install impacket'),
    logEl,
  );

  const sb = $('#srv-status-bar');
  if (sb) sb.textContent = running ? `Actief · \\\\${displayAddr}\\${cfg.share} · poort ${cfg.port}` : 'Gestopt';
}

function renderServerBreadcrumb() {
  const bc = $('#srv-breadcrumb');
  if (!bc) return;
  const parts = (SRV.curPath || '').split('/').filter(Boolean);
  fill(bc,
    h('button', { class: 'btn small', onclick: () => loadServerFiles('') }, icon('drive'), ' Root'),
    ...parts.map((p, i) => [
      h('span', null, ' › '),
      h('button', { class: 'btn small', onclick: () => loadServerFiles(parts.slice(0, i + 1).join('/')) }, p),
    ]).flat(),
  );
}

function buildServerWindow() {
  const body = $('#srv-body');
  if (!body || body.children.length) return;
  fill(body,
    h('div', { class: 'srv-top' },
      h('div', { class: 'srv-panel', id: 'srv-panel' }),
      h('div', { class: 'srv-files-section' },
        h('div', { class: 'srv-files-bar' },
          h('div', { id: 'srv-breadcrumb', class: 'srv-breadcrumb' }),
          h('button', { class: 'btn small', onclick: pickServerUpload }, icon('upload'), ' Uploaden'),
          h('button', { class: 'btn small', onclick: serverMkdir }, icon('newfolder'), ' Nieuwe map'),
          h('button', { class: 'btn small', onclick: () => loadServerFiles(SRV.curPath) }, icon('refresh')),
        ),
        h('div', { class: 'list field', id: 'srv-files-list' }),
      ),
    ),
    h('div', { class: 'srv-hsplit', id: 'srv-hsplit' }),
    h('div', { class: 'srv-hashes-section' },
      h('div', { class: 'srv-hashes-bar' },
        h('button', { class: 'btn small srv-tab-btn', id: 'srv-tab-hashes', onclick: () => switchSrvTab('hashes') }, icon('hash'), ' Hashes'),
        h('button', { class: 'btn small srv-tab-btn', id: 'srv-tab-conns', onclick: () => switchSrvTab('conns') }, icon('netlink'), ' Verbindingen'),
        h('div', { style: { flex: '1' } }),
        h('span', { id: 'srv-tab-actions-hashes' },
          h('button', { class: 'btn small', onclick: copySelectedHashes, title: 'Kopieer geselecteerde hashes (JtR-formaat)' }, icon('copy'), ' Kopieer'),
          h('button', { class: 'btn small', onclick: exportHashcat, title: 'Exporteer hashes in hashcat-formaat (.txt)' }, icon('download'), ' Hashcat'),
          h('button', { class: 'btn small', onclick: clearHashes, title: 'Wis alle gevangen hashes' }, icon('trash'), ' Wissen'),
        ),
        h('span', { id: 'srv-tab-actions-conns' },
          h('button', { class: 'btn small', onclick: clearConns, title: 'Wis verbindingslog' }, icon('trash'), ' Wissen'),
        ),
      ),
      h('div', { class: 'list field', id: 'srv-hashes-list' }),
      h('div', { class: 'list field', id: 'srv-conns-list' }),
    ),
  );
  renderServerPanel();
  renderServerBreadcrumb();
  switchSrvTab(SRV.srvTab);
  loadServerFiles('');
  makeSrvHsplit();
}

function makeSrvHsplit() {
  const splitter = $('#srv-hsplit');
  if (!splitter) return;
  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const body = $('#srv-body');
    const hashSec = splitter.nextElementSibling;
    const startY = e.clientY;
    const startH = hashSec.getBoundingClientRect().height;
    const move = (ev) => {
      const delta = startY - ev.clientY;
      const newH = Math.max(60, Math.min(body.getBoundingClientRect().height - 100, startH + delta));
      hashSec.style.height = `${newH}px`;
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

function renderHashTable() {
  const el = $('#srv-hashes-list');
  if (!el) return;
  const hashes = SRV.hashes;
  if (!hashes.length) {
    fill(el, h('div', { class: 'empty' }, 'Nog geen hashes onderschept. Verbind een Windows-client met \\\\<IP>\\share.'));
    return;
  }
  const hashClick = (e, h) => {
    const seq = h.seq;
    if (e.shiftKey && SRV.hashAnchor != null) {
      const idxA = hashes.findIndex((x) => x.seq === SRV.hashAnchor);
      const idxB = hashes.findIndex((x) => x.seq === seq);
      const [lo, hi] = [Math.min(idxA, idxB), Math.max(idxA, idxB)];
      for (let i = lo; i <= hi; i++) SRV.hashSel.add(hashes[i].seq);
    } else if (e.ctrlKey || e.metaKey) {
      if (SRV.hashSel.has(seq)) SRV.hashSel.delete(seq); else SRV.hashSel.add(seq);
      SRV.hashAnchor = seq;
    } else {
      SRV.hashSel = new Set([seq]);
      SRV.hashAnchor = seq;
    }
    renderHashTable();
  };
  const hashRmb = (e, h) => {
    e.preventDefault();
    if (!SRV.hashSel.has(h.seq)) { SRV.hashSel = new Set([h.seq]); SRV.hashAnchor = h.seq; renderHashTable(); }
    const sel = hashes.filter((x) => SRV.hashSel.has(x.seq));
    showMenu(e.clientX, e.clientY, [
      { label: 'Kopieer hash', iconName: 'copy', action: () => copyText(h.full_hash) },
      sel.length > 1 && { label: `Kopieer ${sel.length} geselecteerde hashes`, iconName: 'copy', action: () => copyText(sel.map((x) => x.full_hash).join('\n')) },
      { label: 'Kopieer gebruikersnaam', iconName: 'user', action: () => copyText(h.user) },
      { sep: true },
      { label: 'Verwijder rij', iconName: 'trash', action: () => { SRV.hashes = SRV.hashes.filter((x) => x.seq !== h.seq); SRV.hashSel.delete(h.seq); renderHashTable(); } },
    ].filter(Boolean));
  };
  const table = h('table', { class: 'hash-table' },
    h('thead', null, h('tr', null,
      h('th', { style: { width: '22%' } }, 'Gebruiker'),
      h('th', { style: { width: '26%' } }, 'Domein'),
      h('th', { style: { width: '10%' } }, 'Type'),
      h('th', null, 'Hash preview'),
    )),
    h('tbody', null, ...hashes.map((entry) =>
      h('tr', {
        class: SRV.hashSel.has(entry.seq) ? 'sel' : '',
        onclick: (e) => hashClick(e, entry),
        oncontextmenu: (e) => hashRmb(e, entry),
        title: entry.full_hash,
      },
        h('td', null, entry.user),
        h('td', null, entry.domain || '—'),
        h('td', null, h('span', { class: entry.type === 'NTLMv2' ? 'srv-ntlmv2' : 'srv-ntlmv1' }, entry.type)),
        h('td', { class: 'srv-hash-preview' }, entry.hash_preview),
      ),
    )),
  );
  fill(el, table);
}

async function copySelectedHashes() {
  const sel = SRV.hashes.filter((x) => SRV.hashSel.has(x.seq));
  const text = (sel.length ? sel : SRV.hashes).map((x) => x.full_hash).join('\n');
  if (!text) return;
  await copyText(text);
  notify(sel.length ? `${sel.length} hash(es) gekopieerd` : `Alle ${SRV.hashes.length} hashes gekopieerd`);
}

async function clearHashes() {
  SRV.hashes = []; SRV.hash_seq = 0; SRV.hashSel = new Set(); SRV.hashAnchor = null;
  renderHashTable();
  await api('POST', '/api/server/hashes/clear', {});
}

function switchSrvTab(tab) {
  SRV.srvTab = tab;
  const isHash = tab === 'hashes';
  const hl = $('#srv-hashes-list');
  const cl = $('#srv-conns-list');
  const ah = $('#srv-tab-actions-hashes');
  const ac = $('#srv-tab-actions-conns');
  if (hl) hl.style.display = isHash ? '' : 'none';
  if (cl) cl.style.display = isHash ? 'none' : '';
  if (ah) ah.style.display = isHash ? '' : 'none';
  if (ac) ac.style.display = isHash ? 'none' : '';
  $('#srv-tab-hashes')?.classList.toggle('active', isHash);
  $('#srv-tab-conns')?.classList.toggle('active', !isHash);
  if (isHash) renderHashTable(); else renderConnTable();
}

function renderConnTable() {
  const el = $('#srv-conns-list');
  if (!el) return;
  if (!SRV.conns.length) {
    fill(el, h('div', { class: 'empty' }, 'Nog geen verbindingen ontvangen.'));
    return;
  }
  const table = h('table', { class: 'hash-table' },
    h('thead', null, h('tr', null,
      h('th', { style: { width: '16%' } }, 'Tijdstip'),
      h('th', { style: { width: '26%' } }, 'IP'),
      h('th', { style: { width: '16%' } }, 'Poort'),
      h('th', null, 'Dialect'),
    )),
    h('tbody', null, ...SRV.conns.map((c) =>
      h('tr', null,
        h('td', null, new Date(c.ts * 1000).toLocaleTimeString('nl-NL')),
        h('td', null, c.ip),
        h('td', null, c.port ? String(c.port) : '—'),
        h('td', null, c.dialect || '—'),
      ),
    )),
  );
  fill(el, table);
}

async function clearConns() {
  SRV.conns = []; SRV.conn_seq = 0;
  renderConnTable();
  await api('POST', '/api/server/conns/clear', {});
}

function exportHashcat() {
  const hashes = SRV.hashSel.size
    ? SRV.hashes.filter((x) => SRV.hashSel.has(x.seq))
    : SRV.hashes;
  if (!hashes.length) { notify('Geen hashes om te exporteren'); return; }
  // hashcat format is identical to JtR NTLMv2: user::domain:challenge:hash:blob
  const text = hashes.map((x) => x.full_hash).join('\r\n') + '\r\n';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hashes_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  notify(`${hashes.length} hash(es) geëxporteerd`);
}

function makeDraggable(win, titlebar) {
  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || win.classList.contains('maximized')) return;
    const r = win.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev) => {
      win.style.left = `${ev.clientX - ox}px`;
      win.style.top = `${Math.max(0, ev.clientY - oy)}px`;
      win.style.right = 'auto'; win.style.bottom = 'auto';
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

function initServerChrome() {
  document.querySelectorAll('#win-server [data-icon]').forEach((el) => {
    const i = icon(el.dataset.icon, el.className || '');
    el.replaceWith(i);
  });

  $('#tb-server-min').addEventListener('click', () => minimizeServer(true));
  $('#tb-server-max').addEventListener('click', () => { $('#win-server').classList.toggle('maximized'); });
  $('#tb-server-close').addEventListener('click', () => minimizeServer(true));
  $('#titlebar-server').addEventListener('dblclick', (e) => {
    if (!e.target.closest('button')) $('#win-server').classList.toggle('maximized');
  });
  $('#task-server').addEventListener('click', () => {
    const win = $('#win-server');
    const active = !$('#titlebar-server').classList.contains('inactive');
    if (win.classList.contains('minimized')) { minimizeServer(false); focusWindow('server'); buildServerWindow(); loadServerStatus(); }
    else if (active) minimizeServer(true);
    else focusWindow('server');
  });
  $('#desk-server').addEventListener('dblclick', () => {
    minimizeServer(false); focusWindow('server'); buildServerWindow(); loadServerStatus();
  });
  $('#win-server').addEventListener('mousedown', () => focusWindow('server'));
  $('#win').addEventListener('mousedown', () => focusWindow('browser'));
  makeDraggable($('#win-server'), $('#titlebar-server'));
}

function initChrome() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const i = icon(el.dataset.icon, el.className || '');
    el.replaceWith(i);
  });
  $('#tb-min').addEventListener('click', () => minimize(true));
  $('#tb-max').addEventListener('click', () => $('#win').classList.toggle('maximized'));
  $('#tb-close').addEventListener('click', () => minimize(true));
  $('#titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) $('#win').classList.toggle('maximized'); });
  $('#task-win').addEventListener('click', () => minimize(!$('#win').classList.contains('minimized')));
  $('#desk-app').addEventListener('dblclick', () => { minimize(false); goRoot(); });
  $('#desk-creds').addEventListener('dblclick', () => { minimize(false); openCredsDialog(); });
  $('#start-btn').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (openMenuEl?.classList.contains('startmenu')) closeMenu(); else openStartMenu();
  });

  document.querySelectorAll('.menubar button').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (btn.classList.contains('open')) closeMenu(); else openMenubar(btn);
    });
    btn.addEventListener('mouseenter', () => {
      if (openMenuEl && document.querySelector('.menubar button.open') && !btn.classList.contains('open')) openMenubar(btn);
    });
  });

  const clock = () => { $('#clock').textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); };
  clock();
  setInterval(clock, 10000);

  // versleepbare scheiding tussen boom en lijst
  const pane = $('#tree-pane');
  const saved = Number(localStorageGet('smbb.treeWidth'));
  if (saved) pane.style.width = `${saved}px`;
  $('#splitter').addEventListener('mousedown', (e) => {
    const startX = e.clientX;
    const startW = pane.offsetWidth;
    const move = (ev) => { pane.style.width = `${Math.max(160, Math.min(startW + ev.clientX - startX, 700))}px`; };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      localStorageSet('smbb.treeWidth', pane.offsetWidth);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  $('#addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') goAddress(e.target.value); if (e.key === 'Escape') renderAddress(); });
  $('#addr').addEventListener('focus', (e) => e.target.select());
  $('#cred-select').addEventListener('change', (e) => setTabCred(e.target.value));
  $('#list-filter').addEventListener('input', debounce((e) => { S.listFilter = e.target.value; renderList(); }, 120));
  $('#f-open').addEventListener('change', (e) => setPref('showAll', !e.target.checked));
  $('#f-shares').addEventListener('change', (e) => setPref('onlyReadable', e.target.checked));
  $('#host-filter').addEventListener('input', debounce((e) => { S.hostFilter = e.target.value; renderTree(); if (S.view.kind === 'root') renderList(); }, 120));

  $('#list').addEventListener('mousedown', (e) => { if (!e.target.closest('tr.row') && !e.target.closest('button')) select(null); });
  $('#list').addEventListener('contextmenu', (e) => {
    if (e.target.closest('tr.row')) return;
    e.preventDefault();
    if (S.view.kind === 'share' && !S.error) { showMenu(e.clientX, e.clientY, folderMenu()); return; }
    showMenu(e.clientX, e.clientY, [
      { label: 'Vernieuwen', iconName: 'refresh', key: 'F5', action: refresh },
      { label: 'Omhoog', iconName: 'up', action: goUp, disabled: S.view.kind === 'root' },
      'sep',
      { label: 'Verborgen bestanden', checked: S.showHidden, action: () => setPref('showHidden', !S.showHidden) },
    ]);
  });

  const list = $('#list');
  list.addEventListener('dragover', (e) => {
    if (S.view.kind !== 'share' || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    list.classList.add('drop');
  });
  list.addEventListener('dragleave', () => list.classList.remove('drop'));
  list.addEventListener('drop', (e) => {
    list.classList.remove('drop');
    if (S.view.kind !== 'share' || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    uploadFiles([...e.dataTransfer.files], hereLoc());
  });

  document.addEventListener('keydown', (e) => {
    if ($('#dialog-root .dialog')) return;
    const typing = e.target.matches('input, textarea, select');
    if (e.key === 'F5') { e.preventDefault(); refresh(); return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navBack(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward(); return; }
    if (typing) return;
    if (S.view.kind === 'share' && !S.error && !S.loading && fileKey(e)) { e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); $('#list').focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); $('#list').focus(); }
    else if (e.key === 'Enter' && !e.target.matches('button, a')) openSelected();
    else if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
    else if (e.key === 'Delete' && S.view.kind === 'root' && S.hostSel.size) deleteHosts([...S.hostSel]);
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey) && S.list.multi) {
      e.preventDefault();
      S.hostSel = new Set(S.list.items.map(S.list.keyOf));
      hostSelectionChanged();
    } else if (e.key === 'Escape' && S.hostSel.size > 1) clearHostSel();
  });
}

function renderAll() {
  renderTabs();
  renderTitle();
  renderAddress();
  renderTree();
  renderList();
}

initChrome();
initServerChrome();
renderAll();
loadState().catch((e) => errorBox(`Laden mislukt: ${e.message}`));
