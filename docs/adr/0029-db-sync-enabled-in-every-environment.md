# ADR-0029: DB_SYNC enabled in every environment; NODE_ENV defaults to production

- **Status:** 🟡 proposed
- **Date:** 2026-09-28
- **Deciders:** Sthirs

## Context

[ADR-0004](0004-postgresql-and-schema-management.md) chose TypeORM `synchronize` with no
migrations, gated by `DB_SYNC`: `true` in development, `false` in production. The Helm chart
used `backend.env.DB_SYNC: "false"` as the production default, and devMode quietly overrode it
to `"true"` in `_helpers.tpl`.

No migrations have been written since then. With `DB_SYNC=false`, nothing creates or updates the
schema, so a fresh production install starts with an empty database. On an existing one, a
release that adds an entity or a column (for example `RefreshToken` in
[ADR-0023](0023-refresh-token-rotation.md), `PushSubscription` in
[ADR-0025](0025-web-push-notifications.md)) fails at runtime until someone changes the schema by
hand. The "safety gate" from ADR-0004 stops every deploy from working without an out-of-band
step. That step is also undocumented.

Separately, `NODE_ENV` defaulted to `development` in `apps/backend/src/config/env.ts`, while the
backend Dockerfile and the Helm values used `production`. The default affects security: under
`production` the refresh and OAuth cookies are marked `secure`
([ADR-0023](0023-refresh-token-rotation.md)). A process that starts without `NODE_ENV` should get
the safe setting, not the relaxed one.

## Decision

We will run TypeORM schema synchronization in every environment. The Helm chart's
`backend.env.DB_SYNC` defaults to `"true"`, and devMode no longer overrides it, so
production and development get the same value from `values.yaml`. This supersedes the
production half of ADR-0004's `DB_SYNC` rule. The rest of ADR-0004 (PostgreSQL, TypeORM, no
migrations) still applies.

We will default `NODE_ENV` to `production` wherever a default exists: in the Helm values, in
the backend Dockerfile, and in the zod schema in `config/env.ts`. Every development entry point
sets `development` explicitly: Helm devMode (`doschei.backendEnvValue`),
`scripts/dev-backend.sh`, and `apps/backend/.env.example`. Tests set `test`.

## Alternatives considered

- **Keep `DB_SYNC=false` in production and document a manual schema step** — Not chosen: nothing
  generates that step, so every schema-changing release would need hand-written DDL. That is
  riskier than `synchronize`, because nobody reviews or tests it.
- **Introduce TypeORM migrations now** — Not chosen for this change. It is the right long-term
  answer (see Follow-ups), but it needs a baseline migration built from the live schema, a
  migration runner in the deploy path, and CI coverage. That is a separate decision.
- **Keep the devMode override and only change the production default** — Not chosen: once both
  values are `"true"` the override does nothing, and it hides where the value comes from.

## Sources / Prior art

- [ADR-0004](0004-postgresql-and-schema-management.md) — the decision this supersedes, in part.
- [ADR-0007](0007-kubernetes-helm-deployment.md) — Helm chart structure and the devMode toggle.
- [ADR-0023](0023-refresh-token-rotation.md) — `secure` cookies keyed on `NODE_ENV=production`.
- `apps/backend/src/db/data-source.ts` — `synchronize: env.DB_SYNC`.
- `apps/backend/src/config/env.ts` — `DB_SYNC` is already `true` unless set to `"false"`.
- TypeORM documentation on `synchronize` and migrations: <https://typeorm.io/>

## Consequences

- Positive: a fresh install creates its schema, and upgrades that add entities or nullable or
  defaulted columns apply themselves, in production as in development.
- Positive: one source of truth for `DB_SYNC` (`values.yaml`) and a secure-by-default `NODE_ENV`.
- Negative / trade-offs: `synchronize` can drop or retype a column when an entity field is
  removed or changed, and the data in it is lost. Entity changes that remove or rename a field
  must be reviewed for data loss before release, and operators should back up the database
  before upgrading.
- Negative / trade-offs: running more than one backend replica means several processes may
  synchronize at the same time on rollout. Keep `backend.replicaCount: 1` for upgrades that
  change the schema.
- Negative / trade-offs: operators who need `DB_SYNC=false` can still set it, but then they own
  every schema change.
- Follow-ups: a follow-up ADR introducing TypeORM migrations (baseline from the current schema,
  run on deploy), after which `DB_SYNC` can default back to `false`.
