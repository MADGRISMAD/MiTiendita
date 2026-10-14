#!/bin/sh
# Restaura un respaldo hecho con backup-mongo.sh. Por seguridad NO toca la base real:
# restaura en una base de PRUEBA (por omisión «<base>_restore_test») para comprobar que el respaldo sirve.
#
# Uso:   ./deploy/restore-mongo.sh backups/timber_20261014_030000.archive
#        TARGET_DB=timber ./deploy/restore-mongo.sh <archivo>     # restaurar de verdad (borra lo que haya en esa base)
set -e
FILE="$1"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Uso: $0 <archivo.archive>"; exit 1; }

CONTAINER="${MONGO_CONTAINER:-hosstess-mongo-1}"
SOURCE_DB="${DATABASE_NAME:-timber}"
TARGET_DB="${TARGET_DB:-${SOURCE_DB}_restore_test}"

if [ "$TARGET_DB" = "$SOURCE_DB" ]; then
  printf 'Vas a REEMPLAZAR la base real «%s». Escribe SI para continuar: ' "$TARGET_DB"
  read -r answer
  [ "$answer" = "SI" ] || { echo "Cancelado."; exit 1; }
fi

docker exec -i "$CONTAINER" mongorestore --archive --drop \
  --nsFrom="${SOURCE_DB}.*" --nsTo="${TARGET_DB}.*" < "$FILE"

echo "Restaurado en la base «$TARGET_DB». Documentos por colección:"
docker exec "$CONTAINER" mongosh --quiet "$TARGET_DB" --eval \
  'db.getCollectionNames().forEach(c => print(c.padEnd(24), db[c].countDocuments()))'
