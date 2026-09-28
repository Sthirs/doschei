# Deployment

How to install Do Schèi on a Kubernetes cluster with the Helm chart in
[`helm/doschei/`](../helm/doschei/). For the local Minikube + Telepresence
workflow, see the [development guide](development.md). That workflow uses the
same chart with `devMode.enabled=true`.

- [Defaults at a glance](#defaults-at-a-glance)
- [Prerequisites](#prerequisites)
- [Values reference](#values-reference)
- [Example: production install](#example-production-install)
- [Upgrading](#upgrading)

## Defaults at a glance

- **`NODE_ENV` is `production`** unless you override it. Only devMode switches
  it to `development`. Set it explicitly for any other non-production install.
- **`DB_SYNC` is `"true"` in every environment**, production included. There
  are no migrations: TypeORM creates the schema and keeps it in step with the
  entities on every backend start. See
  [ADR-0029](adr/0029-db-sync-enabled-in-every-environment.md) for the
  trade-offs.
- **The chart never creates production secrets.** It references Secrets you
  create beforehand, by name ([ADR-0007](adr/0007-kubernetes-helm-deployment.md)).

## Prerequisites

- A Kubernetes cluster and Helm 3.8+ (for OCI charts).
- An ingress controller. The chart defaults to `ingress-nginx`
  (`ingress.className: nginx`).
- A PostgreSQL database. Use an external one, or the chart's in-cluster
  instance (`postgres.enabled`, see below).
- The target namespace. All resources go into `.Values.namespace` (default
  `doschei`), not the Helm release namespace, so pass the same value to both.

### Secrets

Create these before installing (defaults shown; each name and key can be
changed under `backend.secrets.*` and `postgres.auth.*`):

| Secret (default name) | Keys | Required |
| --- | --- | --- |
| `doschei-backend-secrets` | `JWT_SECRET` | yes |
| `doschei-backend-database` | `DB_HOSTNAME`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE_NAME` | yes |
| `doschei-backend-oauth` | `OAUTH_CONFIG` (JSON), `OAUTH_STATE_SECRET` | no. OAuth sign-in is off without it. |
| `doschei-backend-vapid` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | no. Push notifications are off without it. |
| `doschei-postgres-auth` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | only when `postgres.enabled: true` |

`OAUTH_CONFIG` is a JSON object with `clientId`, `clientSecret`,
`issuerUrl`, and optionally `enabled`, `autoLaunch`, `autoRegister`,
`buttonText` and `scope` (see `apps/backend/src/config/env.ts`). A VAPID
keypair can be generated with `npx web-push generate-vapid-keys`.

With `devMode.enabled: true` none of these are needed. The chart then renders
its own throwaway dev Secrets.

## Values reference

### Global

| Key | Default | Description |
| --- | --- | --- |
| `namespace` | `doschei` | Namespace every resource is rendered into. |
| `fullnameOverride` | `doschei` | Prefix for resource names (`doschei-backend`, `doschei-frontend`, …). |
| `nameOverride` | unset | Chart name override, used only when `fullnameOverride` is empty. |
| `devMode.enabled` | `false` | Minikube/CI mode: local `doschei/*:dev` images, generated dev Secrets, no frontend/backend security contexts, and the dev backend overrides listed [below](#what-devmode-changes). Never enable it in production. |
| `defaultPodOptions` | `{}` | Extra pod-spec fields (e.g. `nodeSelector`, `tolerations`, `affinity`) merged into the frontend, backend, and postgres pods. |
| `imagePullSecrets` | `[]` | Pull secrets for all pods. |

### Frontend

| Key | Default | Description |
| --- | --- | --- |
| `frontend.replicaCount` | `1` | Frontend replicas. |
| `frontend.image.repository` | `ghcr.io/sthirs/doschei/frontend` | Frontend image. |
| `frontend.image.tag` | `""` | Image tag. Empty means the chart's `appVersion`. |
| `frontend.image.pullPolicy` | `IfNotPresent` | Pull policy. |
| `frontend.service.type` | `ClusterIP` | Service type. |
| `frontend.service.port` / `targetPort` | `8080` / `8080` | Service and container port. |

### Backend

| Key | Default | Description |
| --- | --- | --- |
| `backend.replicaCount` | `1` | Backend replicas. Keep `1` for schema-changing upgrades, see [Upgrading](#upgrading). |
| `backend.image.repository` | `ghcr.io/sthirs/doschei/backend` | Backend image. |
| `backend.image.tag` | `""` | Image tag. Empty means the chart's `appVersion`. |
| `backend.image.pullPolicy` | `IfNotPresent` | Pull policy. |
| `backend.service.type` | `ClusterIP` | Service type. |
| `backend.service.port` / `targetPort` | `3000` / `3000` | Service and container port. |

#### `backend.env`

Plain (non-secret) environment variables. All values are strings.

| Key | Default | Description |
| --- | --- | --- |
| `PORT` | `"3000"` | Port the backend listens on. Keep it in sync with `backend.service.targetPort`. |
| `NODE_ENV` | `production` | `production` marks the refresh and OAuth cookies `secure` (HTTPS only). Set `development` only for plain-HTTP, non-production installs. |
| `DB_SYNC` | `"true"` | TypeORM schema synchronization. See [ADR-0029](adr/0029-db-sync-enabled-in-every-environment.md). |
| `SEED_ON_STARTUP` | `"false"` | Seed demo data on startup. |
| `AUTH_LOCAL_LOGIN_ENABLED` | `"true"` | Email/password sign-in. `"false"` leaves OAuth as the only sign-in method. |
| `AUTH_LOCAL_REGISTRATION_ENABLED` | `"true"` | Email/password self-registration. |
| `CORS_ORIGIN` | `https://doschei.example.com` | Allowed CORS origin: the public URL of the app. |
| `FRONTEND_URL` | `""` | Public URL of the app, used for OAuth redirects. **Set it** to the same value as `CORS_ORIGIN`. Left empty, the backend does not fall back to `CORS_ORIGIN`. |
| `RATE_LIMIT_WINDOW_MS` | `"300000"` | Rate-limit window per client IP ([ADR-0016](adr/0016-api-rate-limiting.md)). |
| `RATE_LIMIT_LIMIT` | `"500"` | Requests allowed per window. |
| `ACCESS_TOKEN_TTL_SECONDS` | `"3600"` | Access JWT lifetime ([ADR-0023](adr/0023-refresh-token-rotation.md)). |
| `REFRESH_TOKEN_TTL_SECONDS` | `"7776000"` | Sliding refresh-token lifetime (90 days). |
| `REFRESH_TOKEN_REUSE_GRACE_SECONDS` | `"30"` | Grace window in which reusing a rotated refresh token counts as a multi-tab race, not theft. |
| `VAPID_SUBJECT` | `mailto:noreply@doschei.example.com` | Contact URI sent to push services ([ADR-0025](adr/0025-web-push-notifications.md)). |
| `VAPID_AUTO_GENERATE` | `"false"` | Mint an ephemeral VAPID keypair at boot. Keep `"false"` in production and provide `backend.secrets.vapid`. |
| `PUSH_ENDPOINT_ALLOWLIST` | `""` | Extra comma-separated push-service host suffixes to accept. |

#### `backend.secrets`

References to the Secrets listed under [Secrets](#secrets). Ignored in devMode.

| Key | Default |
| --- | --- |
| `backend.secrets.jwt.secretName` / `key` | `doschei-backend-secrets` / `JWT_SECRET` |
| `backend.secrets.database.secretName` | `doschei-backend-database` |
| `backend.secrets.database.keys.{hostname,port,username,password,databaseName}` | `DB_HOSTNAME`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE_NAME` |
| `backend.secrets.oauth.secretName` | `doschei-backend-oauth` |
| `backend.secrets.oauth.keys.{config,stateSecret}` | `OAUTH_CONFIG`, `OAUTH_STATE_SECRET` |
| `backend.secrets.vapid.secretName` | `doschei-backend-vapid` |
| `backend.secrets.vapid.keys.{publicKey,privateKey}` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

### Ingress

| Key | Default | Description |
| --- | --- | --- |
| `ingress.enabled` | `true` | Render the Ingress (`/api` → backend, `/` → frontend). |
| `ingress.className` | `nginx` | IngressClass. |
| `ingress.host` | `doschei.example.com` | Public hostname. |
| `ingress.annotations` | `nginx.ingress.kubernetes.io/proxy-body-size: "10m"` | Ingress annotations. Keep the body size for image uploads. |
| `ingress.tls.enabled` | `false` | Enable TLS. |
| `ingress.tls.host` | `""` | TLS host. Empty means `ingress.host`. |
| `ingress.tls.secretName` | `""` | Existing TLS Secret (e.g. issued by cert-manager). |

### PostgreSQL (in-cluster)

| Key | Default | Description |
| --- | --- | --- |
| `postgres.enabled` | `true` | Deploy an in-cluster PostgreSQL. Set `false` for an external database. |
| `postgres.image.repository` / `tag` | `postgres` / `18-alpine@sha256:…` | Image, pinned by digest. |
| `postgres.image.pullPolicy` | `IfNotPresent` | Pull policy. |
| `postgres.service.port` | `5432` | Service and container port. |
| `postgres.auth.secretName` | `doschei-postgres-auth` | Secret loaded as the container environment. |
| `postgres.auth.keys.{username,password,database}` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Keys in that Secret. |
| `postgres.persistence.enabled` | `false` | Reserved. No template reads it yet, so the in-cluster database is **always ephemeral**. Its data is lost when the pod restarts. |

Because in-cluster data does not survive a pod restart, production should use
an external database (`postgres.enabled: false`).

### Dex (dev only)

`dex.*` only renders together with `devMode.enabled: true`. It is a local
OAuth provider for development and e2e tests, and has no effect in a
production install. `dex.enabled` (default `false`) turns it on;
`dex.image.*` and `dex.service.*` configure the container and Service.

### What devMode changes

With `devMode.enabled: true`, the backend gets these values in place of
`backend.env` (see `doschei.backendEnvValue` in
[`_helpers.tpl`](../helm/doschei/templates/_helpers.tpl)):

| Variable | devMode value |
| --- | --- |
| `NODE_ENV` | `development` |
| `SEED_ON_STARTUP` | `true` |
| `FRONTEND_URL` | `http://<ingress.host>` |
| `RATE_LIMIT_LIMIT` | `1000000` |
| `VAPID_AUTO_GENERATE` | `true` |
| `REFRESH_TOKEN_REUSE_GRACE_SECONDS` | `1` |

`DB_SYNC` has no devMode override. It comes from `backend.env` in every
mode.

## Example: production install

External PostgreSQL, TLS from an existing certificate Secret, OAuth and push
notifications enabled.

**1. Create the namespace and Secrets**

```bash
kubectl create namespace doschei

kubectl -n doschei create secret generic doschei-backend-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)"

kubectl -n doschei create secret generic doschei-backend-database \
  --from-literal=DB_HOSTNAME=postgres.internal.example.com \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_USERNAME=doschei \
  --from-literal=DB_PASSWORD='<database password>' \
  --from-literal=DB_DATABASE_NAME=doschei

# Optional: OAuth sign-in
kubectl -n doschei create secret generic doschei-backend-oauth \
  --from-literal=OAUTH_CONFIG='{"enabled":true,"clientId":"doschei","clientSecret":"<client secret>","issuerUrl":"https://sso.example.com/realms/main","buttonText":"Sign in with SSO"}' \
  --from-literal=OAUTH_STATE_SECRET="$(openssl rand -hex 32)"

# Optional: push notifications (npx web-push generate-vapid-keys)
kubectl -n doschei create secret generic doschei-backend-vapid \
  --from-literal=VAPID_PUBLIC_KEY='<public key>' \
  --from-literal=VAPID_PRIVATE_KEY='<private key>'
```

**2. Write a values file** (`values.prod.yaml`)

```yaml
namespace: doschei

backend:
  env:
    # NODE_ENV (production) and DB_SYNC ("true") are already the defaults.
    CORS_ORIGIN: https://doschei.example.com
    FRONTEND_URL: https://doschei.example.com
    VAPID_SUBJECT: mailto:admin@example.com
    AUTH_LOCAL_REGISTRATION_ENABLED: "false"

ingress:
  host: doschei.example.com
  tls:
    enabled: true
    secretName: doschei-example-com-tls

postgres:
  enabled: false
```

**3. Install from the OCI registry** (charts are published by the release
workflow; pick a released version)

```bash
helm upgrade --install doschei oci://ghcr.io/sthirs/doschei/charts/doschei \
  --version 1.9.1 \
  --namespace doschei \
  --values values.prod.yaml \
  --wait
```

Or from a checkout of the repository:

```bash
helm upgrade --install doschei ./helm/doschei \
  --namespace doschei \
  --values values.prod.yaml \
  --wait
```

**4. Check it**

```bash
kubectl -n doschei get pods
curl -fsS https://doschei.example.com/api/health
```

On first start the backend creates the database schema itself, because
`DB_SYNC` is `"true"`.

## Upgrading

```bash
helm upgrade doschei oci://ghcr.io/sthirs/doschei/charts/doschei \
  --version <new version> --namespace doschei --values values.prod.yaml --wait
```

With `DB_SYNC` on, the new backend changes the schema to match its entities
when it starts. Before upgrading:

- **Back up the database.** `synchronize` drops or retypes columns whose
  entity field was removed or changed, and the data in them is lost. Read the
  [changelog](../CHANGELOG.md) for entity changes.
- **Upgrade with one backend replica.** Several replicas starting at once
  would each try to synchronize the schema.
