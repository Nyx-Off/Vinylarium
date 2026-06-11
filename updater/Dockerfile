# Self-update sidecar: docker CLI + compose + git, nothing else.
# The daemon script itself is read from the mounted checkout
# (scripts/updater-daemon.sh) so updating it doesn't require rebuilding
# this image.
FROM docker:27-cli
RUN apk add --no-cache bash git docker-cli-compose
WORKDIR /repo
CMD ["bash", "/repo/scripts/updater-daemon.sh"]
