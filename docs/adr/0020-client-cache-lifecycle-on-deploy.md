# ADR-0020: Client cache lifecycle on deploy — build-stamped freshness probe, silent purge-and-reload, image-tag version display

- **Status:** 🟢 accepted
- **Date:** 2026-08-25
- **Deciders:** Sthirs

## Context

What is the issue we are facing? What forces are at play (requirements from
[`docs/specifications.md`](../specifications.md), constraints from other ADRs, technical forces)?

- The specification requires an installable PWA with offline capability (`docs/specifications.md` §Frontend line 141, §Architecture line 124).
- The current nginx configuration (`apps/frontend/nginx.conf`) sends no `Cache-Control` headers, causing browsers to heuristic-cache `index.html`. After a deploy, stale HTML references content-hashed assets that no longer exist — white screen / broken app.
- The PWA uses `vite-plugin-pwa` with `registerType: 'autoUpdate'` (`apps/frontend/vite.config.ts:14-22`, `apps/frontend/src/main.ts:29`). This silently swaps the service worker precache on cold start, but a PWA resumed from background keeps running old JS indefinitely — the SW updates underneath, but the running instance stays stale until a reload.
- Helm images are tagged `dev` in devMode and plain semver in releases (`helm/doschei/templates/_helpers.tpl:30-38`). Semver does NOT change between two local `cluster:build` runs, so only a build-generated unique ID reliably detects every redeploy.
- ADR-0005 established JWT in `localStorage` (`doschei.auth.token`). Any cache cleanup must preserve this token — the user must stay logged in.
- ADR-0002 established the PWA stack (Vue 3, Vite, `vite-plugin-pwa`).
- The user requested: "When a new version of the app is deployed... all the cache is cleaned up in order to avoid cache problems. Don't logout the user." and "Add the version of the app in the account view. The app version is the tag of the image."

## Decision

We will implement a client-side cache lifecycle that automatically detects new deployments, purges all client caches, and reloads once — silently, without logging out the user — while displaying the deployed image tag in the Account view.

Mechanics:

1. **nginx cache-control policy** (`apps/frontend/nginx.conf`):
   - `index.html` and SPA fallback responses → `Cache-Control: no-store`
   - `/sw.js` and `/manifest.webmanifest` → `no-cache`
   - `/app-version.json` → `no-store`
   - `/assets/*` (Vite content-hashed) → `public, max-age=31536000, immutable`
   - `/api/` proxy block unchanged

2. **Build-stamped version artifacts**:
   - Vite build emits `dist/app-version.json` = `{"version": <image tag or 'dev'>, "buildId": "<version>+<UTC ISO timestamp>"}` via an inline plugin with `apply: 'build'`
   - `APP_VERSION` Docker build-arg chain wired through `apps/frontend/Dockerfile`, `.github/workflows/release.yaml` (release tag), `scripts/minikube-build.sh` (`dev`) and `.github/workflows/tests.yaml:107` (`dev`)
   - Typed via `src/vite-env.d.ts` (`VITE_APP_VERSION`)

3. **Client version-check module** (`apps/frontend/src/lib/appVersion.ts`):
   - Pure decision core + injectable side-effect ports (fetch probe / stored buildId in localStorage `doschei.app.buildId` / one-shot sessionStorage reload guard `doschei.app.reloadGuard` / purge all Cache Storage entries + unregister all service workers / guarded single `location.reload()`)
   - Mismatch → purge → store new id → arm guard → reload once
   - Probe fetch failure → no-op (offline-safe)
   - localStorage keys `doschei.auth.token` and `doschei.lang` are NEVER written or removed by this module

4. **Lifecycle wiring** (`apps/frontend/src/main.ts`):
   - Probe at boot after mount + on `visibilitychange`→`visible`, throttled to one check per 30 s
   - No polling interval, no banner UI

5. **Auth hardening** (`apps/frontend/src/stores/auth.ts`):
   - `fetchCurrentUser` logs out ONLY on HTTP 401/403; network errors, 5xx, 429 keep token+session

6. **Workbox config** (`apps/frontend/vite.config.ts`):
   - Explicit `workbox.cleanupOutdatedCaches: true`; `registerType: 'autoUpdate'` kept as-is

7. **Account view version line** (`apps/frontend/src/views/AccountView.vue`):
   - Muted centered footer under Sign Out showing baked `import.meta.env.VITE_APP_VERSION` (fallback `'dev'`)
   - i18n label EN `account.versionLabel: 'Version'` / IT `'Versione'`
   - `data-testid="account-version"`, page-object locator added

8. **Tests**:
   - Vitest unit tests for the version-check decision core (all branches + injected fakes proving purge/unregister/single-reload/token-untouched), auth store error handling (401/403 logout vs network/500/429 keep), AccountView version display (baked value + fallback)
   - Playwright e2e `tests/e2e/app-version.spec.ts`: nginx header assertions, account-version ↔ `/app-version.json` cross-check, and redeploy simulation (route-intercepted probe A→B + seeded stale marker cache + visibilityState override) asserting exactly one reload, marker cache deleted, session intact

## Alternatives considered

- **Backend version endpoint** — rejected: backend restart windows create false negatives; static file ships with the deployment itself.
- **Banner/prompt UX** — rejected: user chose silent auto-reload on open & foreground.
- **Semver-only detection** — rejected: `:dev` rebuilds don't bump semver.
- **Clearing localStorage wholesale** — REJECTED outright: would violate the don't-logout requirement and ADR-0005.

## Sources / Prior art

- `docs/specifications.md` §Frontend line 141 (offline-capable PWA) and §Architecture line 124
- ADR-0005 (JWT in localStorage — cleanup must preserve it)
- ADR-0002 (PWA stack)
- Observed gaps: `apps/frontend/nginx.conf` had no Cache-Control; `autoUpdate` leaves resumed instances stale; `helm/doschei/templates/_helpers.tpl:30-38` tag semantics
- `vite-plugin-pwa` docs: <https://vite-pwa-org.netlify.app/guide/update-handler>
- Draft decisions ledger `.omo/drafts/deploy-cache-cleanup.md` (Decisions D1-D10)

## Consequences

- Positive: root cause of post-deploy breakage fixed (nginx headers); every redeploy detected (build-stamped ID); session survives update (localStorage untouched, auth hardened); offline launch remains functional (probe failure = no-op); version visible in Account view.
- Negative / trade-offs: token remains in localStorage (XSS status quo per ADR-0005); unhashed static assets (`/logo.svg`, `/icons/*`, screenshots) inherit `no-store` (intentional, per scope guardrail); no user-facing update prompt (silent by design).
- Follow-ups: refresh token rotation per ADR-0005; evaluate httpOnly cookie + CSRF for improved XSS resistance.
