# ADR-0023: Refresh token rotation — short-lived access JWT + rotating httpOnly refresh cookie

- **Status:** 🟡 proposed
- **Date:** 2026-09-07
- **Deciders:** Sthirs

## Context

The owner reported that users have to redo the OAuth sign-in every seven days
and asked for a refresh token or another standard OAuth2 mechanism.

The cause is not the identity provider. `apps/backend/src/utils/jwt.ts:11` signed
every app token with a hardcoded `expiresIn: '7d'` and no environment override.
That same token is minted for **both** authentication paths — local
`register`/`login` and `oauthService.handleCallback` — so one mechanism covers
both, and the IdP's own session policy never entered into it.

[`ADR-0005`](0005-authentication-and-identity.md) established that design and
recorded its cost in its own Consequences: *"7-day tokens with no refresh
rotation means a stolen token is valid for a week; no revocation mechanism
exists."* It listed **"Implement refresh token rotation before production use"**
as a Follow-up, and separately **"Evaluate httpOnly cookie + CSRF token for
improved XSS resistance."** It also rejected refresh-token rotation outright at
the time, on the grounds that *"a single 7-day JWT is sufficient for the
prototype; refresh infrastructure is deferred."* The prototype premise no longer
holds: the forced re-sign-in is now the product's most visible papercut.

The IdP's own refresh token cannot solve this.
`apps/backend/src/services/oauth/oauthProvider.ts:16-18` states the deliberate
scope: *"Refresh tokens, offline access, and token storage are deliberately out
of scope — we only need the access token long enough to call the UserInfo
endpoint once during the auth callback."* `exchangeCode` returns only
`{ accessToken }`, the IdP is contacted exactly once per sign-in, and an IdP
refresh token would do nothing at all for local password auth.

Four accepted ADRs constrain the shape of any answer:

- [`ADR-0016`](0016-api-rate-limiting.md) puts one global limiter on every `/api`
  route except `/api/health`, so a new unauthenticated refresh endpoint inherits
  that per-IP budget.
- [`ADR-0020`](0020-client-cache-lifecycle-on-deploy.md) purges the Cache API and
  service workers and reloads once on deploy, while *"keeping the user signed
  in"* — any new session credential must survive that purge.
- [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md) caps files at 250
  pure LOC. `apps/backend/src/controllers/authController.ts` measured 186, so the
  new handlers force a responsibility split.
- [`ADR-0004`](0004-postgresql-and-schema-management.md) uses TypeORM
  `synchronize` with no migrations, so a new entity is registered in
  `db/data-source.ts` and appears when `DB_SYNC=true`.

## Decision

We will issue a short-lived access JWT alongside a long-lived **rotating**
refresh token, stored server-side as a SHA-256 digest and delivered to the
browser as an httpOnly cookie.

### Tokens and lifetimes

Three new environment variables, following the blank-tolerant, fail-fast
`RATE_LIMIT_*` pattern in `config/env.ts` and expressed as integer seconds:

| Variable | Default |
| --- | --- |
| `ACCESS_TOKEN_TTL_SECONDS` | `3600` (1 hour) |
| `REFRESH_TOKEN_TTL_SECONDS` | `7776000` (90 days) |
| `REFRESH_TOKEN_REUSE_GRACE_SECONDS` | `30` |

The refresh window is **sliding**: every rotation inserts a successor whose
`expires_at` is computed from *now*, so a user who opens the app at least once
per window never signs in again. There is deliberately **no absolute cap** on a
family's lifetime — see Consequences.

### Storage

A new `refresh_tokens` table (`apps/backend/src/entities/RefreshToken.ts`),
registered in `db/data-source.ts`. Only the SHA-256 digest of the secret is
stored, in a uniquely indexed `token_hash`; the raw secret exists only in the
cookie. `family_id` carries the rotation lineage, `rotated_at` marks a consumed
token, `replaced_by_id` records the chain, and `revoked_at` / `revoked_reason`
record revocation.

Secrets are `crypto.randomBytes(32).toString('base64url')` hashed with a single
SHA-256 — Node's own `crypto`, no new dependency.

### Cookie

`doschei.auth.refresh`; `httpOnly`, `sameSite: 'strict'`,
`secure: NODE_ENV === 'production'` (mirroring the existing
`doschei.oauth.state` precedent), `path: '/api/auth/session'`, `maxAge` equal to
the refresh TTL and re-sent on every rotation so browser expiry slides with the
database row.

