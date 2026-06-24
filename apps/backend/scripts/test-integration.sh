#!/usr/bin/env bash
set -euo pipefail

BACKEND_BASE_URL_VALUE="${1:-${BACKEND_BASE_URL:-}}"

if [ -z "$BACKEND_BASE_URL_VALUE" ]; then
  printf 'BACKEND_BASE_URL is required. Example:\n' >&2
  printf '  npm run test:integration -- http://doschei.127.0.0.1.nip.io\n' >&2
  exit 1
fi

export BACKEND_BASE_URL="${BACKEND_BASE_URL_VALUE%/}"

vitest run --config vitest.integration.config.ts
