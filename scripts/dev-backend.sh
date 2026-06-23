#!/usr/bin/env bash
set -euo pipefail

DEV_HOST="$("$(dirname "$0")/dev-host.sh")"

PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-development}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@doschei-postgres.doschei:5432/doschei}"
CORS_ORIGIN="${CORS_ORIGIN:-http://$DEV_HOST}"
DB_SYNC="${DB_SYNC:-true}"
SEED_ON_STARTUP="${SEED_ON_STARTUP:-false}"

PORT="$PORT" \
NODE_ENV="$NODE_ENV" \
DATABASE_URL="$DATABASE_URL" \
CORS_ORIGIN="$CORS_ORIGIN" \
DB_SYNC="$DB_SYNC" \
SEED_ON_STARTUP="$SEED_ON_STARTUP" \
npm run dev --workspace @doschei/backend