`sameSite` is `'strict'` rather than the state cookie's `'lax'` because this
cookie is only ever sent by same-origin XHR, whereas the state cookie must
survive the IdP's cross-site redirect back to the callback. `Set-Cookie` itself
is not filtered by SameSite, so the OAuth callback can still issue it.

### Endpoints

A dedicated sub-router, `apiRouter.use('/auth/session', sessionRouter)`,
mirroring the existing `/auth/oauth` mount. The cookie path equals the mount
point, so the secret reaches exactly these two endpoints and nothing else. Both
are unauthenticated — the access token is expired by definition, so the cookie
is the credential.

- `POST /api/auth/session/refresh` → `200 { token, user }`, the same shape as
  `login`, so the frontend reuses its existing handling and gets an ADR-0018
  language resync for free. Failures are `401` with a `code`:
  `missing_refresh_token`, `invalid_refresh_token`, `expired_refresh_token`,
  `revoked_refresh_token`, `refresh_race`, `refresh_reuse`.
- `POST /api/auth/session/logout` → `204`, idempotent, revokes the whole family.

Every terminal failure clears the cookie so a cold boot cannot retry a refresh
that can never succeed. `refresh_race` is the exception: it leaves the cookie
alone, because a sibling tab holds the live successor.

### Rotation and reuse detection

Rotation runs in one transaction with `setLock('pessimistic_write')` on the
presented row, so two concurrent requests serialize and only one can consume it.
Presenting an already-consumed or revoked token is a reuse signal and revokes the
entire family (`revoked_reason: 'reuse'`) — **except** within
`REFRESH_TOKEN_REUSE_GRACE_SECONDS` of the rotation, which is treated as the
benign multi-tab race and denied without revoking. The grace branch still issues
no token; it suppresses the revocation, not the denial.

Consumed and expired rows are pruned by an `unref`'d six-hour interval started in
`src/index.ts` — never in `createApp()`, which the unit suites call in-process.
Rows are retained seven days after consumption, because a replayed token can only
be *recognised* as reuse while its row still exists.

### Issue sites

A refresh token is issued at `register`, at `login`, and in the OAuth callback
immediately before the redirect to `${FRONTEND_URL}/auth/callback?token=…`. In
`register` and `login` this happens outside the credential `try`/`catch`, so a
failed refresh-token write surfaces as a 500 rather than as "invalid email or
password".

### Frontend

- `lib/authToken.ts` becomes the single owner of the `doschei.auth.token` key,
  which was duplicated across `lib/api.ts`, `stores/auth.ts`, and
  `components/group-detail/ExportModal.vue`.
- `lib/sessionRefresh.ts` performs single-flight renewal, de-duplicated in-tab by
  a shared promise and across tabs by the Web Locks API. It imports neither
  `lib/api` nor `stores/auth` — `stores/auth` already imports `lib/api`, so the
  store and router register callbacks from `main.ts` instead, keeping the graph
  acyclic.
- `lib/api.ts` gains a response interceptor: 401 → refresh → retry **once**.
  `/auth/login`, `/auth/register`, and `/auth/session/*` are excluded, because
  `login` answers 401 for wrong credentials and a refresh there could rotate a
  different, live session on a shared device.
- Only 401/403 from the refresh endpoint clears the session. A 429, a 5xx, or a
  network error preserves it.
- The router attempts one silent restore per page load when localStorage has no
  access token at all — the case the interceptor cannot reach, because nothing
  can 401 if no request is made.
- `logout()` (server-side revocation) is split from `clearSession()`
  (local-only), since the previous single method was called from three places
  with two different meanings.
- `ExportModal.vue` moves from a hand-rolled `fetch` reading localStorage to the
  shared `api` instance, so it inherits renew-and-retry.

We will **not** use the IdP's refresh token and will not request
`offline_access`.

## Alternatives considered

- **Simply lengthening the JWT to 90 days** — not chosen: it multiplies the
  ADR-0005 XSS blast radius roughly thirteenfold and still provides no
  revocation. It treats the symptom and worsens the cause.
- **The IdP's refresh token / `offline_access`** — not chosen: `oauthProvider.ts`
  deliberately discards it, the IdP is consulted exactly once per sign-in, it
  would do nothing for local auth, and it would make session lifetime a function
  of IdP policy rather than ours.
