# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for this project.
Accepted ADRs are **binding** for humans and coding agents alike (see [`AGENTS.md`](../../AGENTS.md)
in the repository root). ADRs derive from the specification in [`docs/specifications.md`](../specifications.md).

## Process

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` (next free number).
2. Fill in context, decision, alternatives, and consequences. Set status `proposed`.
3. A human reviewer accepts or rejects the ADR. **Only humans change the status.**
4. Add the ADR to the index below, with its status shown via the colored bullet from the legend.
5. A decision is changed by a *new* ADR that supersedes the old one — never by editing an
   accepted ADR.
6. **Once this template is in use, ADRs are immutable and their numbers are permanent.** Never
   renumber, delete, or merge ADRs — other ADRs, commits (`Implements ADR-NNNN`), and code may
   reference a number. Superseded ADRs stay as historical record (status `superseded by ADR-NNNN`);
   filter active ones via the Status column. To curb sprawl, supersede — do not consolidate. (The
   template itself may still consolidate its own seed ADRs before any project builds on them, since
   nothing external references those numbers yet.)
7. **Never reference an ADR number that does not exist yet.** Every `ADR-NNNN` reference must point
   to a file that is already present in this directory. Expected follow-up decisions are
   described by a topic (e.g., "a follow-up ADR on session storage") in the Consequences section —
   the concrete number is cited only once that ADR file exists.

## Index

**Status legend:** 🟢 accepted · 🟡 proposed · 🔴 rejected · ⚪ superseded

| ADR | Title | Status |
| --- | --- | -- |
| [ADR-0001](0001-monorepo-layout.md) | Monorepo layout with npm workspaces | 🟢 accepted |
| [ADR-0002](0002-frontend-stack.md) | Frontend stack — Vue 3, TypeScript, Vite, Pinia, Tailwind, PWA | 🟢 accepted |
| [ADR-0003](0003-backend-stack.md) | Backend stack — Node, TypeScript, Express 5, TypeORM, REST API | 🟢 accepted |
| [ADR-0004](0004-postgresql-and-schema-management.md) | PostgreSQL with TypeORM synchronize (no migrations) | 🟢 accepted |
| [ADR-0005](0005-authentication-and-identity.md) | Authentication & identity — JWT local auth + OIDC PKCE provider registry | 🟢 accepted |
| [ADR-0006](0006-money-ledger-and-balance-math.md) | Money, ledger, and balance math — integer-cent pure functions | 🟢 accepted |
| [ADR-0007](0007-kubernetes-helm-deployment.md) | Kubernetes + Helm deployment with toggleable dev services | 🟢 accepted |
| [ADR-0008](0008-dev-workflow-minikube-telepresence.md) | Single supported dev workflow — Minikube + Telepresence | 🟢 accepted |
| [ADR-0009](0009-testing-strategy.md) | Testing strategy — Vitest, Supertest, Playwright against deployed apps | 🟢 accepted |
| [ADR-0010](0010-ci-and-release-automation.md) | CI & release automation — GitHub Actions, release-please single version | 🟢 accepted |
| [ADR-0011](0011-group-expenses-csv-export.md) | Group expenses CSV export — streaming, per-expense net, single-month | 🟢 accepted |
| [ADR-0012](0012-routed-pages-for-expense-settleup-forms.md) | Routed pages for expense and settle‑up forms instead of modals | 🟢 accepted |
| [ADR-0013](0013-account-name-update-endpoint.md) | Account name update endpoint — PATCH /api/auth/me | 🟢 accepted |
| [ADR-0014](0014-group-invitation-system.md) | Group invitation system — email-keyed pending invitation with accept/decline lifecycle | 🟢 accepted |
| [ADR-0015](0015-typescript-7-side-by-side-with-typescript-6.md) | TypeScript 7 side-by-side with TypeScript 6 via npm aliases | 🟢 accepted |
| [ADR-0016](0016-api-rate-limiting.md) | Global API rate limiting with express-rate-limit | 🟢 accepted |
| [ADR-0017](0017-category-suggestions-client-side-learning.md) | Category suggestions — client-side, group-scoped learning; no server suggestion role | 🟢 accepted |
| [ADR-0018](0018-internationalization-en-it.md) | Internationalization — vue-i18n, EN/IT, per-user language | 🟢 accepted |
| [ADR-0019](0019-image-upload-architecture.md) | Image upload architecture — DB-resident data URLs, multer+sharp, replace-only | 🟢 accepted |
| [ADR-0020](0020-client-cache-lifecycle-on-deploy.md) | Client cache lifecycle on deploy — build-stamped probe, silent purge-and-reload | 🟢 accepted |
| [ADR-0021](0021-module-size-ceiling-and-split-convention.md) | Module size ceiling of 250 pure LOC and the responsibility-split convention | 🟡 proposed |
