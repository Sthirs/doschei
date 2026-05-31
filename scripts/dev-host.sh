#!/usr/bin/env bash
set -euo pipefail

if [ -n "${DOSCHEI_DEV_HOST:-}" ]; then
  printf '%s\n' "$DOSCHEI_DEV_HOST"
  exit 0
fi

printf 'doschei.%s.nip.io\n' "$(minikube ip)"
