# ADR-0007: Kubernetes + Helm deployment with toggleable dev services

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Deployment and §Architecture) requires the application to be cloud-native and deployable to a Kubernetes cluster through a Helm chart. The chart deploys the frontend and backend as separate microservices and includes required resources such as ConfigMaps and Secrets for database connectivity. The database is not deployed by the Helm chart in production and must be provisioned separately; the chart assumes the database is already available with connection details provided through `values.yaml`. PR #1 delivered the initial Helm chart; PR #15 (`fix(helm): improve chart to be production ready`) hardened it with proper Secrets handling, helpers, ingress, and environment configuration.

## Decision

We will deploy via a Helm application chart (`helm/doschei/`) that templates the following Kubernetes resources: frontend Deployment + Service (nginx, port 8080), backend Deployment + Service (Node, port 3000), an optional PostgreSQL StatefulSet + Service (toggle `postgres.enabled`, on by default for dev, persistence off by default), an optional Dex Deployment + Service + ConfigMap (toggle `dex.enabled`, off by default, for dev/testing OAuth2), and an nginx Ingress with toggleable TLS. Environment configuration is injected from pre-existing Kubernetes Secrets (referenced by name — the chart does not generate secrets): `doschei-backend-secrets` (JWT), `doschei-backend-database` (DB credentials), `doschei-backend-oauth` (OAuth config + state secret), and `doschei-postgres-auth` (Postgres credentials). A `devMode.enabled` toggle in values shortcuts Minikube deployments. Container images are pinned by digest where possible.

## Alternatives considered

- **Plain Kubernetes manifests (kubectl apply)** — Not chosen: Helm provides templating, release management, and `helm upgrade --install` for idempotent deploys.
- **Kustomize** — Not chosen: Helm is the ecosystem standard for distributable charts and the team's existing tooling.
- **Terraform / Pulumi** — Not chosen: these are infrastructure-as-code tools, not application deployment tools; Helm is the K8s-native choice.
- **Chart-generated Secrets** — Not chosen: secrets must be pre-provisioned by the operator; the chart only references existing Secret names, which is safer and follows GitOps principles.
- **PostgreSQL as a required (non-toggleable) chart resource** — Not chosen: production expects an external managed database; the in-cluster PostgreSQL is a dev convenience only, hence the `enabled` toggle.

## Sources / Prior art

- `docs/specifications.md` §Deployment — Helm chart, separate microservices, ConfigMaps and Secrets for DB connectivity, database provisioned separately.
- PR #1 (`1571040` — `feat: add backend, frontend and helm`) — initial Helm chart with frontend, backend, postgres, ingress templates.
- PR #15 (`9195dea` — `fix(helm): improve chart to be production ready`) — hardened chart with `_helpers.tpl`, proper Secret references, ingress TLS toggle, `devMode` flag, `DB_SYNC: "false"`, `SEED_ON_STARTUP: "false"`.
- `helm/doschei/values.yaml` — `postgres.enabled: true`, `persistence.enabled: false`, `dex.enabled: false`, `devMode.enabled: false`, secret name references.
- `helm/doschei/templates/` — per-service deployment/service/secret templates, ingress, `_helpers.tpl`.
- Helm chart best practices: <https://helm.sh/docs/chart_template_guide/>

## Consequences

- Positive: one `helm upgrade --install` deploys the entire stack; the `devMode` flag and service toggles (`postgres.enabled`, `dex.enabled`) let the same chart serve both Minikube dev and production.
- Positive: secrets-by-reference means no secrets in `values.yaml` or Git — the chart is safe to commit and audit.
- Positive: the CI pipeline (tests.yaml) deploys this exact chart to Minikube to run integration and e2e tests, so the chart is continuously validated.
- Negative / trade-offs: the chart includes a PostgreSQL sub-resource that is enabled by default — operators must explicitly disable it in production (set `postgres.enabled: false`) or they will run an in-cluster database.
- Negative / trade-offs: no TLS auto-provisioning — TLS is toggleable but certificates must be supplied manually.
- Follow-ups: The spec §Deployment says "The database is not deployed by the Helm chart" but the chart ships a toggleable `postgres` sub-resource enabled by default for dev; the spec wording should be reconciled with the toggle semantics.
- Follow-ups: Add cert-manager integration for automatic TLS certificate provisioning.
- Follow-ups: Consider removing the PostgreSQL sub-chart once a stable production database is established (keep it for dev/bootstrap only).
