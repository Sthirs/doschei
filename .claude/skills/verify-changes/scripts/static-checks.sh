#!/usr/bin/env bash
# Tier 1 of the verify-changes skill: every check that needs no cluster.
# Picks what to run from the files changed against the base branch, runs all
# of it even after a failure, and prints a PASS/FAIL/SKIP summary.
#
# Usage: .claude/skills/verify-changes/scripts/static-checks.sh [base-ref]
#   base-ref defaults to origin/main.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

BASE_REF="${1:-origin/main}"
MERGE_BASE="$(git merge-base HEAD "$BASE_REF" 2>/dev/null || true)"
if [ -z "$MERGE_BASE" ]; then
  echo "Cannot find a merge base with $BASE_REF (try: git fetch origin main)." >&2
  exit 2
fi

# Committed, staged, unstaged and untracked changes since the merge base.
CHANGED="$( { git diff --name-only "$MERGE_BASE"; git ls-files --others --exclude-standard; } | sort -u)"
has() { grep -qE "$1" <<<"$CHANGED"; }

declare -a SUMMARY=()
FAILED=0
run() { # run <label> <command...>
  local label="$1"; shift
  echo; echo "=== $label: $*"
  if "$@"; then SUMMARY+=("PASS  $label"); else SUMMARY+=("FAIL  $label"); FAILED=1; fi
}
skip() { SUMMARY+=("SKIP  $1 ($2)"); }

echo "Base: $BASE_REF ($(git rev-parse --short "$MERGE_BASE"))"
echo "Changed files:"; sed 's/^/  /' <<<"${CHANGED:-<none>}"

# Node version: CI uses .nvmrc. Another major can change Intl output and fail
# the frontend number-formatting tests for reasons unrelated to the change.
WANT_NODE="$(cut -d. -f1 < .nvmrc | tr -d 'v')"
HAVE_NODE="$(node -p 'process.versions.node.split(".")[0]')"
NODE_NOTE=""
if [ "$WANT_NODE" != "$HAVE_NODE" ]; then
  NODE_NOTE="Node $HAVE_NODE in use, .nvmrc wants $(cat .nvmrc): run 'nvm use' or check failures against the base branch."
  echo; echo "WARNING: $NODE_NOTE"
fi

[ -d node_modules ] || run "npm ci" npm ci

run "lint" npm run lint

if has '^apps/backend/'; then
  run "backend unit tests" npm run test --workspace @doschei/backend
  run "backend typecheck (build)" npm run build --workspace @doschei/backend
else
  skip "backend unit tests + typecheck" "no apps/backend changes"
fi

if has '^apps/frontend/'; then
  run "frontend unit tests" npm run test --workspace @doschei/frontend
  run "frontend typecheck + build" npm run build --workspace @doschei/frontend
else
  skip "frontend unit tests + typecheck" "no apps/frontend changes"
fi

# ADR-0021: 250 pure LOC per source file; the i18n catalogs are exempt.
SRC_CHANGED="$(grep -E '^apps/(backend|frontend)/src/.*\.(ts|vue)$' <<<"$CHANGED" \
  | grep -vE '^apps/frontend/src/i18n/(en|it)\.ts$' \
  | while read -r f; do [ -f "$f" ] && echo "$f"; done)"
if [ -n "$SRC_CHANGED" ]; then
  echo; echo "=== module size (ADR-0021, 250 pure LOC)"
  # shellcheck disable=SC2086
  OVER="$(node scripts/pure-loc.mjs $SRC_CHANGED --over 250)"
  if [ -z "$OVER" ]; then SUMMARY+=("PASS  module size (ADR-0021)")
  else echo "$OVER"; SUMMARY+=("FAIL  module size (ADR-0021)"); FAILED=1; fi
else
  skip "module size (ADR-0021)" "no changed source files"
fi

if has '^helm/'; then
  if command -v helm >/dev/null; then
    run "helm lint" helm lint helm/doschei
    run "helm lint (devMode)" helm lint helm/doschei --set devMode.enabled=true --set dex.enabled=true
    run "helm template" sh -c 'helm template doschei helm/doschei >/dev/null'
    run "helm template (devMode)" sh -c 'helm template doschei helm/doschei --set devMode.enabled=true --set dex.enabled=true >/dev/null'
  else
    SUMMARY+=("FAIL  helm lint/template (helm not installed, chart unverified)"); FAILED=1
  fi
else
  skip "helm lint/template" "no helm/ changes"
fi

# AGENTS.md §3: accepted ADRs are immutable.
ADR_EDITS="$(git diff --name-only --diff-filter=M "$MERGE_BASE" -- 'docs/adr/[0-9]*.md')"
if [ -n "$ADR_EDITS" ]; then
  BAD=""
  for f in $ADR_EDITS; do
    git show "$MERGE_BASE:$f" | grep -q 'Status:\*\* 🟢 accepted' && BAD="$BAD $f"
  done
  if [ -n "$BAD" ]; then
    echo; echo "=== accepted ADRs edited:$BAD"
    SUMMARY+=("FAIL  accepted ADRs unchanged (edited:$BAD)"); FAILED=1
  else SUMMARY+=("PASS  accepted ADRs unchanged"); fi
else
  SUMMARY+=("PASS  accepted ADRs unchanged")
fi

# Does the change need the cluster tier (integration + Playwright)?
if has '^(apps/|helm/|tests/e2e/|playwright\.config\.ts)'; then
  CLUSTER="needed: the change touches app code, the chart or e2e tests"
else
  CLUSTER="not needed: docs/tooling-only change"
fi

echo; echo "=== Summary"
printf '%s\n' "${SUMMARY[@]}"
[ -n "$NODE_NOTE" ] && echo "NOTE  $NODE_NOTE"
echo "Cluster tier: $CLUSTER"
exit "$FAILED"
