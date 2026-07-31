# ADR-0001: Monorepo layout with npm workspaces

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The project needed a single repository structure to host a Vue frontend, a Node/Express backend, a Helm chart for Kubernetes deployment, and end-to-end test specs — all sharing one version and one release train. The specification (`docs/specifications.md` §Architecture) describes a frontend, a backend, and a database as separate deployable components, each with its own Dockerfile, communicating through a REST API. A monorepo keeps the two deployables, the deployment config, and the shared test suite in lockstep: a single release-please run bumps all packages at once (see release-please-config.json `extra-files`).

This was established in the very first feature commit (PR #1 — `feat: add backend, frontend and helm`), which landed the `apps/`, `helm/`, and scripts layout in one go.

## Decision

We will use an npm workspaces monorepo at the repository root with two workspace packages (`apps/frontend`, `apps/backend`), a `helm/doschei/` chart directory, a root `tests/e2e/` Playwright suite, and shared `scripts/` for cluster and Telepresence helpers. The root `package.json` declares `"workspaces": ["apps/frontend", "apps/backend"]` and exposes aggregate scripts (`build`, `lint`, `test`, `dev`) that fan out to the workspace packages.

## Alternatives considered

- **Single-package polyrepo** — separate repos for frontend, backend, and chart. Rejected: version drift is inevitable across three repos and the release-please single-version train (see release-please-config.json) cannot span repos.
- **Nx / Turborepo** — monorepo tools with caching and task graphs. Rejected: overkill for two packages; npm workspaces is built-in and sufficient.
- **pnpm or Yarn workspaces** — alternative workspace managers. Rejected: npm is already in the toolchain (`.nvmrc` + `npm ci`) and the team did not need pnpm's symlink benefits for two packages.

## Sources / Prior art

- `docs/specifications.md` §Architecture — describes frontend, backend, and database as separate deployable components.
- PR #1 (`1571040` — `feat: add backend, frontend and helm`) — landed the `apps/`, `helm/`, and `scripts/` layout.
- `package.json` (root) — `workspaces: ["apps/frontend", "apps/backend"]` and aggregate scripts.
- npm workspaces documentation: <https://docs.npmjs.com/cli/v10/using-npm/workspaces>

## Consequences

- Positive: one command builds, lints, and tests both apps (`npm run build/lint/test`); one release-please run bumps all versions together; shared Playwright suite at the repo root tests the deployed stack end-to-end.
- Positive: the two packages share a single `node_modules` at the root, simplifying dependency management.
- Negative / trade-offs: all packages share one version number — an independent frontend hotfix cannot ship without bumping the backend.
- Negative / trade-offs: no per-package CI caching yet; the CI installs the whole tree.
- Follow-ups: Evaluate per-package CI caching if the monorepo grows beyond two apps.