- **httpOnly cookie for the *access* token** — not chosen, and this is where
  ADR-0005's reasoning has to be met directly. ADR-0005 rejected cookie storage
  because *"PWA service workers interfere with cookie-based auth flows."* That
  concern is real for an *access*-token cookie, which every request carries and
  which Workbox's `NavigationRoute` and any `runtimeCaching` handler sit in front
  of. It does not transfer to a refresh-**only** cookie:
  `apps/frontend/vite.config.ts` declares no `runtimeCaching`, so the service
  worker never intercepts `/api` XHR at all; `navigateFallbackDenylist:
  [/^\/api\//]` already keeps `/api` navigations off the SPA fallback; no
  Background Sync replay plugin exists that could re-send a single-use POST; and
  `path: '/api/auth/session'` keeps the cookie out of every fetch the service
  worker does handle. The Bearer-header access token from ADR-0005 is preserved
  unchanged, so nothing about the PWA request path changes.
- **Refresh token in `localStorage` next to the access token** — not chosen:
  identical XSS exposure to today and strictly worse than the status quo, since a
  script would steal a 90-day session instead of a 7-day one.
- **A non-rotating long-lived refresh token** — not chosen: theft would be
  undetectable and effectively permanent. Rotation with reuse detection is the
  OAuth 2.0 Security BCP recommendation for public clients.
- **An absolute cap on a family's lifetime** — not chosen as the default: a cap
  directly contradicts the requirement that an active user never signs in again.
  Recorded as an accepted risk rather than hidden behind a knob.
- **bcrypt (already a dependency, via `utils/password.ts`) for the token hash** —
  not chosen: bcrypt is deliberately slow to defend low-entropy human passwords
  against offline dictionary attack. A 256-bit CSPRNG secret has no dictionary,
  so the work factor buys nothing and would put ~100 ms on the refresh path.
- **A CSRF token or a mandatory custom header on the session endpoints** — not
  chosen: `sameSite: 'strict'` means the cookie is never attached to a
  cross-site-initiated request, and `cors({ origin: env.CORS_ORIGIN })` never
  emits `Access-Control-Allow-Origin` for a foreign origin, so an attacker can
  neither send the request nor read the response. A second secret would have to
  be threaded through every test helper for no gain.
- **Server-side sessions (`express-session`)** — already rejected by ADR-0005 and
  not reopened. This design keeps the access token stateless and adds state only
  for the refresh lineage.
- **Cookie `path: '/'`** — not chosen: it would send the refresh secret on every
  asset and API request, into every proxy log. **Cookie
  `path: '/api/auth/refresh'`** — not chosen: logout could not then read the
  cookie, so server-side revocation on sign-out would be impossible.
  **`path: '/api/auth'`** — not chosen: it would also attach the cookie to
  `GET /api/auth/me`, which the router guard calls on every navigation.
- **Adding the handlers to `authController.ts` as it stood** — not chosen: at 186
  pure LOC the file would have crossed the ADR-0021 ceiling. Splitting behind a
  re-export barrel is the convention that ADR set.

## Sources / Prior art

- Owner request (2026-09-07): users must not have to redo the OAuth login every
  seven days.
- [`ADR-0005`](0005-authentication-and-identity.md) — the JWT + OIDC decision
  this extends; its Follow-ups *"Implement refresh token rotation before
  production use"* and *"Evaluate httpOnly cookie + CSRF token for improved XSS
  resistance"*; and its Alternatives-considered rejection of both rotation and
  httpOnly cookies, engaged with above.
- [`ADR-0016`](0016-api-rate-limiting.md) — the global `/api` limiter the refresh
  endpoint sits behind, and its deferral of per-route limiters.
- [`ADR-0020`](0020-client-cache-lifecycle-on-deploy.md) — the deploy purge that
  must keep the user signed in, and the 401/403-only logout hardening of
  `fetchCurrentUser` that this design reuses for refresh failures.
- [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md) — the 250 pure
  LOC ceiling, and the `controllers/group/` + zero-logic barrel precedent the new
  `controllers/auth/` follows.
- [`ADR-0004`](0004-postgresql-and-schema-management.md) — `synchronize`, no
  migrations, entity registration in `db/data-source.ts`.
- [`ADR-0018`](0018-internationalization-en-it.md) — `satisfies MessageSchema`,
  so the new `auth.sessionExpired` / `auth.oauthFailed` keys land in both
  catalogs.
