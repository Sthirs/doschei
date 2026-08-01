# ADR-0005: Authentication & identity — JWT local auth + OIDC PKCE provider registry

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Features and §Architecture) requires both local authentication (email + password) and authentication via Google (OAuth2). The backend must implement the Authorization Code + PKCE flow for Google authentication and also support local authentication. PR #1 established local JWT auth; PR #25 (`feat: add oauth2 support`) added a generic OIDC provider with PKCE; PR #26 (`fix(oauth2): build redirect from FRONTEND_URL and trust local proxy`) fixed the redirect URL construction and proxy trust; PR #28 (`feat(auth): add options to disable local login and local registration`) added environment toggles to disable local auth endpoints.

## Decision

We will implement dual authentication:

1. **Local auth**: email + password with bcryptjs hashing. On successful login/register, the backend signs a JWT (HS256, 7-day expiry, secret from `JWT_SECRET` env) using `jsonwebtoken`. The token is returned to the frontend, which stores it in `localStorage` (key `doschei.auth.token`) and attaches it as a `Bearer` token on all API requests via an Axios interceptor. A `requireAuth` middleware validates the Bearer token on protected routes.

2. **OAuth2/OIDC auth**: a generic OIDC provider backed by `openid-client` v6, implementing Authorization Code + PKCE with S256 code challenge. The provider is registered in a module-singleton `providerRegistry` (keyed by provider name). Discovery happens at boot via `initOAuthProviders()`; if discovery fails, the provider is not registered and OAuth routes return 503 until restart — the backend never crashes on IdP misconfiguration. A `UserIdentity` entity (table `user_identities`, unique `(provider, subject)`) links OAuth subjects to local users by email. Dex is deployed as an optional in-cluster IdP for development and testing (Helm toggle `dex.enabled`).

3. **Local auth toggles**: `AUTH_LOCAL_LOGIN_ENABLED` and `AUTH_LOCAL_REGISTRATION_ENABLED` environment variables (default `"true"`) gate the `/api/auth/login` and `/api/auth/register` endpoints via `requireLocalAuthEnabled` middleware (returns 403 when disabled). The `/api/auth/config` endpoint exposes the toggle state to the frontend so the UI can hide disabled forms.

## Alternatives considered

- **Session-cookie authentication** — server-side sessions with `express-session`. Not chosen: stateless JWT is simpler for a REST API consumed by a PWA; no session store to manage.
- **Passport.js** — the standard Node auth middleware. Not chosen: `openid-client` v6 provides a cleaner, more modern OIDC client API with native PKCE support; Passport's strategy plugins lag on OIDC compliance.
- **httpOnly cookies for token storage** — more XSS-resistant than `localStorage`. Not chosen: PWA service workers interfere with cookie-based auth flows; `localStorage` + Bearer header is simpler for a SPA. The XSS risk is accepted as a trade-off.
- **Refresh token rotation** — short-lived access tokens + refresh tokens. Not chosen: a single 7-day JWT is sufficient for the prototype; refresh infrastructure is deferred.
- **Hardcoded provider list** — instead of a registry pattern. Not chosen: the `providerRegistry` allows adding new IdPs without refactoring callers or controllers.

## Sources / Prior art

- `docs/specifications.md` §Features — "Users can sign in with their Google account"; §Architecture — "It supports local authentication and authentication via Google."
- PR #1 (`1571040`) — established local JWT auth (`authService.ts`, `jwt.ts`, `middleware/auth.ts`).
- PR #25 (`b700bc2` — `feat: add oauth2 support`) — added `OidcProvider`, `providerRegistry`, `UserIdentity` entity, `oauthService.ts`, `oauthController.ts`, Dex in Helm chart.
- PR #26 (`d81d622` — `fix(oauth2): build redirect from FRONTEND_URL and trust local proxy`) — redirect URI built from `FRONTEND_URL`, `app.set('trust proxy', ...)` for ingress.
- PR #28 (`457a46a` — `feat(auth): add options to disable local login and local registration`) — `requireLocalAuthEnabled` middleware, `/api/auth/config` endpoint, `AUTH_LOCAL_*` env toggles.
- `apps/backend/src/services/oauth/oidcProvider.ts` — PKCE S256, lazy ESM import of `openid-client` v6, graceful 503 degradation.
- `apps/backend/src/services/oauth/providerRegistry.ts` — module-singleton registry, `initOAuthProviders()` bootstraps at startup, never throws.
- `apps/backend/src/entities/UserIdentity.ts` — unique `(provider, subject)` index, link-by-email.
- `apps/backend/src/utils/jwt.ts` — `jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })`.
- `apps/frontend/src/stores/auth.ts` — token stored in `localStorage` key `doschei.auth.token`.
- OIDC + PKCE: <https://datatracker.ietf.org/doc/html/rfc7636>
- openid-client v6: <https://github.com/panva/openid-client>

## Consequences

- Positive: the provider registry pattern means adding a new IdP (e.g., GitHub, Microsoft) requires only a new `OAuthProvider` implementation and a registry entry — no controller or route changes.
- Positive: graceful degradation means a misconfigured or unreachable IdP never takes down the backend; OAuth routes return 503 and local auth keeps working.
- Positive: the local auth toggles allow deployments to enforce OAuth-only sign-in (e.g., corporate SSO) without code changes.
- Negative / trade-offs: JWT in `localStorage` is vulnerable to XSS — a script injection can exfiltrate the token; httpOnly cookies would be safer but complicate PWA/service-worker flows.
- Negative / trade-offs: 7-day tokens with no refresh rotation means a stolen token is valid for a week; no revocation mechanism exists.
- Negative / trade-offs: link-by-email means a user who changes their email at the IdP gets a new local account instead of linking to the existing one.
- Follow-ups: Implement refresh token rotation before production use.
- Follow-ups: Evaluate httpOnly cookie + CSRF token for improved XSS resistance.
- Follow-ups: Add a user-facing account-linking UI so a local user can connect an OAuth identity.
- Follow-ups: Document the XSS risk of localStorage token storage and the mitigation strategy.
