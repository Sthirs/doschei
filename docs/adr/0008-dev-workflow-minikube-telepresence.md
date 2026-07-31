# ADR-0008: Single supported dev workflow — Minikube + Telepresence

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Development) describes using Minikube to create a local Kubernetes cluster, the Helm chart to deploy the application, and Telepresence to run the frontend and backend locally while they communicate with other services in the cluster. The README explicitly states: "There is one supported way to develop this project" and "Local Docker PostgreSQL and direct localhost-only development are not part of the supported workflow." PR #1 delivered the initial dev scripts (`dev-backend.sh`, `dev-frontend.sh`, Telepresence intercept scripts, Minikube up/build/deploy scripts).

## Decision

We will support a single development workflow: Minikube runs the baseline Kubernetes cluster, Helm deploys the frontend, backend, and PostgreSQL into that cluster, Telepresence intercepts the frontend and/or backend service so the developer can run `npm run dev:frontend` and/or `npm run dev:backend` locally while the service still communicates with the in-cluster PostgreSQL and other services over the Telepresence network. The frontend local process is reached through the Minikube ingress host (not `localhost:5173`); Vite HMR is configured for the ingress host so the frontend stays behind the Telepresence intercept. The backend local process uses the in-cluster PostgreSQL service over the Telepresence network. Local Docker PostgreSQL and direct localhost-only development are explicitly unsupported.

## Alternatives considered

- **Docker Compose** — Not chosen: does not match the production Kubernetes environment; env-specific bugs would go undetected until deployment.
- **Local PostgreSQL + direct localhost development** — Not chosen: diverges from the production Helm + K8s deployment and introduces environment-specific differences (e.g., ingress, service DNS, secret mounting).
- **Skaffold** — Not chosen: Telepresence was the team's existing tool; Skaffold's rebuild-and-redeploy cycle is slower than Telepresence's live intercept for iterative development.
- **Tilt** — Not chosen: the Telepresence script approach is sufficient for a two-service stack; Tilt's UI and tiltfile add tooling overhead without proportional benefit.

## Sources / Prior art

- `docs/specifications.md` §Development — describes Minikube, Helm, and Telepresence workflow.
- `README.md` — "There is one supported way to develop this project"; documents the full Telepresence workflow and explicitly excludes local Docker PostgreSQL and localhost-only development.
- PR #1 (`1571040`) — delivered `scripts/minikube-up.sh`, `minikube-build.sh`, `deploy.sh`, `dev-backend.sh`, `dev-frontend.sh`, `telepresence-connect.sh`, `telepresence-intercept-frontend.sh`, `telepresence-intercept-backend.sh`, `telepresence-leave.sh`.
- `apps/frontend/vite.config.ts` — HMR configured for the ingress host (not localhost).
- Telepresence documentation: <https://www.telepresence.io/docs>

## Consequences

- Positive: the dev environment matches production (same Helm chart, same Kubernetes, same ingress) — env-specific bugs are caught early.
- Positive: Telepresence intercepts allow running one service locally while the rest stay in-cluster, enabling fast iteration without redeploying the whole stack.
- Positive: the in-cluster PostgreSQL over the Telepresence network means no local database to manage or seed.
- Negative / trade-offs: requires Minikube, Helm, and Telepresence as prerequisites — a heavier setup than `npm install && npm run dev`.
- Negative / trade-offs: the frontend must be accessed via the ingress host, not `localhost:5173` — this can confuse new developers.
- Follow-ups: Document Telepresence license/compatibility constraints (Telepresence 2 is open source but has enterprise features).
- Follow-ups: Consider adding a devcontainer or one-command onboarding script to reduce setup friction.
