#!/usr/bin/env bash
set -euo pipefail

if [ -n "${DOSCHEI_CLUSTER_HOST:-}" ]; then
  printf '%s\n' "$DOSCHEI_CLUSTER_HOST"
  exit 0
fi

printf 'doschei.%s.nip.io\n' "$(minikube ip)"
