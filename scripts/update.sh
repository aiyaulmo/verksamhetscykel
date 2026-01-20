#!/bin/bash
# Detta script uppdaterar verksamhetshjulet med data från Excel-filen

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXCEL_PATH="data/source/2026/events_master.xlsx"

echo "Uppdaterar händelser från ${EXCEL_PATH}..."
"${ROOT_DIR}/venv/bin/python" "${ROOT_DIR}/scripts/update_events.py"

if [ $? -eq 0 ]; then
    echo ""
    echo "Klart! Ladda om webbläsaren för att se ändringarna."
else
    echo ""
    echo "Något gick fel. Kontrollera att ${EXCEL_PATH} inte är öppen i Excel."
fi
