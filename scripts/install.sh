#!/usr/bin/env bash
set -euo pipefail

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

# No version argument: nvm reads .nvmrc (kept current by Renovate).
nvm install >/dev/null
nvm use >/dev/null
npm ci
