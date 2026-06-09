#!/usr/bin/env bash
# Génère un fichier .env avec des secrets aléatoires à partir de .env.example.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env existe déjà — aucune modification."
  exit 0
fi

gen() { openssl rand -hex "${1:-16}"; }

JWT="$(gen 32)"
PGPW="$(gen 16)"

sed -e "s|change_me_to_a_long_random_string|$JWT|" \
    -e "s|change_me_please|$PGPW|g" \
    .env.example > .env

echo "✓ .env créé avec un JWT_SECRET et un mot de passe PostgreSQL aléatoires."
echo "  → Ajoutez votre DISCOGS_TOKEN dans .env, puis lancez :"
echo "    docker compose up -d --build"