- `apps/backend/src/utils/jwt.ts:11` (pre-change) — the hardcoded `'7d'`.
- `apps/backend/src/controllers/oauthController.ts:34-40` and
  `apps/backend/src/services/oauthService.ts` `STATE_COOKIE_TTL` — the existing
  cookie precedent whose flags this one derives from.
- `apps/backend/src/services/oauth/oauthProvider.ts:16-18` — the documented
  decision to discard the IdP refresh token.
- `apps/frontend/vite.config.ts` — the Workbox configuration underpinning the
  service-worker rebuttal above.
- OAuth 2.0 Security Best Current Practice, refresh-token rotation and reuse
  detection: <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics>
- OAuth 2.0 for Browser-Based Applications:
  <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps>
- Web Locks API (cross-tab single flight):
  <https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API>
- SameSite cookie semantics:
  <https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis>

## Consequences

- Positive: an active user never re-authenticates. The sliding window renews on
  every use, which is the requirement this ADR exists to satisfy.
- Positive: real server-side revocation exists for the first time — signing out
  kills the family, and reuse detection turns a successful token theft into a
  *detected* theft that ends both the attacker's and the victim's access.
- Positive: the XSS blast radius of `localStorage` drops from seven days of
  offline replay to one hour plus the lifetime of an open tab.
- Positive: `ACCESS_TOKEN_TTL_SECONDS` makes the token lifetime an operator knob
  instead of a source literal.
- Positive: routing the CSV export through the shared `api` instance removes the
  last call site that read the token straight out of `localStorage`.
- Negative / trade-off: the access token still lives in `localStorage`, so
  ADR-0005's accepted XSS trade-off is **reduced, not eliminated**. A script on
  the page can still read it, and can still call the refresh endpoint from the
  victim's own page while the tab is open. The honest claim is a smaller window,
  not immunity.
- Negative / trade-off: revoking a family does **not** invalidate an
  already-issued access token, which stays valid for up to
  `ACCESS_TOKEN_TTL_SECONDS` after sign-out. This is the cost of a stateless
  access token.
- Negative / trade-off: with no absolute cap, a refresh token that is stolen
  *and* never triggers reuse detection could in principle sustain access
  indefinitely. Accepted as the direct price of the requirement.
- Negative / trade-off: one new table with per-refresh row growth, bounded by the
  seven-day retention prune.
- Negative / trade-off: the refresh endpoint is unauthenticated and shares the
  ADR-0016 per-IP budget. Behind shared NAT or CGNAT an exhausted budget produces
  429s, so the client must treat a 429 as "retry later" and never as "session
  expired" — that classification is load-bearing and is unit-tested.
- Negative / trade-off: `sameSite: 'strict'` assumes the app and API share a
  registrable domain, which the single-ingress topology guarantees today. Splitting
  them onto separate domains would force `None; Secure` and make a real CSRF
  token mandatory.
- Negative / trade-off: `secure: NODE_ENV === 'production'` means a production
  deployment over plain HTTP silently drops the cookie and signs users out every
  hour. Mitigated only by a startup warning, not prevented.
- Negative / trade-off: at rollout, every user holding a valid 7-day token has no
  refresh cookie, so each signs in once more when that token expires. Accepted in
  preference to minting cookies from `requireAuth`, which would put a write on
  the hot path of every authenticated request for a one-time migration.
- Negative / trade-off: `tests/e2e/fixtures/auth.ts` had to gain refresh-cookie
  capture, storage-state freshness validation, and per-worker files. A shortened
  access TTL turns any long-lived cached storageState into a suite-wide failure
  that looks like an application bug.
- Note: `middleware/auth.ts` keeps its own `AuthService` construction rather than
  importing the new `controllers/auth/authServiceInstance.ts`. Sharing it would
  make middleware depend on the controller layer, inverting the ADR-0003
  layering, so there are deliberately two constructions.
- Follow-up topics: immediate access-token revocation via a `tokens_valid_after`
  marker on `User` compared against the JWT `iat`, which the per-request
  `requireAuth` lookup already makes cheap; a stricter dedicated limiter for the
  auth endpoints, which ADR-0016 deferred; a "sign out of all devices" surface
  once families are attributable to devices; a shared refresh-token store if
  `replicaCount` ever exceeds 1; and moving the access token out of
  `localStorage` entirely.
