#!/bin/sh
set -eu
# Fixed official Linux x86_64 release; existing Compose is left untouched.
if docker compose version >/dev/null 2>&1; then
  docker compose version
  exit 0
fi
[ "$(uname -m)" = x86_64 ] || { echo 'Expected x86_64'; exit 1; }
[ "$(id -u)" = 0 ] || { echo 'Run: sudo sh deploy/install-compose.sh [offline-binary]'; exit 1; }
version=v5.7.0
checksum=7758048ad38e580f22559603312874fec8bb638d021a9e64182385fc17cc12a2
file=$(mktemp)
trap 'rm -f "$file"' EXIT HUP INT TERM
if [ "$#" -eq 1 ]; then
  cp -- "$1" "$file"
else
  curl --fail --location --retry 2 --connect-timeout 15 --max-time 180 \
    "https://github.com/docker/compose/releases/download/$version/docker-compose-linux-x86_64" -o "$file"
fi
printf '%s  %s\n' "$checksum" "$file" | sha256sum --check --status
install -d -m 755 /usr/local/lib/docker/cli-plugins
[ ! -e /usr/local/lib/docker/cli-plugins/docker-compose ] || { echo 'Existing plugin found; inspect it before replacement.'; exit 1; }
install -m 755 "$file" /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
