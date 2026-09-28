#!/usr/bin/env bash
# Tier 2 of the verify-changes skill: rebuild, redeploy, restart, then run the
# integration and Playwright suites against the local Minikube deployment,
# the same way the CI `test` job does.
#
# Usage: .claude/skills/verify-changes/scripts/cluster-checks.sh [backend|frontend|both] [-- <playwright args>]
#   Component defaults to both. Everything after `--` goes to Playwright,
#   e.g. `-- tests/e2e/groups` to run one folder.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

COMPONENT="${1:-both}"
[ $# -gt 0 ] && shift
[ "${1:-}" = "--" ] && shift
case "$COMPONENT" in backend|frontend|both) ;; *)
  echo "usage: $0 [backend|frontend|both] [-- <playwright args>]" >&2; exit 2 ;;
esac
COMPONENTS=("$COMPONENT"); [ "$COMPONENT" = both ] && COMPONENTS=(backend frontend)

for tool in minikube kubectl helm; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed: the cluster tier cannot run here." >&2; exit 3; }
done
minikube status >/dev/null 2>&1 || { echo "Minikube is not running: npm run cluster:up" >&2; exit 3; }

HOST="$(./scripts/dev-host.sh)"
URL="http://$HOST"

# A Telepresence intercept would route traffic to a local process instead of
# the image being verified.
if command -v telepresence >/dev/null && telepresence list 2>/dev/null | grep -q 'intercepted'; then
  echo "A Telepresence intercept is active: run 'npm run telepresence:leave' first." >&2
  exit 3
fi

for c in "${COMPONENTS[@]}"; do
  echo "=== build doschei/$c:dev"
  minikube image build -f "apps/$c/Dockerfile" -t "doschei/$c:dev" .
done

echo "=== helm upgrade (devMode)"
./scripts/deploy.sh

# The :dev tag never changes, so helm upgrade alone does not roll the pods.
for c in "${COMPONENTS[@]}"; do
  echo "=== restart doschei-$c"
  kubectl -n doschei rollout restart "deployment/doschei-$c"
  kubectl -n doschei rollout status "deployment/doschei-$c" --timeout=180s
done

echo "=== wait for $URL/api/health"
for i in $(seq 1 30); do
  curl -sf "$URL/api/health" >/dev/null && break
  [ "$i" = 30 ] && { echo "backend never became healthy" >&2; kubectl -n doschei get pods; exit 1; }
  sleep 5
done

echo "=== integration tests"
npm run test:integration -- "$URL"

echo "=== Playwright"
npm run test:playwright -- "$URL" "$@"
