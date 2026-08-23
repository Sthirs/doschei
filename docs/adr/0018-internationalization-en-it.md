# ADR-0018: Internationalization — vue-i18n, English & Italian, per-user language

- **Status:** 🟢 accepted
- **Date:** 2026-08-23
- **Deciders:** Sthirs

## Context

The specification has required a multilingual interface since its first
revision: "The application is multilingual and supports English and Italian"
([`docs/specifications.md`](../specifications.md) §Features), with two
companion product decisions — the UI uses the user's saved language
preference when available and falls back to English otherwise, and expense
categories are represented internally by stable keys while their labels are
localized in the frontend (§Product Decisions). The implementation-status
audit records both as unimplemented: no i18n library exists, all UI strings
are hardcoded English, and category labels are hardcoded English strings
despite stable keys being present ([`docs/specifications.md`](../specifications.md)
§Implementation Status).

Additional forces:

1. **Where the preference lives.** The preference must survive devices and
   sessions, which points at server-side storage on `User`. The account
   surface already edits exactly one profile field through
   `PATCH /api/auth/me` with a strict whitelist discipline
   ([`ADR-0013`](0013-account-name-update-endpoint.md)); a second profile
   field either reuses that endpoint or forks the resource.
2. **Registration-time default.** There is no registration UI yet (spec audit);
   local registrations happen API-only, and OAuth auto-registration happens in
   the callback. Any "take the language from the device" behaviour must work
   without new frontend surface: the browser always sends `Accept-Language`,
   and Google's UserInfo returns a `locale` claim under the default
   `openid email profile` scope.
3. **Category intelligence is client-side and label-aware.**
   [`ADR-0017`](0017-category-suggestions-client-side-learning.md) fixes the
   suggestion engine's Stage 3 to match entered descriptions against taxonomy
   labels. Those labels were hardcoded English, so an Italian description
   ("benzina") could never name-match; the engine also split tokens on ASCII
   letters only, mangling accented words ("caffè"). ADR-0017 explicitly keeps
   the engine pure and deterministic ([`ADR-0006`](0006-money-ledger-and-balance-math.md)
   ethos), so localization must enter it as data, not as a framework hook.
4. **Testing strategy.** [`ADR-0009`](0009-testing-strategy.md) demands unit
   vectors plus deployed-browser proof; AGENTS.md §4.2 requires at least one
   Playwright e2e test per user-facing feature.

## Decision

We will internationalize the frontend with **vue-i18n v11** (Composition API,
`legacy: false`) using two statically imported TypeScript message catalogs
(`apps/frontend/src/i18n/en.ts`, `it.ts`); Italian is type-checked against the
English schema (`satisfies MessageSchema`). Locale resolution order is:
authenticated `user.language` → `localStorage['doschei.lang']` → browser
language prefix → `'en'`; every change mirrors to `<html lang>` and the
storage key.

The **per-user preference is stored server-side**: `users.language`
(`varchar(8) NOT NULL DEFAULT 'en'`, schema-synced in dev per
[`ADR-0004`](0004-postgresql-and-schema-management.md)), exposed through
`sanitizeUser` so every auth response carries it. `PATCH /api/auth/me` is
extended to accept `{ displayName?, language? }` — at least one field required;
`displayName` validation unchanged per [`ADR-0013`](0013-account-name-update-endpoint.md);
an explicitly supplied `language` must resolve to `'en'|'it'` (region suffixes
tolerated) or the request fails with 400 (`parseLanguage`), while
device-derived input uses the permissive `normalizeRequestedLanguage`.
Registration captures `body.language ?? Accept-Language`; OAuth first-user
creation prefers the IdP `locale` claim, falling back to the callback request's
`Accept-Language`; returning and link-by-email users are never re-defaulted.
The JWT payload is unchanged.

**Category labels move into the catalogs** behind the existing stable keys
(`categories.items.<key>`, `categories.families.<family>`); the `label` field
is removed from `CategoryDefinition`. The picker renders and searches localized
labels. The suggestion engine accepts a `labels` map parameter (active-locale
key→label), tokenizes Unicode-awarely (`/[^\p{L}\p{N}]+/u`), and excludes
generic categories BY KEY (`*-other`, `general`) — preserving ADR-0017's
pipeline, thresholds, and purity.

