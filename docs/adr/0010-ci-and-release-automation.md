# ADR-0010: CI & release automation — GitHub Actions, SHA-pinned, release-please single version

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §CI) requires GitHub Actions running on every push to `main` and on every pull request, performing linting, testing, and building. The project also needed a release mechanism that keeps the frontend, backend, Helm chart, and root package all on the same version number. PR #3 (`ci: add test and release workflows`) delivered the initial CI and release workflows; subsequent commits (`f603427`, `acc0250`, `1ac0f4b`) aligned release-please to a single-version release train with one PR per release.

## Decision

We will use GitHub Actions for CI/CD with the following structure:

1. **PR checks**: `.github/workflows/common-pull-request-checks.yaml` reuses the shared `neteye-platform/repo-commons` reusable workflow (pinned by SHA) for common checks (linting, markdown, etc.).

2. **Tests**: `.github/workflows/tests.yaml` runs on push to `main` and on all PR branches. It runs unit tests (`npm run test`), then provisions a full Minikube cluster, deploys the stack via Helm (`devMode.enabled=true`, `dex.enabled=true`), waits for readiness, and runs integration tests (`npm run test:integration`) and Playwright e2e (`npm run test:playwright`) against the ingress host. Playwright reports are uploaded on failure.

3. **Release**: `release-please` manages releases with a single-version release train: one PR per release (`separate-pull-requests: false`), Conventional Commits, `node` release-type. The `extra-files` in `release-please-config.json` sync the version across root `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, and `helm/doschei/Chart.yaml` (both `version` and `appVersion`). A release event triggers `.github/workflows/release.yaml` to build and publish Docker images.

4. **Action pinning**: all third-party GitHub Actions are pinned by commit SHA (not tag) for supply-chain security. Renovate (`renovate.json`) keeps pinned SHAs and dependencies up to date automatically.

## Alternatives considered

- **GitLab CI / CircleCI** — Not chosen: GitHub Actions is the repo's platform (the repo is on GitHub); using a different CI provider would add friction without benefit.
- **semantic-release** — Not chosen: release-please is Google-maintained, integrates natively with GitHub releases and PRs, and supports Conventional Commits out of the box.
- **Multi-version monorepo releases (per-package versioning)** — Not chosen: the frontend, backend, and Helm chart always ship together; a single version across all packages is simpler and avoids version skew. This is why `separate-pull-requests: false` and `extra-files` sync all versions.
- **Unpinned actions (tag references)** — Not chosen: tag references are mutable and a supply-chain risk; SHA-pinning is required for security. Renovate keeps the pinned SHAs fresh.
- **Separate release workflows per package** — Not chosen: a single release-please run bumps all packages in one atomic PR.

## Sources / Prior art

- `docs/specifications.md` §CI — describes GitHub Actions, linting, testing, building.
- PR #3 (`bab44bb` — `ci: add test and release workflows`) — delivered `tests.yaml`, `release.yaml`, `release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`.
- Commits `f603427` (`ci: create one single PR for release please`), `acc0250` (`ci: align versions`), `1ac0f4b` (`ci: release-please single version`) — iterated release-please to the single-version train.
- `release-please-config.json` — `separate-pull-requests: false`, `release-type: node`, `extra-files` syncing `apps/*/package.json` + `Chart.yaml` version + appVersion.
- `.github/workflows/tests.yaml` — Minikube + Helm deploy + integration + Playwright against ingress host.
- `.github/workflows/common-pull-request-checks.yaml` — reuses `neteye-platform/repo-commons` reusable workflow pinned by SHA.
- `renovate.json` — automated dependency and SHA updates.
- release-please: <https://github.com/googleapis/release-please>
- Conventional Commits: <https://www.conventionalcommits.org/>

## Consequences

- Positive: the CI pipeline validates the full deployed stack (Minikube + Helm + integration + e2e) on every PR — deployment-level bugs are caught before merge.
- Positive: release-please with `extra-files` ensures the root, backend, frontend, and Helm chart versions never drift; one PR bumps everything atomically.
- Positive: SHA-pinned actions + Renovate gives supply-chain security without stale pins.
- Negative / trade-offs: the CI pipeline is slow — it provisions a full Minikube cluster on every PR, which takes minutes; there is no fast-path for docs-only changes.
- Negative / trade-offs: the single-version train means a frontend-only fix still bumps the backend and Helm chart version — no independent releases.
- Follow-ups: Add a path-filtered fast-path to CI so docs-only or scripts-only changes skip the Minikube cluster provisioning.
- Follow-ups: Add Helm chart testing (`helm lint`, `helm unittest`) to the CI pipeline.
- Follow-ups: Add container image vulnerability scanning (e.g., Trivy) to the release pipeline.
