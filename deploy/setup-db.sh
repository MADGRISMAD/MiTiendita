#!/usr/bin/env bash
# Una sola vez, en el VPS: crea el usuario y el esquema de Mi Tiendita dentro de la base de MiColmena.
#   TIMBERPOS_DB_PASSWORD='una-contraseña-larga' bash ~/timberpos/setup-db.sh
# El usuario `timberpos` solo puede usar su esquema: no ve ni toca las tablas de MiColmena.
set -euo pipefail
: "${TIMBERPOS_DB_PASSWORD:?Define TIMBERPOS_DB_PASSWORD (genera una con: openssl rand -hex 24)}"
MICOLMENA_DIR="${MICOLMENA_DIR:-$HOME/micolmena}"

cd "$MICOLMENA_DIR"
docker compose exec -T db psql -U micolmena -d micolmena -v ON_ERROR_STOP=1 -v pw="$TIMBERPOS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE timberpos LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timberpos') \gexec
ALTER ROLE timberpos PASSWORD :'pw';
CREATE SCHEMA IF NOT EXISTS timberpos AUTHORIZATION timberpos;
REVOKE ALL ON SCHEMA timberpos FROM PUBLIC;
ALTER ROLE timberpos SET search_path = timberpos;
SQL
echo "Listo. En ~/timberpos/.env pon:"
echo "DATABASE_URL=postgres://timberpos:<la contraseña>@db:5432/micolmena"
