#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -r deploy/.env.production ] || { echo 'Create private deploy/.env.production first.'; exit 1; }
[ "$(docker info --format '{{.Architecture}}')" = x86_64 ] || [ "$(docker info --format '{{.Architecture}}')" = amd64 ] || { echo 'Expected Linux amd64 Docker engine'; exit 1; }
sh deploy/compose.sh config --quiet
sh deploy/compose.sh up -d --wait --wait-timeout 120 postgres storage
sh deploy/compose.sh --profile setup run --rm initialize
sh deploy/compose.sh up -d --wait --wait-timeout 300 web worker recognition
curl --fail --silent --show-error http://127.0.0.1:13000/api/health >/dev/null
sh deploy/compose.sh ps
echo 'Containers started. Validate the existing host Nginx configuration before routing public traffic.'
