#!/usr/bin/env bash
#
# Regenerates the README screenshots (docs/screenshots/) against a running
# deployment. Mirrors scripts/test-playwright.sh, but points Playwright at
# playwright.screenshots.config.ts so these captures stay out of the e2e suite.
set -euo pipefail

PLAYWRIGHT_BASE_URL_VALUE="${1:-${PLAYWRIGHT_BASE_URL:-}}"

if [ -z "$PLAYWRIGHT_BASE_URL_VALUE" ]; then
  printf 'PLAYWRIGHT_BASE_URL is required. Example:\n' >&2
  printf '  npm run screenshots -- http://doschei.127.0.0.1.nip.io\n' >&2
  exit 1
fi

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL_VALUE%/}"

shift
npx playwright test --config=playwright.screenshots.config.ts --reporter=list "$@"
