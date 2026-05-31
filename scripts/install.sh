#!/usr/bin/env bash
set -euo pipefail

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
fi

nvm install 26.2.0 >/dev/null
nvm use 26.2.0 >/dev/null
npm ci
