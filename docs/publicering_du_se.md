# Publicering på www.du.se

## Grundprincip
Publicera projektroten som webbrot. Strukturen är relativ och förväntar sig:
- `index.html` i roten
- mapparna `styles/`, `js/`, `assets/` och `web-data/`

## Steg
1. Kör `./scripts/update.sh`.
2. Kontrollera `index.html` lokalt.
3. Ladda upp projektroten till www.du.se.

## GitHub Pages
- Gå till Settings → Pages → “Deploy from a branch”.
- Välj `/ (root)` som källa och spara.

## Vanliga problem
- Om JSON inte laddas, kontrollera att `web-data/2026/events.json` finns på servern.
- Om sidan inte hittar filer, kontrollera att webbroot pekar på projektroten.
- Om ändringar inte syns, testa hård uppdatering i webbläsaren eller töm cache.
