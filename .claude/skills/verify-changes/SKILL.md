---
name: verify-changes
description: Verify a change in the Do Schèi repo before declaring it done, committing, pushing or opening a PR. Runs the checks AGENTS.md requires and CI enforces (lint, unit tests, typecheck, the ADR-0021 module size limit, the Helm chart, the accepted-ADR rules), then the Minikube integration and Playwright tier when the change needs it. Use it after any code, chart or e2e-test change, and whenever the user asks to verify, check or test a change.
---

# Verify changes

AGENTS.md says work is not done until it is verified. This skill turns that
rule into two tiers of commands and a fixed way to report the result. Run
from the repo root.

## Tier 1: static checks (always)

```bash
.claude/skills/verify-changes/scripts/static-checks.sh          # base: origin/main
.claude/skills/verify-changes/scripts/static-checks.sh <ref>    # other base
```

The script reads the files changed since the merge base (committed,
uncommitted and untracked). It runs every applicable check even after a
failure, and prints a summary:

| Check | Runs when | Same as CI |
| --- | --- | --- |
| `npm run lint` | always | AGENTS.md requirement |
| backend unit tests + `tsc` build | `apps/backend/**` changed | `unit (backend)` job, image build |
| frontend unit tests + `vue-tsc` + `vite build` | `apps/frontend/**` changed | `unit (frontend)` job, image build |
| `scripts/pure-loc.mjs --over 250` on changed source files | `apps/*/src/**/*.{ts,vue}` changed | ADR-0021 (i18n catalogs exempt) |
| `helm lint` + `helm template`, with and without devMode | `helm/**` changed | chart deploy in the `test` job |
| accepted ADRs not modified | always | AGENTS.md §3 |

The last line says whether the cluster tier is needed. If `git fetch origin
main` hasn't been run, the merge base may be stale, so fetch first.

**When Tier 1 fails**, decide whether your change caused it before fixing
anything:

```bash
git stash -u && <the failing command>; git stash pop
```

If the failure also happens on the base, it's not caused by the change.
Report it as such, and don't fix it inside this change unless asked. The
known case: under a Node major other than `.nvmrc`, `formatEurAxis` tests in
the frontend fail (`€0.0` vs `€0`) because of different `Intl` output. The
script warns when the Node version differs; run `nvm use` if available.

Do not run `prettier --write` over whole files to "fix" style. Prettier is
not enforced and most files are not formatted, so it would bury the change
in noise. ADR-0021 does ask that pure LOC be measured after formatting: if a
changed file is within ~20 lines of 250, format a temporary copy and measure
that too.

## Tier 2: cluster checks (when needed)

Needed for any change to app code, the Helm chart or `tests/e2e/`, and
always for a user-facing change (AGENTS.md §4.2). Not needed for docs-only
or tooling-only changes.

```bash
.claude/skills/verify-changes/scripts/cluster-checks.sh backend    # or frontend, or both (default)
.claude/skills/verify-changes/scripts/cluster-checks.sh both -- tests/e2e/groups   # extra args go to Playwright
```

This mirrors the CI `test` job. It rebuilds the changed image(s) into
Minikube, runs `helm upgrade` in devMode, **explicitly restarts** the
deployments, waits for `/api/health`, then runs `npm run test:integration`
and `npm run test:playwright` against `http://$(npm run -s dev:host)`.

The restart is the step people forget. The images use the fixed `:dev` tag,
so `npm run cluster:deploy` alone never rolls the pods, and you end up
testing the old code (see `docs/development.md`, "Testing a rebuilt image").
The script also refuses to run while a Telepresence intercept is active,
because traffic would reach your local process instead of the image.

Prerequisites: Minikube running (`npm run cluster:up`), `kubectl`, `helm`,
and Playwright browsers. If they are missing, as in a cloud session without
Minikube, **don't pretend Tier 2 ran**. Say it was skipped and why, and point
out that CI's `test` job will run it on the PR.

When Playwright fails, the HTML report is in `playwright-report/`. The pod
logs are the next place to look:

```bash
kubectl -n doschei logs -l app.kubernetes.io/component=backend --tail=200
kubectl -n doschei get events --sort-by=.lastTimestamp | tail -20
```

## Coverage (AGENTS.md §4.2)

Passing checks don't prove the change is covered. Confirm that:

- New business logic has Vitest unit tests.
- A new or changed backend endpoint has a Supertest integration test in
  `apps/backend/tests/integration/`.
- A new user-facing feature has at least one Playwright happy-path spec in
  `tests/e2e/`.
- A bugfix that changes behaviour has a test that fails without the fix.

## Report

End with a short report the user can trust:

```text
Verification
  PASS  lint
  PASS  backend unit tests (504)
  PASS  module size (ADR-0021)
  SKIP  cluster tier: no Minikube in this environment; CI `test` job covers it
  FAIL  frontend unit tests: 3 formatEurAxis failures, also on base (Node 22 vs .nvmrc 26)
```

Name every skipped tier and every failure that isn't caused by the change,
with how you established that. Never report a change as verified when a
check it needed didn't run.
