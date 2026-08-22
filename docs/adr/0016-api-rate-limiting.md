# ADR-0016: Global API rate limiting with express-rate-limit

- **Status:** 🟡 proposed
- **Date:** 2026-08-22
- **Deciders:** Sthirs

## Context

The backend exposes an unauthenticated API surface: `POST /api/auth/register`, `POST /api/auth/login`, and the OAuth endpoints are all reachable without a session. Today none of these routes carry any request-rate cap, so a single client can brute-force credentials, enumerate accounts, or simply flood the service. With a single-replica deployment the counter can live in process memory; there is no multi-pod coordination problem to solve today.

The owner has asked for the limiter to be tunable at runtime through environment variables and Helm values, with defaults of a 5-minute window and 500 requests per IP.

## Decision

We will adopt `express-rate-limit@8.6.2` as a single global limiter applied to every `/api` route except `/api/health`, mounted in `createApp()` so that the health probe stays exempt by virtue of route order.

Configuration is exposed through two environment variables, both blank-tolerant and fail-fast on invalid values:

- `RATE_LIMIT_WINDOW_MS` (default `300000`, i.e. 5 minutes).
- `RATE_LIMIT_LIMIT` (default `500`).

The limiter is created with `standardHeaders: 'draft-8'` and `legacyHeaders: false`, and uses the library's default key generator (client IP, with IPv6 `/56` subnetting) behind the existing `trust proxy` setting.

The Helm chart surfaces both knobs in `backend.env` and forces `RATE_LIMIT_LIMIT=1000000` when `devMode.enabled` is true, so Minikube and CI end-to-end runs never trip the limiter.

## Alternatives considered

- **nginx-ingress-level rate limiting** — not chosen: per-environment ingress config duplication and the policy would live outside application ownership.
- **Redis-backed distributed store** — not chosen: there is no multi-replica need today and it would introduce a new infrastructure dependency.
- **Per-route limiters** — not chosen: the owner requested a single global policy; finer-grained policies are deferred.
- **Envoy / Gateway API throttling** — not chosen: stack mismatch with the current nginx ingress.

## Sources / Prior art

- This owner request (2026-08-22).
- [`docs/specifications.md`](../specifications.md) §Backend.
- [`ADR-0003`](0003-backend-stack.md) — backend stack decision.
- [`ADR-0007`](0007-kubernetes-helm-deployment.md) — Kubernetes + Helm deployment with toggleable dev services.
- express-rate-limit documentation: [configuration](https://express-rate-limit.mintlify.app/reference/configuration), [error codes](https://express-rate-limit.mintlify.app/reference/error-codes), [proxy guide](https://express-rate-limit.mintlify.app/guides/troubleshooting#i-am-behind-a-proxy-and-my-users-are-all-getting-the-same-limit).

## Consequences

- Positive: the brute-force surface on unauthenticated endpoints is bounded by a known, tunable ceiling.
- Positive: operators get runtime knobs (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_LIMIT`) without a redeploy.
- Positive: dev and CI are immune via `devMode.enabled`, so end-to-end suites cannot flake on rate-limit responses.
- Negative / trade-offs: the in-memory store is per-pod, so limits are per-replica and reset on restart. A client that round-robins across replicas gets N times the configured budget.
- Negative / trade-offs: `standardHeaders: 'draft-8'` moves the quota cap out of the `RateLimit` state header and into `RateLimit-Policy`; naive clients that only read `RateLimit` will not see the remaining count in the way older drafts exposed it.
- Accepted operator risk: an impractically small `RATE_LIMIT_WINDOW_MS` (for example `1`) passes validation and effectively neutralizes limiting. No artificial floor is imposed; the contract is that the operator-supplied value is honoured.
- Follow-ups: if `replicaCount` grows beyond 1, a follow-up ADR on a shared or distributed rate-limit store will be needed so the per-IP budget is enforced across the fleet rather than per pod.
