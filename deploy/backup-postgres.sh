#!/usr/bin/env bash
# Respaldo diario del esquema de Mi Tiendita (solo sus tablas). Guarda 14 días.
#   bash ~/timberpos/backup-postgres.sh
# Cron (3:15 am):  15 3 * * * bash ~/timberpos/backup-postgres.sh >> ~/backups/timberpos.log 2>&1
# Restaurar:       gunzip -c archivo.sql.gz | docker compose -f ~/micolmena/docker-compose.yml exec -T db psql -U micolmena -d micolmena
set -euo pipefail
MICOLMENA_DIR="${MICOLMENA_DIR:-$HOME/micolmena}"
DEST="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DEST"
file="$DEST/timberpos-$(date +%F-%H%M).sql.gz"
cd "$MICOLMENA_DIR"
docker compose exec -T db pg_dump -U micolmena -d micolmena --schema=timberpos --no-owner | gzip > "$file"
find "$DEST" -name 'timberpos-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) respaldo: $file ($(du -h "$file" | cut -f1))"
