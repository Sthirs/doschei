# ADR-0003: Backend stack — Node, TypeScript, Express 5, TypeORM, REST API

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Backend) requires a Node.js + TypeScript backend exposing a REST API, handling authentication and authorization, using Express.js as the web framework and TypeORM as the ORM. The backend must follow clean architecture principles, separating business logic from API routes and database access, and have a dedicated Dockerfile for Kubernetes deployment. This was established in PR #1 (`feat: add backend, frontend and helm`).

## Decision

We will build the backend with Node.js + TypeScript, Express 5.2 as the web framework, and TypeORM 1.0 as the ORM. The codebase follows a layered architecture: `routes/` define HTTP endpoints, `controllers/` handle request/response shaping, `services/` contain business logic, and `entities/` define TypeORM models. The frontend communicates with the backend through a JSON REST API under `/api/`. Validation uses Zod. Password hashing uses bcryptjs. Unit tests use Vitest; integration tests use Supertest against a running deployment.

## Alternatives considered

- **Fastify** — higher-performance Node web framework. Not chosen: Express's ecosystem maturity and team familiarity outweighed Fastify's throughput for this scope.
- **NestJS** — opinionated framework with dependency injection and modules. Not chosen: overkill for the current scope; the layered-architecture convention is sufficient without a full DI container.
- **Prisma** — modern TypeScript-first ORM. Not chosen: TypeORM was the team's preference and integrates well with the existing entity/repository pattern.
- **raw `pg` driver without an ORM** — Not chosen: an ORM provides entity definitions, migrations tooling, and repository abstractions that reduce boilerplate.

## Sources / Prior art

- `docs/specifications.md` §Backend — specifies Node.js, TypeScript, Express.js, TypeORM, REST API, clean architecture, dedicated Dockerfile.
- PR #1 (`1571040` — `feat: add backend, frontend and helm`) — delivered the backend stack, layered structure, and Dockerfile.
- `apps/backend/package.json` — Express 5.2.1, TypeORM 1.0.0, pg 8.22.0, Zod 4.4.3, bcryptjs 3.0.3, jsonwebtoken 9.0.3.
- `apps/backend/src/` directory layout — `routes/`, `controllers/`, `services/`, `entities/`, `middleware/`, `utils/`.

## Consequences

- Positive: the layered architecture keeps business logic testable in isolation (`services/expenseSplitMath.ts` is pure functions with full unit test coverage).
- Positive: TypeORM entities with eager-loaded relations simplify group/expense queries; the `synchronize` flag avoids migration overhead in development.
- Negative / trade-offs: Express 5 is still relatively new; some ecosystem middleware may lag in compatibility.
- Negative / trade-offs: the backend `package.json` carries a `cypress` dependency that is not used by the backend — likely a copy-paste artifact from the frontend.
- Follow-ups: Remove the `cypress` dependency from `apps/backend/package.json` — it is unused in the backend.
- Follow-ups: Evaluate Express 5 ecosystem stability as the project matures; document any middleware compatibility gaps.
