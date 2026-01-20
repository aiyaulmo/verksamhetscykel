# Tekniköversikt

## Arkitektur

Webbplatsen är statisk och byggd enligt principen **ansvarsseparation**:

```
verksamhetscykel/
├── index.html             # HTML-struktur
├── styles/                # CSS
├── js/                    # JavaScript-moduler
├── assets/                # Bilder och grafik
├── web-data/              # JSON-data (kopia för körning)
├── data/                  # Datahantering
│   ├── source/            # Excel-masterfiler (redigeras av användare)
│   └── generated/         # Genererad JSON (mellansteg)
├── scripts/               # Byggskript (Python, skal-skript)
├── docs/                  # Dokumentation
└── backups/               # Tidsstämplade ögonblickskopior
```

### Varför denna struktur?

1. **Projektroten är fristående** – Kan publiceras direkt utan byggsteg. Enkel publicering.

2. **Excel som datakälla** – Användare kan redigera data i Excel utan att röra kod. Lägre tröskel.

3. **Genererad JSON** – Python-skriptet validerar och transformerar data. Fel fångas innan publicering.

4. **Separata mappar för source/generated** – Tydligt vad som är redigerbart och vad som genereras.

## Dataflöde

```
Excel (source/)  →  Python-skript  →  JSON (generated/)  →  Kopieras till web-data/
                                                                     ↓
                                                              JavaScript läser vid sidladdning
```

1. Excel uppdateras av användare.
2. `scripts/update_events.py` körs via `./scripts/update.sh`.
3. JSON genereras i `data/generated/2026/events.json`.
4. JSON kopieras till `web-data/2026/events.json`.
5. `js/main.js` hämtar JSON vid sidladdning.

## Beroenden

- **Python-venv** i `venv/` med `pandas` och Excel-stöd (`openpyxl`).
- **D3.js** och **saveSvgAsPng** laddas via CDN (se `index.html`).

## JavaScript-moduler

Visualiseringen är uppdelad i ES6-moduler för bättre underhållbarhet.

### Varför moduler?

Den ursprungliga koden var en enda funktion på ~1700 rader. Detta gjorde det:
- Svårt att hitta och ändra specifik funktionalitet
- Omöjligt att testa enskilda delar
- Riskfyllt att ändra – sidoeffekter svåra att förutse

Genom att dela upp i moduler får vi:
- **Tydligt ansvar** – Varje fil gör en sak
- **Enklare underhåll** – Ändra ringar utan att röra händelser
- **Återanvändbarhet** – Hjälpfunktioner kan användas på flera ställen
- **Bättre översikt** – Snabbt hitta rätt kod

### Modulöversikt

| Modul | Syfte | Beroenden |
|-------|-------|-----------|
| `main.js` | Startfil, orkestrerar alla moduler | Alla andra |
| `config.js` | Laddar JSON, normaliserar konfiguration, standardvärden | – |
| `state.js` | Central tillståndshantering (val, filter, hovring) | config |
| `svg-setup.js` | Skapar SVG, lager, skalor | config |
| `rings.js` | Ringar, veckor, perioder, filterknappar | config, state, utils |
| `months.js` | Månadsbågar och etiketter | config, state |
| `events.js` | Händelsemarkörer, karusell, interaktion | config, state, utils |
| `utils.js` | Hjälpfunktioner (textbrytning, datum) | – |

### Varför dessa grupperingar?

- **config.js** – All konfiguration på ett ställe. Lätt att ändra standardvärden.
- **state.js** – Centraliserat tillstånd förhindrar osynkade värden. En källa till sanning.
- **svg-setup.js** – D3-initiering separerad från innehåll. Tydlig uppdelning.
- **rings.js + months.js + events.js** – Ritning uppdelad efter visuell komponent.
- **utils.js** – Rena funktioner utan sidoeffekter. Lätta att testa och återanvända.

### Dataflöde i koden

```
main.js
  ├── loadData() från config.js         → Hämtar JSON
  ├── createState() från state.js       → Skapar tillståndsobjekt
  ├── setupSvg() från svg-setup.js      → Skapar SVG och lager
  ├── renderRings() från rings.js       → Ritar ringar
  ├── renderMonths() från months.js     → Ritar månader
  ├── renderEvents() från events.js     → Ritar händelser
  └── refreshHighlights()               → Uppdaterar vid interaktion
```

## CSS-struktur

Stilarna i `styles/style.css` är organiserade i sektioner:

1. **CSS-variabler** – Färger, dimensioner, skuggor (lätta att tematisera)
2. **Grundläggande** – Box-sizing, tillgänglighetshjälpmedel
3. **Layout** – Sidstruktur, header, main, footer
4. **Interaktiva element** – Knappar, filter
5. **Visualisering** – SVG-element, markörer, etiketter
6. **WCAG-läge** – Tillgänglighetsanpassningar
7. **Responsivt** – Mobilanpassning
8. **Utskrift** – Print-optimering

### Varför CSS-variabler?

- Centraliserade färger och dimensioner
- Kan överskridas via `config.ui.cssVars` i JSON
- Enkel tematisering utan att röra CSS

## Konfiguration

All visuell konfiguration styrs via JSON:

- `config` – Layout, färger, dimensioner
- `typeStyle` – Färg och form per händelsetyp
- `events` – Händelsedata (redigera via Excel, inte direkt i JSON)
- `config.ui.cssVars` – CSS-variabler (t.ex. `--page-bg`, `--accent`)

## Viktiga filer

| Fil | Syfte |
|-----|-------|
| `index.html` | Sidans HTML-struktur |
| `styles/style.css` | All styling |
| `js/main.js` | JavaScript-startfil |
| `data/generated/2026/events.json` | Konfiguration + händelser |
| `web-data/2026/events.json` | Körningskopia för webb |
| `data/source/2026/events_master.xlsx` | Excel-källa |
| `scripts/update_events.py` | Excel → JSON |
| `scripts/update.sh` | Startskript för Python-skriptet |

## Backup

Se [backup.md](backup.md) för rutiner. Skapa alltid backup före större ändringar.
