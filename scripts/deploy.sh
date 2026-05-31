#!/usr/bin/env bash
set -euo pipefail

DEV_HOST="${DOSCHEI_DEV_HOST:-doschei.$(minikube ip).nip.io}"

helm upgrade --install doschei ./helm/doschei \
  --namespace doschei \
  --create-namespace \
  --wait \
  --set ingress.host="$DEV_HOST" \
  --set backend.env.CORS_ORIGIN="http://$DEV_HOST"
