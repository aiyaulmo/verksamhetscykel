# Backup

## Syfte
Backuper används för att inget ska gå förlorat när vi flyttar eller döper om filer.

## Var backuperna ligger
- Alla ögonblickskopior finns i `backups/`.
- Logg förs i `backups/BACKUP_LOG.md`.

## Skapa backup (innan större ändringar)
1. Skapa en ny mapp med datum och tid.
2. Kopiera hela projektet till den mappen.
3. Lägg till en rad i `backups/BACKUP_LOG.md` med datum, orsak och sökväg.

Exempelkommando:
```sh
backup_dir="backups/$(date +%Y-%m-%d_%H%M%S)_ogonblickskopia"
mkdir -p "$backup_dir"
rsync -a --exclude backups ./ "$backup_dir"/
```

## Återställning
- Kopiera önskade filer från en ögonblickskopia tillbaka till projektroten.
- Logga återställningen i `backups/BACKUP_LOG.md`.
