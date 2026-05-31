#!/usr/bin/env bash
set -euo pipefail

DEV_HOST="$("$(dirname "$0")/dev-host.sh")"

DOSCHEI_DEV_HOST="$DEV_HOST" \
FRONTEND_PORT="${FRONTEND_PORT:-5173}" \
VITE_HMR_CLIENT_PORT="${VITE_HMR_CLIENT_PORT:-80}" \
npm run dev --workspace @doschei/frontend -- --host 0.0.0.0 --port "${FRONTEND_PORT:-5173}"
