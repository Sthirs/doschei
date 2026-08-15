# ADR-0013: Account name update endpoint — PATCH /api/auth/me (displayName only)

- **Status:** 🟡 proposed
- **Date:** 2026-08-15
- **Deciders:** Sthirs

## Context

The Figma "Account" mockup (node 15:832) requires the logged-in user to edit their display name on the account screen. This includes users whose name originally came from an OAuth provider at registration time. The user's email must remain immutable.

The specification requires that users can create an account and sign in ([`docs/specifications.md`](../specifications.md) §Features, line 8: "Users can create an account and sign in to the application") and that the architecture supports both local authentication and authentication via OAuth2 ([`docs/specifications.md`](../specifications.md) §Architecture, line 120: "It supports local authentication and authentication via OAuth2"). [`ADR-0005`](0005-authentication-and-identity.md) captures the existing authentication and identity decision (JWT local auth + OIDC PKCE provider registry).

Today no endpoint updates profile fields. The auth router (`apps/backend/src/routes/authRoutes.ts`) exposes only `GET /api/auth/me` for reading the current user, alongside `POST /register`, `POST /login`, and `GET /config`. A new endpoint is needed to let users change their display name.

## Decision

We will add `PATCH /api/auth/me` to the existing auth router, guarded by the existing `requireAuth` middleware, updating ONLY the authenticated user's `displayName`.

The concrete contract:

- The controller whitelists `displayName` by destructuring only that field from the request body. Any `email` or other field in the body is ignored. Email is immutable by construction, not by a runtime check.
- Manual validation follows the existing `updateGroup` pattern (`apps/backend/src/controllers/groupController.ts:363-368`): trim the input, reject empty strings, enforce a maximum length of 100 characters. The repo has no request-body validation library, so `typeof` checks are the established pattern.
- The response shape is `{ user: sanitizeUser(user) }`, identical to `GET /api/auth/me`.
- The JWT is NOT re-issued. The token carries `{ userId, email }` and neither field changes.

OAuth users' names are safe to edit. `oauthService.handleCallback` reads the IdP `name` claim only at first user creation (`apps/backend/src/services/oauthService.ts:217`: `const displayName = info.displayName ?? emailLocalPart(email) ?? 'User'`). On returning logins the existing-identity path (`oauthService.ts:189-195`) preserves the DB `displayName` as-is. The link-by-email path (`oauthService.ts:199-210`) also preserves the existing user's `displayName`. The IdP name is never re-synced on subsequent logins, so a user-edited name will not be overwritten by the next OAuth callback.

## Alternatives considered

- **Alternative A: a new `/api/account` router mounted in `routes/index.ts`** — rejected. Larger diff with no benefit. The existing `/me` resource already has the `requireAuth` guard and the `/me` semantic for "the authenticated user." Extending it keeps the change minimal.
- **Alternative B: `PUT /api/auth/me`** — rejected. PUT implies full-resource replacement including email, which contradicts the immutability requirement. PATCH signals a partial update of only the name.
- **Alternative C: adopt zod or express-validator for request-body schema validation** — rejected. The repo has no request-body validation library and the established pattern is manual `typeof` checks (see `groupController.ts:363-368`). Introducing a validation library for a single field is out of scope.

## Sources / Prior art

- [`docs/specifications.md`](../specifications.md) §Features (line 8) and §Architecture (line 120).
- [`docs/adr/0005-authentication-and-identity.md`](0005-authentication-and-identity.md) — existing authentication and identity decision.
- `apps/backend/src/services/oauthService.ts:189-217` — OAuth name provenance. The IdP `name` claim is read only at first user creation (line 217). Returning users (lines 189-195) and link-by-email users (lines 199-210) preserve the DB `displayName`.
- `apps/backend/src/controllers/groupController.ts:363-368` — the manual validation pattern to follow (`typeof` check, trim, non-empty).
- `apps/backend/src/middleware/auth.ts:14-42` — `requireAuth` guard and `request.auth.userId`.
- `apps/backend/src/routes/authRoutes.ts` — existing auth router where the new route will be added.
- [`AGENTS.md`](../../AGENTS.md) §3 — ADR process rules.

## Consequences

- Positive: minimal diff. One route, one controller handler, one service method. The `requireAuth` middleware and `sanitizeUser` helper are reused as-is.
- Positive: email is immutable by construction. The controller destructures only `displayName` from the body, so no amount of client-side trickery can change the email through this endpoint.
- Positive: OAuth-safe. The IdP name is never re-synced on returning logins, so a user-edited name will not be overwritten by the next OAuth callback.
- Negative / trade-offs: manual validation means each future profile field needs its own `typeof` check and trim logic. No schema library guards against typos or drift.
- Negative / trade-offs: the JWT is not re-issued, so if `displayName` were ever embedded in the token it would go stale. Today the token carries only `{ userId, email }`, so this is not a problem.
- Follow-ups: a future account-deletion or password-change endpoint should reuse the same whitelist discipline (destructure only the expected field, ignore everything else).
- Follow-ups: consider adopting a schema-validation library as its own ADR if more profile fields are added. One field does not justify the dependency.
