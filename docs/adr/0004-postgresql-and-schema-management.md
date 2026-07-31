# ADR-0004: PostgreSQL with TypeORM synchronize (no migrations)

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Database) requires PostgreSQL. In production, the database is provisioned separately and is not part of the application deployment; in development, a PostgreSQL instance runs inside the Minikube cluster. TypeORM is the ORM (see the backend stack decision). The question is how schema changes are applied. PR #1 established the initial schema with TypeORM entity definitions; PR #15 (`fix(helm): improve chart to be production ready`) hardened the Helm values to set `DB_SYNC: "false"` in production.

## Decision

We will use PostgreSQL 16 as the database, managed by TypeORM 1.0. Schema synchronization is controlled by the environment variable `DB_SYNC`: it is `true` in development (the local backend uses `DB_SYNC=true` per `apps/backend/.env.example` and the README) and `false` in production (the Helm chart's `values.yaml` sets `backend.env.DB_SYNC: "false"`). No TypeORM migrations exist or are used. In production, the database is provisioned externally — the Helm chart deploys an optional in-cluster PostgreSQL for development convenience only (toggle `postgres.enabled`), with persistence disabled by default.

## Alternatives considered

- **SQLite** — file-based database. Not chosen: not cloud-native, does not match production, and lacks PostgreSQL's feature set.
- **MySQL** — alternative relational database. Not chosen: PostgreSQL was preferred for its ecosystem and feature set.
- **TypeORM migrations from day one** — explicit up/down migration files. Not chosen: `synchronize: true` in development is faster for iterating on the schema early in the project; migrations were deferred until the schema stabilizes.
- **Prisma Migrate** — Not chosen: the project uses TypeORM, not Prisma.

## Sources / Prior art

- `docs/specifications.md` §Database — specifies PostgreSQL, externally provisioned in production, in-cluster for development.
- `docs/specifications.md` §Deployment — "The database is not deployed by the Helm chart and must be provisioned separately."
- PR #1 (`1571040`) — established the initial TypeORM entity definitions and data source.
- PR #15 (`9195dea` — `fix(helm): improve chart to be production ready`) — hardened Helm values with `DB_SYNC: "false"` and `SEED_ON_STARTUP: "false"` for production.
- `apps/backend/src/db/data-source.ts` — `synchronize: env.DB_SYNC`, entities: `[User, UserIdentity, Group, Expense, ExpenseSplit]`.
- `helm/doschei/values.yaml` — `postgres.enabled: true` (dev), `persistence.enabled: false`, `backend.env.DB_SYNC: "false"`.

## Consequences

- Positive: `DB_SYNC=true` in development means schema changes are applied automatically on backend restart — fast iteration with zero migration overhead.
- Positive: the toggleable in-cluster PostgreSQL (`postgres.enabled` in the Helm chart) gives a one-command dev database without external provisioning.
- Negative / trade-offs: `synchronize: true` must NEVER be enabled in production — it can silently alter or drop columns; the `DB_SYNC: "false"` default in Helm values is the safety gate.
- Negative / trade-offs: no migration history means schema evolution is not tracked; reconstructing the schema requires reading the entities, not a migration log.
- Follow-ups: Implement TypeORM migrations before any production data exists — `DB_SYNC` must be disabled and migrations must own schema changes before real users are onboarded.
- Follow-ups: The spec §Deployment says "The database is not deployed by the Helm chart" but the chart ships a toggleable `postgres` sub-resource enabled by default for dev; the spec wording should be reconciled with the toggle semantics.
