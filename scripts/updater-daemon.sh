#!/usr/bin/env bash
# Updater sidecar daemon — runs inside the `updater` container.
#
# The API can't rebuild its own container, so it drops a flag file in the
# shared storage volume (/data/update/request.json) and THIS process — which
# has the host checkout mounted at /repo and the Docker socket — does the
# actual work: git pull, compose build, compose up. Progress goes to
# status.json + update.log, which the API serves back to the Settings page.
#
# Notes:
#  - db/redis are left untouched (their config never changes in an update;
#    Prisma migrations run on backend boot anyway).
#  - The updater never recreates ITSELF: compose would kill this very process
#    mid-update. If updater/ changes, recreate it by hand (or via update.sh).
set -u

REPO_DIR=/repo
FLAG_DIR=/data/update
REQUEST="$FLAG_DIR/request.json"
STATUS="$FLAG_DIR/status.json"
LOG="$FLAG_DIR/update.log"
SERVICES=(backend worker frontend)

mkdir -p "$FLAG_DIR"
cd "$REPO_DIR"
# The checkout belongs to the host user; without this git refuses to touch it.
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

status() {
  printf '{"state":"%s","detail":"%s","at":"%s"}\n' "$1" "$2" "$(date -Iseconds)" > "$STATUS"
}

echo "[updater] prêt — surveillance de $REQUEST"

while true; do
  if [ -f "$REQUEST" ]; then
    rm -f "$REQUEST"
    : > "$LOG"
    echo "[updater] mise à jour demandée"

    status running "Récupération du code (git pull)"
    if ! git pull --ff-only >>"$LOG" 2>&1; then
      status error "git pull a échoué (commits locaux ?) — voir le journal"
      continue
    fi

    status running "Reconstruction des images (docker compose build)"
    if ! docker compose build "${SERVICES[@]}" >>"$LOG" 2>&1; then
      status error "La construction des images a échoué — voir le journal"
      continue
    fi

    status running "Redémarrage des services"
    if ! docker compose up -d "${SERVICES[@]}" >>"$LOG" 2>&1; then
      status error "Le redémarrage a échoué — voir le journal"
      continue
    fi

    status done "Mise à jour terminée ($(git rev-parse --short HEAD 2>/dev/null || echo '?'))"
    echo "[updater] terminé"
  fi
  sleep 5
done