All user-facing strings across views/components/composables move into the
namespaced catalog; English rendering stays byte-identical so existing e2e
page objects remain valid. Coverage: key-parity + resolution-order unit tests;
Italian-language e2e happy path; bilingual (EN+IT) auto-selection vectors.

## Alternatives considered

- **Ad-hoc Pinia dictionary** (hand-rolled `t()` store) — rejected: loses
  pluralization, interpolation, message compilation, and TS tooling that
  vue-i18n provides; a second bespoke subsystem to maintain.
- **URL-prefix locales** (`/it/groups`) — rejected: SPA/PWA with no SEO
  requirement; prefixes would ripple through router guards, PWA navigation
  fallback, and every deep link for zero user value.
- **localStorage-only preference** — rejected: does not follow the user across
  devices/browsers, contradicting "saved language preference".
- **Backend-driven translation catalog** — rejected: the spec places label
  localization in the frontend (§Product Decisions); a catalog API adds
  round-trips and cache complexity for two static locales.
- **Lazy-loaded locale chunks now** — deferred: two small catalogs cost ~15 KB
  raw (~5 KB gzip); async bootstrap complicates first paint and tests. Revisit
  with a third locale.
- **Keep PATCH /me name-only; add `/api/account/language`** — rejected:
  fragments the "my profile settings" resource; the whitelist discipline of
  ADR-0013 extends naturally, and this ADR documents the extension without
  modifying the accepted ADR.

## Sources / Prior art

- [`docs/specifications.md`](../specifications.md) §Features (multilingual),
  §Product Decisions (saved preference + fallback; stable keys/localized
  labels), §Implementation Status audit entries for both.
- [`ADR-0002`](0002-frontend-stack.md) (stack; i18n listed as follow-up),
  [`ADR-0004`](0004-postgresql-and-schema-management.md) (schema sync, no
  migrations), [`ADR-0006`](0006-money-ledger-and-balance-math.md) and
  [`ADR-0017`](0017-category-suggestions-client-side-learning.md)
  (pure-function engine; Stage-3 label matching this decision localizes),
  [`ADR-0009`](0009-testing-strategy.md) (test pyramid used for verification),
  [`ADR-0013`](0013-account-name-update-endpoint.md) (PATCH /me whitelist this
  decision extends).
- vue-i18n official documentation — `createI18n` setup, Composition API
  `useI18n`, locale switching via `i18n.global.locale`, and lazy-loading guide
  (consulted via Context7, retrieved 2026-08-23).
- MDN — `Navigator.language`, `Accept-Language` header semantics (BCP-47
  primary-subtag matching).
- Realised implementation reviewed while drafting: `apps/backend/src/services/authService.ts`
  (`normalizeRequestedLanguage`, `parseLanguage`, `sanitizeUser`),
  `apps/backend/src/controllers/authController.ts`,
  `apps/backend/src/services/oauthService.ts` (+`oauth/oidcProvider.ts`),
  `apps/frontend/src/i18n/*`, `apps/frontend/src/lib/categorySuggest.ts`,
  `apps/frontend/src/lib/categories.ts`, `apps/frontend/src/views/AccountView.vue`.
- Comparable expense trackers (Splitwise-style) expose a per-account display
  language setting with device-default at signup — the product pattern this
  follows.

## Consequences

- Positive: the specced multilingual feature ships end-to-end; preferences
  follow the user across devices; anonymous visitors still get a sensible
  device-derived language; `<html lang>` tracks the active locale (a11y win);
  adding a third locale reduces to translating one typed file; Italian
  descriptions now match Italian category names in auto-selection.
- Negative / trade-offs: ~15 KB raw (~5 KB gzip) bundle growth; every new UI
  string must land in two catalogs (enforced by key-parity test + `satisfies`);
  codespell excludes non-English catalogs (English-only dictionary produces
  false positives on Italian text); some words collide across locales ("gas"),
  so cross-language name matching is possible by design; production needs a
  one-time manual `ALTER TABLE users ADD COLUMN language varchar(8) NOT NULL
  DEFAULT 'en'` because prod runs `DB_SYNC=false`.
- Follow-ups (topics only): the future registration UI should send
  `navigator.language` in the register body; PWA manifest localization if
  store listings require it; lazy locale chunks when a third locale arrives;
  threshold tuning for Stage-3 matching on real Italian corpora.
