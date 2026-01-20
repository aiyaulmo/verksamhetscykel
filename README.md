# Verksamhetscykel

Interaktivt årshjul som visualiserar en organisations verksamhetscykel med händelser, perioder och planeringshorisonter.

## Funktioner

- **Cirkulär kalender** – 52 veckor arrangerade i ett hjul med månader och perioder
- **Fyra planeringshorisonter** – Långtidsplanering, planering, genomförande och uppföljning
- **Interaktiva händelser** – Hovring och klick visar detaljer, ansvarig och datum
- **Filtrering** – Filtrera på verksamhet, ekonomi eller kvalitet
- **Markering** – Klicka på månader, ringar eller perioder för att markera relaterade händelser
- **Tillgänglighet** – WCAG-anpassat med hög kontrast och skärmläsarstöd
- **Export** – Ladda ner som PNG-bild
- **Utskriftsvänlig** – Optimerad för A3-utskrift

## Kom igång

### Visa lokalt

```bash
cd verksamhetscykel
python3 -m http.server 8000
```

Öppna sedan `http://localhost:8000` i webbläsaren.

### Uppdatera händelser

1. Redigera `data/source/2026/events_master.xlsx`
2. Kör uppdateringsskriptet:
   ```bash
   ./scripts/update.sh
   ```
3. JSON genereras och kopieras till `web-data/`

### Publicera

Publicera projektroten som webbrot (GitHub Pages: “Deploy from a branch” → `/ (root)`). Inga ytterligare beroenden krävs.

## Projektstruktur

```
verksamhetscykel/
├── index.html
├── styles/style.css
├── js/                    # ES6-moduler
│   ├── main.js            # Startfil
│   ├── config.js          # Konfiguration
│   ├── state.js           # Tillståndshantering
│   ├── rings.js           # Ringritning
│   ├── months.js          # Månadsritning
│   ├── events.js          # Händelser och karusell
│   └── utils.js           # Hjälpfunktioner
├── assets/                # Bilder och grafik
├── web-data/2026/         # JSON-data för webb
├── data/
│   ├── source/            # Excel-masterfiler
│   └── generated/         # Genererad JSON
├── scripts/               # Python/skal-skript
├── docs/                  # Dokumentation
└── backups/               # Tidsstämplade ögonblickskopior
```

## Teknisk stack

- **D3.js v7** – SVG-ritning och interaktion
- **ES6-moduler** – Modulär JavaScript utan byggsteg
- **CSS-variabler** – Tematisering via JSON-konfiguration
- **Python + pandas** – Excel till JSON-konvertering

## Konfiguration

All konfiguration sker i `data/generated/2026/events.json`:

- `config` – Layout, färger, dimensioner
- `typeStyle` – Färg och form per händelsetyp
- `config.ui.cssVars` – CSS-variabler för UI-anpassning

Se [docs/teknik.md](docs/teknik.md) för detaljer.

## Dokumentation

- [Tekniköversikt](docs/teknik.md) – Arkitektur och kodstruktur
- [Datamodell](docs/datamodell.md) – JSON-struktur och fält
- [Handbok](docs/handbok.md) – Användarguide
- [Publicering](docs/publicering_du_se.md) – Publiceringsrutiner
- [Backup](docs/backup.md) – Backuprutiner

## Utveckling

### Förutsättningar

- Python 3 med `pandas` och `openpyxl`
- Webbläsare med ES6-modulstöd
- Lokal webbserver (t.ex. `python3 -m http.server`)

### Skapa virtuell miljö

```bash
python3 -m venv venv
source venv/bin/activate
pip install pandas openpyxl
```

### Backup före ändringar

```bash
backup_dir="backups/$(date +%Y-%m-%d_%H%M%S)_beskrivning"
mkdir -p "$backup_dir"
rsync -a --exclude backups ./ "$backup_dir"/
```

Logga i `backups/BACKUP_LOG.md`.

## Licens

Intern användning.
