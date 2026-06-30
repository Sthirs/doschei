#!/usr/bin/env bash
set -euo pipefail

PLAYWRIGHT_BASE_URL_VALUE="${1:-${PLAYWRIGHT_BASE_URL:-}}"

if [ -z "$PLAYWRIGHT_BASE_URL_VALUE" ]; then
  printf 'PLAYWRIGHT_BASE_URL is required. Example:\n' >&2
  printf '  npm run test:playwright -- http://doschei.127.0.0.1.nip.io\n' >&2
  exit 1
fi

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL_VALUE%/}"

shift
npx playwright test --reporter=list "$@"
