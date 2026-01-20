import json
import os
import shutil

import pandas as pd

# Inställningar
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
JSON_FILE = os.path.join(ROOT_DIR, 'data', 'generated', '2026', 'events.json')
WEB_JSON_FILE = os.path.join(ROOT_DIR, 'web-data', '2026', 'events.json')
EXCEL_FILE = os.path.join(ROOT_DIR, 'data', 'source', '2026', 'events_master.xlsx')

def load_json_base():
    """Returnerar JSON-data och källfil (generated eller web) om den finns."""
    for path in [JSON_FILE, WEB_JSON_FILE]:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f), path
    return None, None

# Mappning för ring-värden (Excel -> Interna ID:n)
RING_MAPPING = {
    'Planering': 'planering',
    'Uppföljning och analys': 'uppfoljning_och_analys',
    'Långtidsplanering': 'langtidsplanering',
    'Genomförande och uppföljning': 'genomforande_och_uppfoljning',
    'Månad': 'manad'
}

# Mappning för typ-värden (Excel -> Interna ID:n)
TYPE_MAPPING = {
    'Beslut': 'beslut',
    'Inlämning': 'inlamning',
    'Dialog gemensam': 'dialog_gemensam',
    'Dialog enskild': 'dialog_enskild',
    'Omvärldsanalys': 'omvarldsanalys'
}

# Omvänd mappning (Interna ID:n -> Excel)
RING_MAPPING_REVERSE = {v: k for k, v in RING_MAPPING.items()}
TYPE_MAPPING_REVERSE = {v: k for k, v in TYPE_MAPPING.items()}

def update_json_from_excel():
    """Läser in händelser från Excel och uppdaterar JSON"""
    if not os.path.exists(EXCEL_FILE):
        print(f"Fel: Hittade inte {EXCEL_FILE}")
        return

    # 1. Läs in Excel
    df = pd.read_excel(EXCEL_FILE, sheet_name='Verksamhetscykel')
    
    # Mappa svenska kolumner till interna variabelnamn
    rename_mapping = {
        'Cykeldatum': 'date',
        'Styrningsfas': 'ring',
        'Relaterad styrningsfas': 'ring_2',
        'Typ': 'type',
        'Styrningsunderlag förkortning': 'label',
        'Styrningsunderlag': 'description',
        'Ansvarig': 'responsible',
        'Verksamhet': 'verksamhet',
        'Ekonomi': 'ekonomi',
        'Synlig': 'visible'
    }

    df = df.rename(columns=rename_mapping)
    
    # Mappa om värdena i 'ring', 'ring_2' och 'type' från Svenska till interna ID:n
    df['ring'] = df['ring'].map(lambda x: RING_MAPPING.get(str(x).strip(), x) if pd.notnull(x) else x)
    df['ring_2'] = df['ring_2'].map(lambda x: RING_MAPPING.get(str(x).strip(), x) if pd.notnull(x) else x)
    df['type'] = df['type'].map(lambda x: TYPE_MAPPING.get(str(x).strip(), x) if pd.notnull(x) else x)
    
    # Konvertera 'visible', 'verksamhet', 'ekonomi' från "Ja"/"Nej" till true/false
    for col in ['visible', 'verksamhet', 'ekonomi']:
        if col in df.columns:
            df[col] = df[col].map(lambda x: str(x).strip().lower() == 'ja' if pd.notnull(x) else False)

    # Konvertera datum till strängformat YYYY-MM-DD
    df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
    
    # Logik: Om ring_2 har ett värde (inte NaN eller tom sträng), sätt placering till 'linje'
    # Annars sätt placering till 'center'
    def infer_placement(row):
        r2 = str(row.get('ring_2', '')).strip()
        if r2 and r2.lower() != 'nan' and r2 != 'None' and r2 != '':
            return 'linje'
        return 'center'

    df['placering'] = df.apply(infer_placement, axis=1)
    
    # Se till att inga kritiska fält är null/NaN
    df['label'] = df['label'].fillna('')
    df['description'] = df['description'].fillna('')
    df['responsible'] = df['responsible'].fillna('')
    df['type'] = df['type'].fillna('beslut')
    df['ring'] = df['ring'].fillna('planering')
    
    # Rensa bort alla kvarvarande NaNs (t.ex. i ring_2) för att få snygg JSON
    df = df.where(pd.notnull(df), None)
    
    # Generera automatiska ID:n (t.ex. ev_0, ev_1...)
    df['id'] = [f"ev_{i}" for i in range(len(df))]
    
    # Behåll endast de kolumner vi vill ha i JSON
    output_cols = ['date', 'ring', 'ring_2', 'type', 'label', 'description', 'responsible', 'verksamhet', 'ekonomi', 'placering', 'visible', 'id']
    df = df[[c for c in output_cols if c in df.columns]]
    
    # Konvertera till list of dicts
    new_events = df.to_dict(orient='records')

    # 2. Läs in befintlig JSON (för att behålla config och typeStyle)
    data, _ = load_json_base()
    if data is None:
        print(f"Fel: Hittade inte {JSON_FILE} eller {WEB_JSON_FILE}")
        return

    # 3. Uppdatera endast events
    data['events'] = new_events

    # 4. Spara JSON
    os.makedirs(os.path.dirname(JSON_FILE), exist_ok=True)
    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    os.makedirs(os.path.dirname(WEB_JSON_FILE), exist_ok=True)
    shutil.copy2(JSON_FILE, WEB_JSON_FILE)

    print(
        f"✅ Klart! {len(new_events)} händelser har uppdaterats i {JSON_FILE} "
        f"och kopierats till {WEB_JSON_FILE}"
    )

