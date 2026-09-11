# Development

How to get Do Schèi running locally and how to work on it day to day. For what
the product does, see the [README](../README.md); for the canonical product
spec, see [`specifications.md`](specifications.md). Before you open a pull
request, read [`AGENTS.md`](../AGENTS.md) — it defines the contribution
methodology and the ADR rules that changes have to follow.

## Overview

There is exactly one supported way to develop this project:

- Minikube runs the baseline cluster services.
- Helm deploys `frontend`, `backend`, and `postgres`.
- Telepresence intercepts `frontend` and/or `backend`.
- `npm run dev:frontend` and `npm run dev:backend` run the intercepted service
  locally against the rest of the stack in cluster.

Local Docker PostgreSQL and direct localhost-only development are **not** part
of the supported workflow.

## Prerequisites

- `nvm`
- Node.js — the version pinned in [`.nvmrc`](../.nvmrc)
- npm
- Docker
- Minikube
- Helm
- Telepresence

## First-time setup

```bash
nvm install
nvm use
npm ci
npm run cluster:up
npm run cluster:build
npm run cluster:deploy
```

The app is served through the Minikube ingress, which defaults to
`doschei.$(minikube ip).nip.io`. Print the host any time with:

```bash
npm run dev:host
```

Seeded demo credentials:

- email: `demo@doschei.local`
- password: `password123`

## Daily development

Connect Telepresence once per session:

```bash
npm run telepresence:connect
```

Then intercept whichever service you are working on.

### Backend only

```bash
npm run telepresence:backend
npm run dev:backend
```

### Frontend only

```bash
npm run telepresence:frontend
npm run dev:frontend
```

### Both

Use two terminals for the intercepts and one for the app processes:

```bash
npm run telepresence:backend
npm run telepresence:frontend
npm run dev
```

Open the application through the ingress host printed by `npm run dev:host`.
When you are done:

```bash
npm run telepresence:leave
```

### Testing a rebuilt image (no Telepresence)

To verify a change by running it as a deployed pod — e.g. before
`test:integration` or `test:playwright`, which both target an
already-running deployment — rebuild and redeploy instead of using a
Telepresence intercept. Reach the instance at the ingress host printed by
`npm run dev:host`.

Rebuild only the workspace you changed; it's faster than
`npm run cluster:build`, which builds both images:

```bash
minikube image build -f apps/frontend/Dockerfile -t doschei/frontend:dev .
# or: apps/backend/Dockerfile -t doschei/backend:dev
```

`scripts/minikube-build.sh` tags images `doschei/frontend:dev` and
`doschei/backend:dev` — a **fixed tag**. Because the tag never changes,
`npm run cluster:deploy` (`helm upgrade`) does not restart anything on its
own, so a rebuilt image is not picked up. Always follow a rebuild with an
explicit restart:

```bash
kubectl -n doschei rollout restart deployment/doschei-frontend
kubectl -n doschei rollout status deployment/doschei-frontend --timeout=180s
```

(swap `frontend` for `backend` as needed).

### Things to know

- The local backend process talks to the in-cluster PostgreSQL service over the
  Telepresence network.
- Reach the local frontend through the Minikube ingress host, **not** through
  `localhost:5173` directly.
- Vite HMR is configured for the ingress host so the frontend keeps working
  behind a Telepresence intercept.
- TypeORM uses schema synchronization in development (`DB_SYNC=true`); there are
  no migrations.
- Seed data is created by the in-cluster backend startup path.

## Configuration

### Auth toggles

Two environment variables control whether local (password-based) auth is
available. OAuth sign-in is unaffected by these flags.

| Variable                          | Default  | Effect when set to `"false"`                                           |
|-----------------------------------|----------|------------------------------------------------------------------------|
| `AUTH_LOCAL_LOGIN_ENABLED`        | `"true"` | `POST /api/auth/login` returns 403; the login form is hidden in the UI |
| `AUTH_LOCAL_REGISTRATION_ENABLED` | `"true"` | `POST /api/auth/register` returns 403                                  |

### Rate limiting

The API applies a global per-IP rate limiter (express-rate-limit):

- It covers all `/api` routes; `/api/health` is exempt.
- Exceeding the quota returns HTTP 429 with `RateLimit` and `RateLimit-Policy`
  headers (IETF draft-8) plus `Retry-After`.
- Local, Minikube, and CI deployments force a high limit through the chart's
  `devMode` toggle, so automated tests never hit the cap.

| Variable               | Default  | Effect                                            |
|------------------------|----------|---------------------------------------------------|
| `RATE_LIMIT_WINDOW_MS` | `300000` | Length of the per-IP quota window in milliseconds |
| `RATE_LIMIT_LIMIT`     | `500`    | Max requests per IP per window; excess gets 429   |

### Session lifetimes

Sessions are a short-lived access JWT plus a rotating refresh token
([ADR-0023](adr/0023-refresh-token-rotation.md)). The refresh window is
**sliding** — every rotation resets it — so a user who opens the app at least
once per window never has to sign in again.

