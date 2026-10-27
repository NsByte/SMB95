# SMB95

Blader door SMB-shares op je netwerk vanuit de browser, in een interface die eruitziet als Windows 95.

Je slaat een paar credentials op en plakt er een IP-range in. SMB95 zoekt dan uit welke hosts SMB draaien en welke shares je kunt lezen. Daarna klik je erdoorheen zoals in de oude Verkenner. Elk bestandstype heeft een eigen kleur, zodat executables, scripts en bestanden als `unattend.xml` of `.kdbx` direct opvallen.

## Starten

Je hebt Python 3.8 of nieuwer nodig.

```bash
git clone https://github.com/<gebruikersnaam>/SMB95.git
cd SMB95
python3 smbbrowser.py start
```

Open daarna http://127.0.0.1:8445. De eerste keer installeert hij zelf wat hij nodig heeft.

Stoppen doe je met `python3 smbbrowser.py stop`. Wil je er vanaf een andere computer bij, start dan met `--expose`. Je krijgt dan een wachtwoord te zien.

## Gebruik

1. Klik op **Credentials** en sla een gebruiker op. Laat de naam leeg voor een anonieme sessie. Een NT-hash werkt ook.
2. Klik op **Targets** en plak IP-adressen of ranges, zoals `10.0.0.0/24` of `10.0.0.1-50`.
3. Dubbelklik op een host en daarna op een share. Met de rechtermuisknop kun je bestanden downloaden en meer.

Alle opties, sneltoetsen en technische details staan in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Let op

Gebruik SMB95 alleen op netwerken waarvoor je toestemming hebt. Je credentials worden lokaal opgeslagen in de map `data/`. Zet die map nooit in git.