def init_excel_from_json():
    """Skapar en Excel-fil baserat på nuvarande händelser i JSON"""
    data, _ = load_json_base()
    if data is None:
        print(f"Fel: Hittade inte {JSON_FILE} eller {WEB_JSON_FILE}")
        return
    
    events = data.get('events', [])
    df = pd.DataFrame(events)
    
    # Om placering saknas i JSON (gamla händelser), sätt 'center'
    if 'placering' not in df.columns:
        df['placering'] = 'center'
        df.loc[df['label'].str.contains('Inriktningsverksamhetsplan', na=False), 'placering'] = 'linje'
    
    # Se till att ring_2 finns (för gamla filer)
    if 'ring_2' not in df.columns:
        df['ring_2'] = None
        mask = df['label'].str.contains('Inriktningsverksamhetsplan', na=False)
        df.loc[mask, 'ring'] = 'langtidsplanering'
        df.loc[mask, 'ring_2'] = 'planering'
    
    # Rensa ring_2 där placering är center
    if 'placering' in df.columns:
        df.loc[df['placering'] == 'center', 'ring_2'] = None

    # Mappa interna ID:n tillbaka till Svenska värden
    df['ring'] = df['ring'].map(lambda x: RING_MAPPING_REVERSE.get(x, x))
    df['ring_2'] = df['ring_2'].map(lambda x: RING_MAPPING_REVERSE.get(x, x) if pd.notnull(x) else x)
    df['type'] = df['type'].map(lambda x: TYPE_MAPPING_REVERSE.get(x, x))
    
    # Konvertera booleans till Ja/Nej
    for col in ['visible', 'verksamhet', 'ekonomi']:
        if col in df.columns:
            df[col] = df[col].map(lambda x: 'Ja' if x else 'Nej')

    # Se till att kolumnerna ligger i en snygg ordning och har svenska namn
    export_mapping = {
        'date': 'Cykeldatum',
        'ring': 'Styrningsfas',
        'ring_2': 'Relaterad styrningsfas',
        'type': 'Typ',
        'label': 'Styrningsunderlag förkortning',
        'description': 'Styrningsunderlag',
        'responsible': 'Ansvarig',
        'verksamhet': 'Verksamhet',
        'ekonomi': 'Ekonomi',
        'visible': 'Synlig'
    }
    df = df.rename(columns=export_mapping)
    cols = ['Cykeldatum', 'Styrningsfas', 'Relaterad styrningsfas', 'Typ', 'Styrningsunderlag förkortning', 'Styrningsunderlag', 'Ansvarig', 'Verksamhet', 'Ekonomi', 'Synlig']
    
    existing_cols = [c for c in cols if c in df.columns]
    df = df[existing_cols]

    os.makedirs(os.path.dirname(EXCEL_FILE), exist_ok=True)
    df.to_excel(EXCEL_FILE, index=False, sheet_name='Verksamhetscykel')
    print(f"✅ Excel-fil skapad: {EXCEL_FILE}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--init':
        init_excel_from_json()
    else:
        update_json_from_excel()
