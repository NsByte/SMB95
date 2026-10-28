# SMB95: technical documentation

This document covers, in order:

- [Starting and stopping](#starting-and-stopping)
- [Targets](#targets)
- [What a scan does](#what-a-scan-does)
- [Tabs and credentials](#tabs-and-credentials)
- [Controls](#controls)
- [Colors and attributes](#colors-and-attributes)
- [Storage](#storage)
- [Security](#security)
- [Project structure](#project-structure)
- [API](#api)
- [Troubleshooting](#troubleshooting)

The interface is in Dutch. Where this document mentions a label from the interface, the Dutch text is shown first, followed by a translation.

## Starting and stopping

Everything goes through `smbbrowser.py`. The script only uses the Python standard library. On the first run it creates a virtualenv in `.venv/` with `flask` and `impacket`, unless those are already available in your Python.

```bash
python3 smbbrowser.py start      # start in the background
python3 smbbrowser.py status     # is it running, and on which address?
python3 smbbrowser.py stop
python3 smbbrowser.py restart
```

`start` and `restart` accept these options:

| Option | Meaning |
|---|---|
| `--expose` | Listen on all interfaces (`0.0.0.0`) instead of only `127.0.0.1`. A password is always required in this mode. Without `--password`, a random password is generated; it is shown at startup and by `status`. |
| `--password X` | Password for the web interface (HTTP basic auth; the username doesn't matter). Can also be set with the `SMBB_PASSWORD` environment variable. |
| `--port N` | Web port, default 8445. |
| `--smb-port N` | SMB port of the targets, default 445. |
| `--foreground` | Don't run in the background; stop with Ctrl+C. |

The server writes its log to `data/server.log`. The process ID and settings of the running server are kept in `data/run.json`.

## Targets

You can separate targets with newlines, spaces, commas or semicolons. Duplicates are removed automatically.

| Input | Meaning |
|---|---|
| `192.168.1.10` | a single host |
| `192.168.1.0/24` | CIDR, without the network and broadcast address |
| `10.0.0.1-50` | last octet 1 through 50 |
| `10.0.0.200-10.0.1.20` | range from one IP to another |
| `10.0.1-3.*` | nmap-style per octet (`*` = 1–254 in the last octet, 0–255 elsewhere) |
| `fs01.corp.local` | hostname |

You can add up to 65,536 addresses at a time. Only IPv4 ranges are supported.

## What a scan does

Scans run in the background on the server, so you can close the browser while they run. Each batch of targets goes through two phases:

1. **Port sweep.** A TCP connection to port 445 on every address, 256 at a time, with a 1 s timeout. This is cheap, so even a /16 finishes in a few minutes.
2. **SMB login**, only for hosts where port 445 is open, with the number of threads you choose (default 32, maximum 256):
   - log in with the chosen credential; on failure the host gets *Login mislukt* (login failed) and the NT status code;
   - store the server name, domain, OS, SMB dialect, signing requirement and whether it's a guest session;
   - fetch the shares with `NetShareEnum` and try a directory listing on each disk share. If that works the access is `READ`, otherwise `NONE`. A successful login shows as *Ingelogd* (logged in).

The scan doesn't test write access, because that would mean creating something on the share. Write access per folder is shown when you browse (see *Access per folder* under Controls).

**Queue.** If you add targets or start a scan while another scan is running, the new batch joins the queue instead of being refused. Large batches are processed in blocks of 1,024 addresses, and small batches (up to 1,024 targets, such as logging in on a few selected hosts or adding a domain name) go first. When several people share one server, a colleague's /16 doesn't hold up your quick check for more than one block. The status bar shows progress for the whole queue; hover over it to see the batches still waiting. *Stop* cancels the running batch and clears the queue.

**Starting clean.** The *Wissen* (clear) button in the toolbar, also under *Bestand*, removes all hosts and scan results for everyone on the server and stops any running scan and the queue. Credentials are kept, and all tabs go back to *Netwerkomgeving*.

**Large ranges.** When you add targets with *Direct scannen* (scan right away), only hosts that respond on port 445 are stored by default, so a /16 with 30 live hosts gives you 30 entries rather than 65,534. Tick *Ook hosts bewaren waarop poort 445 dicht is* (also keep hosts with port 445 closed) if you want every address kept. Targets you add by name (a hostname or the domain name) are always kept and always shown in the tree, even when they don't respond. The reason is shown with them: *Naam niet gevonden (DNS)* (name not found) or the port that couldn't be reached, including the addresses the name resolved to. Rescanning hosts that are already stored marks them *In wachtrij* (queued) but keeps showing their last result until the new one is in.

Results are stored per credential. Rescanning a host as the same credential replaces that credential's result; results for other credentials are kept. Whether port 445 is open, and the host information (name, OS, dialect, signing), apply to all credentials.

## Tabs and credentials

Every tab is a workspace with its own credential and its own location. The tab shows the credential's name, a color swatch and where you are. The same color appears next to *Verbinden als* (connect as), in the status bar and in the credentials list. The window title also shows the credential in brackets.

Within a tab, everything uses that tab's credential: the share list and access you see in the tree, browsing, previews, downloads and *Opnieuw scannen* (rescan). A host that hasn't been scanned with the tab's credential yet shows *Niet gescand met deze credential* (not scanned with this credential), with a button to scan it.

| Action | How |
|---|---|
| New tab | the **+** button after the tabs, or **Bestand > Nieuw tabblad** (file > new tab). It opens the current location as the credential you pick. |
| Open a host, share or folder in a new tab | right-click > *Openen in nieuw tabblad...* (open in new tab) |
| Change a tab's credential | *Verbinden als* in the address bar, or right-click the tab |
| Rename a tab | double-click it, or right-click > *Naam wijzigen...* (rename). Leave the name empty to go back to the credential's name. A renamed tab still shows the credential in brackets. |
| Duplicate or close tabs | right-click the tab, or middle-click to close |

**Logging in on many hosts at once.** After a big scan as one user, the other tabs show those hosts as *Niet gescand met deze credential* (not scanned with this credential). In the host overview a bar above the list says how many there are, with *Allemaal inloggen als ...* (log in to all as ...) to try them all as the tab's credential. To pick hosts yourself:

| Action | How |
|---|---|
| Add or remove a host from the selection | Ctrl+click (Cmd+click on macOS), in the tree or the host list |
| Select a range | Shift+click |
| Select all hosts in the list | Ctrl+A |
| Log in on the selection as the tab's credential | the **Inloggen** (log in) toolbar button, or right-click > *Inloggen als ...* |
| Clear the selection | Esc |

Right-clicking inside a selection also lets you scan the selected hosts as another credential, copy their IP addresses or delete them. These logins go through the same background queue as a normal scan.

Open tabs and their locations are remembered per browser. If a credential is deleted, its tabs switch to the first remaining credential.

## Controls

| Action | How |
|---|---|
| Select | click |
| Open or preview | double-click or Enter |
| Context menu | right-click |
| Go up one level | Backspace |
| Refresh | F5 |
| Move the selection | arrow keys |
| Delete the selected hosts (in the host overview) | Delete |
| Cut / copy / paste a file or folder | Ctrl+X / Ctrl+C / Ctrl+V |
| Delete a file or folder | Delete |
| Rename | F2 |
| New folder | Ctrl+Shift+N |
| Properties | Alt+Enter |
| Upload files | drag them onto the file list |
| Close a window | Esc, Alt+F4, the X, or double-click the icon in its top-left corner |
| Jump to a path | type `\\host\share\folder` in the address bar and press Enter |
| Expand a share or folder in the tree | click the [+] in front of it |
| Open a folder from the tree | click its name |

*Verbinden als* (connect as) in the address bar changes the credential of the current tab. The **Beeld** (view) menu toggles hidden files, unreachable hosts and "only hosts with readable shares". These choices are remembered per browser.

The tree on the left works like Explorer or regedit: shares and folders can be expanded with [+], and subfolders are loaded the first time you open them. The tree follows where you are, so opening a folder (in the list, from the address bar or from the tree) expands the path to it and selects it. Folder listings in the tree are cached per tab, since they depend on the credential; F5 or switching the tab's credential clears that cache.

**Access per folder.** As soon as a folder is opened, SMB95 checks every subfolder for the tab's credential and shows the result in the *Toegang* (access) column: *Lezen en schrijven* (read and write), *Alleen lezen* (read only) or *Geen toegang* (no access). Folders you can't open get a folder icon with a red no-entry sign, in the list and in the tree. The check only opens a handle with list or create rights and closes it again, so nothing is created or changed. The status bar shows the access for the current folder.

**Working with files.** Right-click a file or folder for *Knippen* (cut), *Kopiëren* (copy), *Plakken* (paste), *Verwijderen* (delete), *Naam wijzigen* (rename) and *Eigenschappen* (properties). Right-click an empty spot in a folder for *Nieuwe map* (new folder), *Nieuw tekstdocument* (new text file) and *Bestanden uploaden* (upload files). The same options are under **Bestand** (file). Pasting in the same folder makes a copy named `name - Kopie.ext`, like Explorer. Cutting within one share is a rename. Copying between shares, hosts or credentials runs through the SMB95 server, so you can copy a file from a share that user A can read to a share where user B can write. Deleting a folder deletes everything in it. A network share has no recycle bin, so this can't be undone.

Text previews show the first 512 KB. Binary files show a hex dump of the first 4 KB. Downloads are streamed, so large files are no problem.

## Colors and attributes

The file type is determined by the file name and extension. The first rule that matches decides the color.

| Color | Type | Examples |
|---|---|---|
| black, yellow folder icon | Folder | |
| pink, bold | Sensitive | `*.kdbx`, `unattend.xml`, `web.config`, `id_rsa`, `*.pfx`, `*.ppk`, `*password*`, `groups.xml`, `ntds.dit` |
| red, bold | Executable | `.exe .dll .msi .sys .scr .cpl .jar .hta` |
| orange | Script | `.ps1 .bat .cmd .vbs .js .sh .py .php` |
| blue | Config / code | `.config .ini .xml .json .yml .reg .cs .sql` |
| purple | Database / backup | `.mdb .sqlite .bak .old .pst .dmp` |
| teal | Archive / disk image | `.zip .7z .iso .vhdx .vmdk .wim` |
| green | Document | `.txt .log .docx .xlsx .pdf .msg` |
| olive | Media | `.png .jpg .mp4` |
| blue, italic | Shortcut / symlink | `.lnk .url`, reparse points |

SMB doesn't pass on Unix execute permissions, so "executable" is based on the extension alone.

The *Attributen* (attributes) column shows the Windows file attributes:

| Letter | Meaning |
|---|---|
| R | read-only |
| H | hidden (dotfiles too; shown dimmed and in italics) |
| S | system |
| L | symlink or junction (reparse point) |
| C | compressed |
| E | encrypted (EFS) |
| O | offline |

## Storage

Everything the app keeps is stored in `data/`:

| File | Contents |
|---|---|
| `store.json` | credentials and scan results per credential (chmod 600) |
| `server.log` | server log |
| `run.json` | PID, port and, if set, the password of the running server (chmod 600) |

Passwords and hashes are stored in plain text in `store.json`. Protect the folder the way you would any file containing credentials. `data/` is listed in `.gitignore`.

## Security

- **Network.** By default the web server only listens on `127.0.0.1`. With `--expose`, HTTP basic auth is mandatory. The password is passed to the server process through an environment variable, so it doesn't show up in `ps`.
- **No secrets sent to the browser.** The API never returns passwords or hashes, only whether one is set.
- **XSS.** File names and file contents from remote servers are always inserted into the page as text, never as HTML.
- **Downloads.** Files are served as `attachment` with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`. Only raster images (no SVG) are displayed inline.
- **CSRF.** Requests that change state require the `X-SMBB: 1` header. Another website can't send it without passing a CORS preflight.
- **Writing only on request.** Browsing, previews and downloads open files with `FILE_READ_DATA` only. The access check opens folder handles without creating anything. SMB95 only writes to a share when you choose a write action (new folder or file, upload, rename, paste, delete), and every delete asks for confirmation first.
- **Clipboard.** Browsers only allow the clipboard API over https or on localhost. With `--expose` over plain http, copying falls back to an older method, and if that is blocked too, a window shows the text selected so you can press Ctrl+C.

## Project structure

```
smbbrowser.py      start/stop script (standard library only)
app.py             Flask app and API
smb.py             SMB layer on impacket: login, shares, listings, file reads
targets.py         parser for IPs, CIDR and ranges
store.py           JSON storage for credentials and hosts
static/            frontend (vanilla JS, no build step)
requirements.txt   flask, impacket
```

Browsing reuses one logged-in session per host and credential, which keeps it fast. Downloads and previews open their own connection, so they don't block browsing.

## API

Every response has the form `{"status": "ok", "data": ...}` or `{"status": "error", "message": ...}`. POST, PUT and DELETE require the `X-SMBB: 1` header.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | credentials (without secrets), hosts and the running scan |
| GET | `/api/hosts[?since=<rev>]` | hosts, with scan results per credential under `results.<cred_id>`. With `since`, only hosts changed after that revision (`full: false`); after deletions the full list is returned (`full: true`). |
| POST | `/api/credentials` | add a credential (`label`, `domain`, `username`, `password`, `nthash`) |
| PUT / DELETE | `/api/credentials/<id>` | update or delete a credential |
| POST | `/api/targets/parse` | check target text (`text`) without saving it |
| POST | `/api/targets` | add targets (`text`, optionally `scan`, `cred_id`, `threads`, `keep_closed`) |
| DELETE | `/api/hosts[?status=closed]` | delete all hosts, or only those with a given status |
| DELETE | `/api/hosts/<ip>` | delete one host |
| POST | `/api/scan` | start a scan, or add it to the queue (`cred_id`, plus `ips` or `scope`: `all`, `pending`, `reachable`, `failed`, `ok`) |
| GET | `/api/jobs/current` | scan progress, including the `queue` of waiting batches |
| POST | `/api/jobs/current/cancel` | stop the scan and clear the queue |
| GET | `/api/ls?host&share&path[&cred]` | directory listing |
| GET | `/api/shares?host[&cred]` | fetch the shares again |
| GET | `/api/preview?host&share&path[&cred]` | text preview or hex dump |
| GET | `/api/download?host&share&path[&cred]` | download a file |
| POST | `/api/probe` | access per folder (`host`, `share`, `path`, `names`, `cred`): `rw`, `r`, `w` or `denied` per name; `""` is the folder itself |
| POST | `/api/fs/mkdir` | new folder (`host`, `share`, `path`, `name`, `cred`) |
| POST | `/api/fs/newfile` | new empty file; fails if the name exists |
| POST | `/api/fs/rename` | rename (`name`, `new`) |
| POST | `/api/fs/delete` | delete a file, or a folder including its contents (`name`, `dir`) |
| POST | `/api/fs/upload?host&share&path&cred[&overwrite=1]` | upload a file (multipart field `file`); returns 409 with `exists: true` if it already exists |
| POST | `/api/fs/paste` | paste (`mode`: `copy` or `cut`, `src` and `dst` each with `host`, `share`, `path`, `name`, `cred`) |

## Troubleshooting

| Problem | Solution |
|---|---|
| "Poort 8445 is al in gebruik" (port already in use) | Start with `--port` and a different port, or stop the old instance with `python3 smbbrowser.py stop`. |
| Startup fails | Check `data/server.log`. |
| Every host shows *Poort 445 dicht* (port 445 closed) | Check that you can reach the network (VPN, firewall). If SMB runs on a different port, use `--smb-port`. |
| *Login mislukt* (login failed) | Check the domain and username. For local accounts, leave the domain empty or enter the computer name. |
| Shares are listed but show *geen toegang* (no access) | The credential can see the share but not read it. Scan the host as another credential via right-click > *Scannen als* (scan as), then open a tab with that credential. |
| *Kopiëren naar het klembord is mislukt* (copy to clipboard failed) | Fixed: over plain http a window now opens with the text selected, so you can press Ctrl+C. |
| A folder shows *Geen toegang* but you expected access | The check uses the credential of the current tab. Switch the tab's credential or open another tab. |
| Reinstall the dependencies | Delete the `.venv/` folder and start again. |
