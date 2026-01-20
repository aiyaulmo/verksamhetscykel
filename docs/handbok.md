# Handbok

Detta dokument beskriver hur verksamhetscykeln uppdateras och publiceras.

## Snabbt flöde
1. Öppna Excel-filen `data/source/2026/events_master.xlsx`.
2. Uppdatera fliken `Verksamhetscykel` enligt kolumnerna i `docs/datamodell.md`.
3. Spara och stäng Excel.
4. Kör `./scripts/update.sh`.
5. Kontrollera resultatet genom att öppna `index.html` i webbläsaren.
6. Publicera projektroten enligt `docs/publicering_du_se.md`.

## Vanliga problem
- Om scriptet misslyckas, stäng Excel (filen kan vara låst) och kör igen.
- Om inga ändringar syns, kontrollera att `web-data/2026/events.json` är uppdaterad.

## Arkiv
- Äldre eller ersatta Excel-filer ligger i `data/archive/2025/`.
