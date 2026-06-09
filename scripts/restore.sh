#!/usr/bin/env bash
# Restauration Vinylarium : restaure un dump SQL et (optionnellement) le stockage.
# Usage : scripts/restore.sh backups/db-XXXX.sql.gz [backups/storage-XXXX.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${1:-}"
STORAGE_FILE="${2:-}"
if [ -z "$DB_FILE" ]; then
  echo "Usage: $0 <db-*.sql.gz> [storage-*.tar.gz]"
  exit 1
fi

# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a
PROJECT="${COMPOSE_PROJECT_NAME:-vinylarium}"
PGUSER="${POSTGRES_USER:-vinylarium}"
PGDB="${POSTGRES_DB:-vinylarium}"

echo "⚠  Cette opération écrase la base et le stockage actuels."
read -r -p "Continuer ? [y/N] " ok
[ "$ok" = "y" ] || { echo "Annulé."; exit 0; }

echo "→ Réinitialisation du schéma…"
docker compose exec -T db psql -U "$PGUSER" -d "$PGDB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "→ Restauration de la base…"
gunzip -c "$DB_FILE" | docker compose exec -T db psql -U "$PGUSER" -d "$PGDB"

if [ -n "$STORAGE_FILE" ]; then
  echo "→ Restauration du stockage…"
  docker run --rm \
    -v "${PROJECT}_storage:/data" \
    -v "$PWD:/backup" \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/$STORAGE_FILE -C /data"
fi

echo "✓ Restauration terminée. Redémarrez les services :"
echo "    docker compose restart backend worker"
