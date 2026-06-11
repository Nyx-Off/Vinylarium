#!/usr/bin/env bash
# Met à jour Vinylarium : récupère le code, rebuilde l'image et redéploie.
# Les migrations Prisma sont appliquées automatiquement au démarrage du backend.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Pas de .env — lancez d'abord : bash scripts/setup.sh" >&2
  exit 1
fi

echo "→ Sauvegarde rapide de la base avant mise à jour…"
bash scripts/backup.sh

echo "→ Récupération du code…"
git pull --ff-only

echo "→ Rebuild des images…"
docker compose build

echo "→ Redéploiement (les migrations s'appliquent au démarrage du backend)…"
docker compose up -d

echo "→ Nettoyage des anciennes images…"
docker image prune -f >/dev/null

echo "✓ Mise à jour terminée."
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
