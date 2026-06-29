# Self-update sidecar: docker CLI + compose + git, nothing else.
# The daemon script itself is read from the mounted checkout
# (scripts/updater-daemon.sh) so updating it doesn't require rebuilding
# this image.
FROM docker:27-cli
RUN apk add --no-cache bash git docker-cli-compose
# The daemon lives in the mounted checkout at $HOST_DIR (the real host path,
# passed by compose) so it can run `docker compose` from a path that matches the
# host. Falls back to /repo for older compose files that still mount there.
CMD ["bash", "-c", "exec bash \"${HOST_DIR:-/repo}/scripts/updater-daemon.sh\""]
