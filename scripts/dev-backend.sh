#!/usr/bin/env bash
set -euo pipefail

DEV_HOST="$("$(dirname "$0")/dev-host.sh")"

PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-development}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@doschei-postgres.doschei:5432/doschei}"
CORS_ORIGIN="${CORS_ORIGIN:-http://$DEV_HOST}"
DB_SYNC="${DB_SYNC:-true}"
SEED_ON_STARTUP="${SEED_ON_STARTUP:-false}"
# Match the in-cluster devMode value (_helpers.tpl) so tokens signed by an
# intercepted local backend and by the pod are interchangeable. Without this the
# local process falls back to the zod default and every intercept toggle
# invalidates the access token you are holding.
JWT_SECRET="${JWT_SECRET:-change-me-dev-secret}"

PORT="$PORT" \
NODE_ENV="$NODE_ENV" \
DATABASE_URL="$DATABASE_URL" \
CORS_ORIGIN="$CORS_ORIGIN" \
DB_SYNC="$DB_SYNC" \
SEED_ON_STARTUP="$SEED_ON_STARTUP" \
JWT_SECRET="$JWT_SECRET" \
npm run dev --workspace @doschei/backend
