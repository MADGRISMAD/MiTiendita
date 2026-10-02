#!/bin/sh
# Backup diario de Mongo (usar en cron del VPS).
# Ejemplo cron: 0 3 * * * /opt/timber/deploy/backup-mongo.sh
set -e
STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR="${BACKUP_DIR:-./backups}"
CONTAINER="${MONGO_CONTAINER:-hosstess-mongo-1}"
DB_NAME="${DATABASE_NAME:-timber}"

mkdir -p "$OUT_DIR"
docker exec "$CONTAINER" mongodump --db "$DB_NAME" --archive > "$OUT_DIR/timber_$STAMP.archive"
# Conservar últimos 14 dumps
ls -1t "$OUT_DIR"/timber_*.archive 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Backup OK: $OUT_DIR/timber_$STAMP.archive"
