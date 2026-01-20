# Datamodell

## Excel till JSON (flik: Verksamhetscykel)
- `Cykeldatum` -> `date` (format YYYY-MM-DD)
- `Styrningsfas` -> `ring`
- `Relaterad styrningsfas` -> `ring_2`
- `Typ` -> `type`
- `Styrningsunderlag förkortning` -> `label`
- `Styrningsunderlag` -> `description`
- `Ansvarig` -> `responsible`
- `Verksamhet` -> `verksamhet` (Ja/Nej)
- `Ekonomi` -> `ekonomi` (Ja/Nej)
- `Synlig` -> `visible` (Ja/Nej)

## Tillåtna värden (mappas till interna id)
- `Styrningsfas` och `Relaterad styrningsfas`:
  - Planering -> `planering`
  - Uppföljning och analys -> `uppfoljning_och_analys`
  - Långtidsplanering -> `langtidsplanering`
  - Genomförande och uppföljning -> `genomforande_och_uppfoljning`
  - Månad -> `manad`

- `Typ`:
  - Beslut -> `beslut`
  - Inlämning -> `inlamning`
  - Dialog gemensam -> `dialog_gemensam`
  - Dialog enskild -> `dialog_enskild`
  - Omvärldsanalys -> `omvarldsanalys`

Om andra värden används i `Typ` krävs motsvarande stil i `typeStyle`.

## Automatiskt genererade fält
- `placering`: sätts till `linje` om `ring_2` är ifylld, annars `center`.
- `id`: genereras automatiskt (`ev_0`, `ev_1`, ...).