| Variable                            | Default   | Effect                                                        |
|-------------------------------------|-----------|---------------------------------------------------------------|
| `ACCESS_TOKEN_TTL_SECONDS`          | `3600`    | Lifetime of the `Bearer` access JWT                           |
| `REFRESH_TOKEN_TTL_SECONDS`         | `7776000` | Sliding refresh window (90 days); every rotation extends it   |
| `REFRESH_TOKEN_REUSE_GRACE_SECONDS` | `30`      | Grace window for a replayed just-rotated token (see below)    |

Inside the grace window a replay is treated as a benign multi-tab race — 401,
family kept. Outside it, the replay is treated as theft: 401, and the whole
token family is revoked.

Notes:

- The refresh token is delivered as an httpOnly cookie named
  `doschei.auth.refresh`, scoped to `/api/auth/session` — the mount point of the
  two endpoints that use it, `POST /api/auth/session/refresh` and
  `POST /api/auth/session/logout`. It is never present in a response body.
- The cookie is marked `secure` when `NODE_ENV=production`, so **a production
  deployment requires TLS**. Over plain HTTP the browser silently discards it and
  users are signed out every `ACCESS_TOKEN_TTL_SECONDS`; the backend logs a
  warning at startup when it detects that combination.
- `devMode` forces `REFRESH_TOKEN_REUSE_GRACE_SECONDS=1` so the reuse-detection
  integration tests stay fast. The two TTLs are deliberately **not** overridden,
  so dev and CI exercise the real lifetimes.
- Rotation is single-use: each refresh consumes the presented token and issues a
  successor in the same family. Presenting an already-consumed token outside the
  grace window revokes the whole family, which is how a stolen token gets
  detected. Signing out revokes it too.

## Testing

Every user-facing feature needs at least one Playwright e2e test — see
[`AGENTS.md`](../AGENTS.md) §4.2.

### Unit tests

```bash
npm run test
```

Runs the Vitest suites in both workspaces. No cluster required.

### Backend integration tests

The integration suite targets an already running backend deployment; it does not
start a server process of its own.

```bash
npm run test:integration -- http://doschei.127.0.0.1.nip.io
```

Or via an environment variable:

```bash
BACKEND_BASE_URL=http://doschei.127.0.0.1.nip.io npm run test:integration
```

Notes:

- The endpoint must expose `/api/health` and `/api/*`. The backend exposes
  health only on `/api/health`.
- Tests use unique emails and group names so they can run against the shared
  Minikube database.
- There is one test file per endpoint: `auth/register`, `auth/login`, `auth/me`,
  `auth/me/image`, `auth/session/refresh`, `auth/session/logout`, `groups GET`,
  `groups POST`, `groups/:id/image`, `settlements POST`, `settlements PATCH`,
  `settlements DELETE`.

### End-to-end tests

Playwright also expects the app to already be running — the config has no
`webServer`.

```bash
npm run test:playwright -- http://doschei.127.0.0.1.nip.io
```

## Regenerating the README screenshots

The screenshots in the README are generated, not hand-made:

```bash
npm run screenshots -- http://doschei.127.0.0.1.nip.io
```

This drives a real deployment at iPhone SE resolution (375×667) and rewrites the
four PNGs in `docs/screenshots/`. Things to know:

- It builds its own throwaway dataset over the API rather than using the seeded
  demo user, whose groups list accumulates permanent residue from e2e runs. It
  therefore needs `AUTH_LOCAL_REGISTRATION_ENABLED="true"` on the target
  deployment.
- It lives outside the e2e suite on purpose
  ([`playwright.screenshots.config.ts`](../playwright.screenshots.config.ts)), so
  a flaky capture can never fail CI.
- The visible dates come from the `ANCHOR` constant in
  [`scripts/screenshots/fixtures.ts`](../scripts/screenshots/fixtures.ts). Bump
  it to refresh them.
- The group photos come from `scripts/screenshots/assets/`, committed at 512×512
  — the size the backend keeps after normalizing — so they stay small in git. To
  change one, replace the file and re-run.
- Regeneration is manual and rare. There is no visual-regression baseline, so
  nothing fails when the UI drifts — refresh the shots when a change makes them
  stale.

## Command reference

```bash
npm run cluster:up
npm run cluster:build
npm run cluster:deploy
npm run telepresence:connect
npm run telepresence:frontend
npm run telepresence:backend
npm run telepresence:leave
npm run dev:frontend
npm run dev:backend
npm run dev
npm run dev:host
npm run seed
npm run build
npm run lint
npm run test
npm run test:integration -- http://doschei.127.0.0.1.nip.io
npm run test:playwright -- http://doschei.127.0.0.1.nip.io
npm run screenshots -- http://doschei.127.0.0.1.nip.io
```

## Repository structure

```text
apps/
  backend/            Express + TypeORM API
  frontend/           Vue 3 PWA
docs/
  adr/                architecture decision records
  screenshots/        generated README assets
  specifications.md   canonical product spec
helm/
  doschei/            chart deploying frontend, backend, and postgres
scripts/              cluster, dev, and tooling scripts
tests/
  e2e/                Playwright specs and page objects
```

## Where to go next

- [`AGENTS.md`](../AGENTS.md) — contribution methodology, ADR rules, and the
  checks to run before opening a pull request.
- [`specifications.md`](specifications.md) — the canonical product spec.
- [`adr/README.md`](adr/README.md) — the ADR process and index.
