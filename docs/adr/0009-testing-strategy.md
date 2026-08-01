# ADR-0009: Testing strategy — Vitest, Supertest, Playwright against deployed apps

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §CI) describes a CI pipeline running ESLint, Jest for unit/integration tests, and Cypress for end-to-end tests, plus Docker builds. However, the actual implementation diverged: the project adopted Vitest (Vite-native, faster than Jest) for unit tests, Supertest for backend integration tests against a running deployment, and Playwright for end-to-end tests against the deployed app. PR #24 (`test(playwright): add e2e tests for primary use cases`) introduced Playwright and its integration into CI; commit `436383d` (`docs(readme): clean public README and reconcile test tooling`) reconciled the README with the actual test tooling. `AGENTS.md` §4.2 mandates at least one Playwright e2e test per user-facing feature.

## Decision

We will use three testing layers:

1. **Unit tests (Vitest)**: both `apps/backend` and `apps/frontend` use Vitest. The backend uses Vitest with `vitest.config.ts`; the frontend uses Vitest with `@vue/test-utils` and `happy-dom`. Business logic (e.g., `expenseSplitMath.ts`, `settlementRules.ts`) has comprehensive pure-function unit tests.

2. **Integration tests (Supertest)**: backend integration tests target an already-running backend deployment via `BACKEND_BASE_URL` (or `npm run test:integration -- <url>`). The suite does NOT start a local server — it connects to the deployed backend. Tests use unique emails and group names so they can run against the shared Minikube database. There is one test file per endpoint: `auth/register`, `auth/login`, `auth/me`, `groups GET`, `groups POST`, `settlements POST`, `settlements PATCH`, `settlements DELETE`.

3. **End-to-end tests (Playwright)**: Playwright runs against the deployed app via `PLAYWRIGHT_BASE_URL` (no `webServer` — the app must already be reachable). Config: single worker, chromium only, 120s timeout, retry on first failure locally. Tests live in `tests/e2e/` with page-object helpers (`tests/e2e/pages/`). CI provisions a full Minikube cluster, deploys via Helm, and runs both integration and e2e against the ingress host. AGENTS.md §4.2 requires at least one Playwright e2e test covering the happy path of every user-facing feature.

## Alternatives considered

- **Jest** — Not chosen: Vitest is Vite-native, faster, requires zero config with the existing Vite setup, and was adopted by the team.
- **Cypress** — initially present in the frontend devDependencies (`cypress` 15.18.0, `cypress.config.ts`, `test:e2e` script) but replaced by Playwright in PR #24; the Cypress dependency and config file remain as vestigial artifacts.
- **In-process Supertest (spinning up the Express app in the test process)** — Not chosen: integration tests target the deployed backend to verify the real stack including auth, DB, ingress, and Telepresence network; an in-process test would miss deployment-level issues.
- **Selenium** — Not chosen: Playwright is the modern standard with better API, auto-wait, and cross-browser support.
- **Playwright `webServer` auto-spin-up** — Not chosen: the deployment responsibility is the operator's (Minikube + Helm); the test suite just connects to the running app, mirroring the integration test model.

## Sources / Prior art

- `docs/specifications.md` §CI — describes linting, testing, and building (note: references Jest and Cypress, which diverge from the actual implementation).
- PR #3 (`bab44bb` — `ci: add test and release workflows`) — delivered the initial CI pipeline with unit tests.
- PR #24 (`906168c` — `test(playwright): add e2e tests for primary use cases`) — introduced Playwright, `playwright.config.ts`, `scripts/test-playwright.sh`, `tests/e2e/` directory with page objects, and CI integration.
- Commit `436383d` (`docs(readme): clean public README and reconcile test tooling`) — reconciled README with Vitest + Playwright reality.
- `AGENTS.md` §4.2 — mandates at least one Playwright e2e test per user-facing feature.
- `playwright.config.ts` — `PLAYWRIGHT_BASE_URL`, no `webServer`, `workers: 1`, chromium only.
- `apps/backend/vitest.config.ts`, `apps/backend/vitest.integration.config.ts` — Vitest configuration.
- `apps/backend/scripts/test-integration.sh` — Supertest against `BACKEND_BASE_URL`.
- `.github/workflows/tests.yaml` — CI provisions Minikube, deploys via Helm, runs integration + Playwright against the ingress host.

## Consequences

- Positive: Vitest is Vite-native — zero config, fast, and shares the Vite transform pipeline with the build.
- Positive: integration and e2e tests against the deployed app catch deployment-level bugs (ingress, auth, DB connectivity) that in-process tests would miss.
- Positive: AGENTS.md §4.2 mandates Playwright e2e per feature, ensuring user-facing flows are always covered.
- Negative / trade-offs: the spec §CI still references Jest and Cypress — the actual tooling is Vitest and Playwright; the spec is outdated.
- Negative / trade-offs: Cypress 15.18.0 remains as a vestigial devDependency in `apps/frontend/package.json` with a `test:e2e: cypress run` script and `cypress.config.ts` — it is unused and should be removed.
- Negative / trade-offs: the backend `package.json` also carries a `cypress` dependency that is unused.
- Follow-ups: Update the spec §CI from "Jest and Cypress" to "Vitest and Playwright" to match reality.
- Follow-ups: Remove the vestigial Cypress dependency (`cypress` 15.18.0) and `cypress.config.ts` from `apps/frontend/`; remove the `test:e2e` script from `apps/frontend/package.json`.
- Follow-ups: Remove the unused `cypress` dependency from `apps/backend/package.json`.
- Follow-ups: Evaluate adding visual regression testing and API contract tests (e.g., OpenAPI spec generation).
