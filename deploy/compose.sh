#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec docker compose --project-name formula-ai-prod --env-file deploy/.env.production -f compose.production.yaml "$@"
