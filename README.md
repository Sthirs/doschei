# Do Schèi

> A web app to track shared expenses and split them with friends.

Do Schèi is a web application for tracking shared expenses and splitting them with friends. The frontend is a Vue 3 + TypeScript PWA, the backend runs on Node.js with Express and PostgreSQL, and the whole stack deploys to a Kubernetes cluster through a cloud-native Helm chart. See [`docs/specs.md`](docs/specs.md) for the full product spec.

## Included

- Vue 3 + TypeScript PWA frontend with login, auth guard, groups screen, Pinia, Vue Router, Axios, Tailwind, ESLint, Prettier, Vitest + Vue Test Utils for unit tests, and Cypress + Playwright for e2e
- Node.js + TypeScript + Express backend with TypeORM, JWT local auth + OAuth2 (Google), seeded demo user, groups and settlements, Vitest + Supertest for tests
- Helm chart that deploys frontend, backend, and PostgreSQL into Minikube
- Telepresence-based development flow to run frontend and/or backend locally while the rest of the stack stays in cluster

## Supported development workflow

There is one supported way to develop this project:

- Minikube runs the baseline cluster services
- Helm deploys `frontend`, `backend`, and `postgres`
- Telepresence intercepts `frontend` and/or `backend`
- `npm run dev:frontend` and `npm run dev:backend` run the intercepted service locally

Local Docker PostgreSQL and direct localhost-only development are not part of the supported workflow.

## Prerequisites

- `nvm`
- Node.js `26.2.0` via `.nvmrc`
- npm
- Docker
- Minikube
- Helm
- Telepresence

## Cluster bootstrap

```bash
nvm install
nvm use
npm ci
npm run cluster:up
npm run cluster:build
npm run cluster:deploy
```

Useful host value:

```bash
npm run dev:host
```

The app ingress host defaults to `doschei.$(minikube ip).nip.io`.

Demo credentials:

- email: `demo@doschei.local`
- password: `password123`

## Daily development with Telepresence

Connect Telepresence:

```bash
npm run telepresence:connect
```

### Run backend locally

```bash
npm run telepresence:backend
npm run dev:backend
```

### Run frontend locally

```bash
npm run telepresence:frontend
npm run dev:frontend
```

### Run both locally

Open two terminals for the intercepts and one for the app processes:

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

## Notes

- The backend local process uses the in-cluster PostgreSQL service over the Telepresence network.
- The frontend local process is expected to be reached through the Minikube ingress host, not directly through `localhost:5173`.
- Vite HMR is configured for the ingress host so the frontend can stay behind a Telepresence intercept.
- TypeORM still uses schema synchronization in development (`DB_SYNC=true`).
- Seed data is created by the in-cluster backend startup path.

## Useful commands

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
npm run build
npm run lint
npm run test
npm run test:integration -- http://doschei.127.0.0.1.nip.io
```

## Auth toggles

Two environment variables control whether local (password-based) auth is available.
OAuth sign-in is unaffected by these flags.

| Variable                           | Default   | Effect when set to `"false"`                                            |
|------------------------------------|-----------|-------------------------------------------------------------------------|
| `AUTH_LOCAL_LOGIN_ENABLED`         | `"true"`  | `POST /api/auth/login` returns 403; the login form is hidden in the UI  |
| `AUTH_LOCAL_REGISTRATION_ENABLED`  | `"true"`  | `POST /api/auth/register` returns 403                                   |

## Backend integration tests

The backend integration suite targets an already running backend deployment. It does not start a local server process.

Run the suite against a specific endpoint:

```bash
npm run test:integration -- http://doschei.127.0.0.1.nip.io
```

Or reuse an environment variable:

```bash
BACKEND_BASE_URL=http://doschei.127.0.0.1.nip.io npm run test:integration
```

Notes:

- The endpoint must expose `/api/health` and `/api/*`.
- Tests use unique emails and group names so they can run against the shared Minikube database.
- There is one test file per endpoint: `auth/register`, `auth/login`, `auth/me`, `groups GET`, `groups POST`, `settlements POST`, `settlements PATCH`, `settlements DELETE`.
- The backend itself exposes health only on `/api/health`.

## Structure

```text
apps/
  backend/
  frontend/
helm/
  doschei/
scripts/
```
