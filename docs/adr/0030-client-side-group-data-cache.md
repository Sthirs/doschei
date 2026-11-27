# ADR-0030: Client-side group data cache — in-memory stale-while-revalidate Pinia store

- **Status:** 🟡 proposed
- **Date:** 2026-11-27
- **Deciders:** Sthirs

## Context

The everyday path is: open the app, open a group, add an expense, go back.
Every step of it waits on the network today:

- `GroupsView` (`composables/useGroupsView.ts`) and `GroupDetailView`
  (`views/GroupDetailView.vue`) keep their data in component-local `ref`s,
  so each mount starts empty, shows the full-screen "Loading…" state, and
  only renders after `GET /api/groups` or `GET /api/groups/:id` returns.
- Saving an expense (`composables/useExpenseForm.ts`) navigates back, which
  remounts `GroupDetailView`. The group the user was just looking at, already
  in memory, is thrown away and fetched again behind "Loading…".
- The only reuse today is `sharedGroup` (`router/index.ts`). It is a one-shot
  hand-off of the detail to the expense and settle-up forms
  ([ADR-0012](0012-routed-pages-for-expense-settleup-forms.md)), not a cache.

Measured on production (2026-11-27, group with 135 expenses): server time
was about 210–250 ms for the list and 50–120 ms for the detail, before the
backend fix that stopped reading image columns in the expense joins. Bodies
are about 108 KB and 155 KB, since images are embedded per
[ADR-0019](0019-image-upload-architecture.md). After that fix the server
answers in about 20–30 ms. What the user still sees is the round trip, plus
a blank "Loading…" screen on every navigation, and on mobile links that
dominates.

Forces:

- The specification requires the frontend to be performant, to use Pinia
  for state, and to work as a PWA usable offline
  ([`docs/specifications.md`](../specifications.md) §Frontend).
  [ADR-0019](0019-image-upload-architecture.md) already expects image data
  URLs to be "cached in Pinia store".
- Balances must not be silently wrong. Any cached view has to be refreshed
  against the server, and the server stays the only source of truth for the
  money math ([ADR-0006](0006-money-ledger-and-balance-math.md)).
- [ADR-0020](0020-client-cache-lifecycle-on-deploy.md) purges client caches
  on deploy, and [ADR-0023](0023-refresh-token-rotation.md) defines logout
  and session loss. A data cache must not outlive either.
- Another member can change the group at any time. Web Push
  ([ADR-0025](0025-web-push-notifications.md)) already signals ledger
  changes.

## Decision

We will keep the groups list and each opened group detail in an in-memory
Pinia store, `useGroupDataStore`, and read them **stale-while-revalidate**.

1. **Read.** A view renders the cached value immediately when there is one
   and always starts a background refetch. "Loading…" is shown only when
   nothing is cached for that key. When the refetch fails, the cached data
   stays on screen with a non-blocking error state. The full-screen error
   appears only when there is no cached data.
2. **Keys.** One `list` entry, and one `detail:<groupId>` entry per opened
   group. Concurrent reads of the same key share one in-flight request.
3. **Writes.** After a successful create, update or delete of an expense or
   settlement, or a change to the group (name, image, members), the store
   marks the affected `detail:<groupId>` entry and the `list` entry stale.
   The next read refetches them. While the refetch runs, the stale entry is
   still rendered, so going back from the expense form shows the group at
   once and then the new expense. No balance is computed on the client.
4. **Hand-off.** `sharedGroup` is replaced by a read of `detail:<groupId>`
   in the expense and settle-up forms. A cold deep link to a form still
   fetches.
5. **Prefetch.** When the groups list renders, `detail:<groupId>` is
   prefetched for at most the first few groups, so the first open of a group
   is usually warm.
6. **Lifetime.** The store is memory only: no `localStorage`, no IndexedDB,
   no service-worker runtime cache for `/api/`. It is cleared on logout and
   on session loss (ADR-0023), and it naturally dies with the page reload
   ADR-0020 triggers on deploy. A `visibilitychange` → `visible` event and
   a received push for a group mark the matching entries stale.

## Alternatives considered

- **Keep component-local fetching and only speed up the backend.** This is
  already done for the server side. It leaves a blank "Loading…" screen and
  a full round trip on every navigation, which is exactly the path the user
  takes most.
- **Persist the cache (localStorage / IndexedDB) for instant cold start.**
  This would make even the first screen after launch instant and would help
  offline use. It was rejected for now: the bodies embed images
  (ADR-0019), so they would hit the localStorage size limit. A persisted
  store also needs its own purge rules next to ADR-0020 and ADR-0023, and
  it would show balances that could be days old. It can come later as its
  own decision.
- **Service-worker runtime caching (Workbox `StaleWhileRevalidate`) for
  `/api/groups*`.** No component code would change. It was rejected because
  the custom service worker deliberately keeps `/api/` out of its handling
  (ADR-0020, ADR-0025). The responses depend on the bearer token, so
  logout or a user switch would need explicit purging. And the views could
  not know when they are showing stale data.
- **A data-fetching library (TanStack Query for Vue, `pinia-colada`).** It
  gives deduplication, staleness and refetch-on-focus out of the box. It
  was rejected to keep the dependency surface small: the app has two cached
  resources, and a small Pinia store covers them. It is worth revisiting if
  more resources need caching.
- **Optimistic updates (insert the new expense locally before the server
  confirms).** The add flow would feel even faster. It was rejected because
  splits and balances are computed on the server (ADR-0006), and
  duplicating that math on the client risks showing wrong amounts.

## Sources / Prior art

- [RFC 5861 — HTTP Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861)
  (`stale-while-revalidate` semantics).
- [TanStack Query — Caching Examples / stale-while-revalidate](https://tanstack.com/query/latest/docs/framework/vue/guides/caching)
  and [SWR](https://swr.vercel.app/) for the read-from-cache-then-revalidate
  pattern and shared in-flight requests.
- [Pinia documentation](https://pinia.vuejs.org/) — the specification's
  state-management choice.
- Specification §Frontend; ADR-0006, ADR-0012, ADR-0019, ADR-0020, ADR-0023
  and ADR-0025 as cited above.
- Production measurements of 2026-11-27, summarised in the Context section.

## Consequences

- Positive: going back to the list, reopening a group, and returning from
  the expense form render instantly from memory. The network refresh runs
  behind the visible screen. Prefetch usually makes the first open of a
  group warm too. Shared in-flight requests remove duplicate fetches.
- Negative / trade-offs: the user can briefly see data that is a few
  seconds old until the refetch lands, for example a change another member
  just made. A new store module adds invalidation rules that every mutating
  call site has to follow. Cold start (first launch, reload, post-deploy
  reload) is unchanged.
- Follow-ups: implement the store and migrate `useGroupsView`,
  `GroupDetailView`, the expense and settle-up forms and group settings to
  it, with Vitest coverage of the store and a Playwright test of the
  add-expense round trip without a loading state. Later topics: a persisted
  cache for an instant cold start and offline reading, and serving images
  by reference instead of embedding them so cached payloads stay small.
