#!/usr/bin/env bash
# Sauvegarde Vinylarium : dump PostgreSQL + archive du volume de stockage.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a

TS="$(date +%Y%m%d-%H%M%S)"
OUT="backups"
mkdir -p "$OUT"

PROJECT="${COMPOSE_PROJECT_NAME:-vinylarium}"

echo "→ Dump PostgreSQL…"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-vinylarium}" "${POSTGRES_DB:-vinylarium}" \
  | gzip > "$OUT/db-$TS.sql.gz"

echo "→ Archive du stockage (pochettes, avatars, imports)…"
docker run --rm \
  -v "${PROJECT}_storage:/data:ro" \
  -v "$PWD/$OUT:/backup" \
  alpine tar czf "/backup/storage-$TS.tar.gz" -C /data .

echo "✓ Sauvegarde terminée :"
echo "    $OUT/db-$TS.sql.gz"
echo "    $OUT/storage-$TS.tar.gz"
