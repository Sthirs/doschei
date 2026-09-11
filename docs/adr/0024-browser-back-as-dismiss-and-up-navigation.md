# ADR-0024: Browser Back as dismiss-or-go-up, via history pops and routed overlays

- **Status:** 🟢 accepted
- **Date:** 2026-09-10
- **Deciders:** Sthirs

## Context

The browser Back button currently fights the app. Open a group → "Add expense" →
save: the app returns to group detail, but pressing Back lands on the
already-submitted expense form instead of the groups list. Open the Totals or
Export modal and press Back: the modal stays open and the user is thrown off
the page entirely.

**Root cause.** There is not a single `router.back()` or `router.go()` anywhere
in `apps/frontend/src`. Every topbar back arrow and every post-save / post-delete
exit is a forward `router.push`, so "going back" *grows* the history stack:

> /groups → /groups/:id → /groups/:id/expenses/new → /groups/:id     (4 entries)

Five call sites define this behaviour, and all five push forward rather than
pop:

- `views/GroupDetailView.vue:67-69` — topbar back arrow, pushes `groups`.
- `views/GroupSettingsView.vue:36-38` — topbar back arrow, pushes `group-detail`.
- `views/AccountView.vue:37-38` — topbar back arrow, pushes `/groups`.
- `composables/useExpenseForm.ts:58-64` — a single `goBack()` reused by three
  exits: the topbar arrow (`views/ExpenseFormView.vue:54`), a successful save
  (`useExpenseForm.ts:121`), and a successful delete (`useExpenseForm.ts:146`).
- `composables/useSettleUpForm.ts:185-191` — `goToGroupDetail`, reused by the
  same three exits on the settle-up form.

Because `goBack` and `goToGroupDetail` are each shared by the topbar arrow and
the save/delete exits, the reported bug and the browser Back bug are the same
bug at three exit points, not three separate bugs.

Separately, every modal and picker (`TotalsModal`, `ExportModal`,
`CategoryPicker`, `UserPicker`, `DateTimePicker`, the expense and settlement
delete-confirm panels) is open/closed via a local `ref(false)` that the router
and the History API know nothing about. Back does not close them; it navigates
the browser away from the page underneath them.

The app is an installable PWA
([`docs/specifications.md:127,144`](../specifications.md)), and on Android the
system Back button — not an in-app control — is the primary navigation
affordance on that platform. This is a correctness issue on the app's main
target platform, not a desktop convenience.

[`ADR-0012`](0012-routed-pages-for-expense-settleup-forms.md) is what makes a
stack-shrinking back arrow coherent in the first place: it made the expense and
settle-up forms routed pages with a teleported back arrow rather than modals,
so there is a real history entry per form for a pop to land on.

**Intended outcome**, as the user stated it: "when I press the back button of
the browser: if there is a modal open then close it, if there is a back button
in the top bar then trigger it." The two behaviours must be *the same*
operation, not one imitating the other with a `popstate` listener.

## Decision

We will make a logical "back" a real history pop, and represent every
dismissable overlay as route state, so the browser Back button and the app's
own back affordances are literally the same navigation. This needs two
distinct pop primitives, not one, because one of the five call sites is
reachable from everywhere in the app rather than from one fixed parent.

1. **`goBackTo(router, target)`** in a new `apps/frontend/src/lib/backNavigation.ts`
   pops history (`router.back()`) when the previous entry (`router.options.history.state.back`)
   already resolves to `target`, and falls back to `router.replace(target)` —
   never `router.push` — otherwise, so the stack never grows on the way "back."
   This is for the four labelled back arrows whose parent is fixed by the route
   tree, and the post-save / post-delete exits that share the same target: the
   arrow on `GroupDetailView.vue:67` (target `groups`), the arrow on
   `GroupSettingsView.vue:36` (target `group-detail`), and the arrow plus both
   save/delete exits in `useExpenseForm.ts:58` and `useSettleUpForm.ts:186`
   (target `group-detail`).
2. **`goBackOr(router, fallback)`**, also in `lib/backNavigation.ts`, pops
   whenever there is *any* previous entry (`state.back` is non-null), and
   `replace`s with `fallback` only when there is none. This is for
   `AccountView.vue:37` alone: Account is reachable from every screen via the
   avatar in the global topbar (`components/AppTopbar.vue:20-22`), so "the
   previous entry" is whatever screen the user actually came from — group
   detail, group settings, or the groups list — not always `/groups`.
   `goBackTo(router, '/groups')` would be wrong there: opening Account from
   inside a group and pressing Back would discard the group-detail entry and
   land on `/groups` instead of back in the group. A consequence is that
   Account's back arrow no longer always means "to groups," so its aria-label
   key (currently `account.backToGroups`, `AccountView.vue:66`) becomes the
   generic `common.back`.
3. **`useRoutedOverlay(id)`** in a new `apps/frontend/src/composables/useRoutedOverlay.ts`
   represents one dismissable overlay as `?overlay=<id>` on the current route.
   `open()` pushes the query param (same route record, so the component is
   reused, not remounted); `close()` pops the entry it owns or replaces if the
   page was loaded with the overlay already open; `closeBeforeLeaving()` always
   replaces, for the case where the overlay's own entry must be dropped before a
   further pop (the delete-confirm flow — see below). Only one overlay is
   representable at a time, matching the app: no overlay today opens from inside
   another.
4. No `popstate` listener anywhere, and no raw History API beyond what
   vue-router already wraps. All navigation stays declarative through the
   router.

The net effect: the four labelled topbar back arrows, Account's avatar-reachable
back arrow, and the browser Back button all resolve to a `router.back()` call
whenever there is a previous entry to pop, and an open overlay is closed by a
Back press because closing it *is* a pop of the entry that opening it pushed.

## Alternatives considered

- **Intercept `popstate`, or cancel the navigation in a global `beforeEach`
  guard, and invoke the current view's back handler.** Rejected: it fights the
  browser instead of using it, vue-router's navigation guards cannot reliably
  distinguish a user-initiated history pop from a programmatic navigation, and
  the resulting behaviour is effectively untestable — there is no way to
  simulate "the user clicked the physical Back button" in a guard-cancellation
  scheme with the confidence a unit test needs.
- **An invisible same-URL sentinel entry**, pushed with
  `router.push({ force: true, state: { overlay: id } })` and detected by
  inspecting history state in a global `afterEach`. Rejected for a structural
  reason, not just a testability one: a sentinel entry has, by construction,
  an *identical* URL to the entry beneath it, so `goBackTo`'s
  `state.back === router.resolve(target).fullPath` comparison — the mechanism
  the whole labelled-back-arrow fix depends on — becomes true for the sentinel
  itself as well as for the real target. Popping from a form whose overlay
  happens to be a sentinel would therefore land on the sentinel and *re-open
  the overlay* instead of leaving the page. The sentinel and the history-pop
  fix are not merely awkward together; they actively conflict and cannot
  coexist. Poor testability and the loss of deep-linkability (you cannot
  bookmark or share a URL with the overlay open) are real, but secondary,
  costs.
- **A blind `router.back()` everywhere**, with no target check at all.
  Rejected: `LoginView.vue:42` pushes the post-login redirect target
  (`router.push(redirectTarget.value)`), so a user who deep-links straight into
  a form while logged out has `state.back === '/login'` on that form. A blind
  pop from the form would land back on `/login`, and the `meta.guestOnly` guard
  (`router/index.ts:112-114`) then bounces an authenticated user away from
  `/login` to `/groups` — the wrong screen, reached by two hops instead of one
  intentional `replace`. Checking the target first and degrading to `replace`
  when it does not match, as `goBackTo` does, avoids this without adding a
  special case for the login route.
- **`router.replace` on every logical-back exit, unconditionally**, instead of
  popping when possible. Rejected: it leaves a dead Back press — two
  consecutive history entries render the same screen, so pressing Back once
  does nothing visible — and it discards the entry that legitimately came after
  the current one, which `router.back()` preserves.
- **Trap Back entirely when there is no history to pop** (e.g. a deep link
  straight into `/groups/:id/expenses/new` in a fresh tab, where there is
  nothing beneath it to return to). Rejected by the user: Back must still be
  able to leave the site in that case, so the fallback is `replace` to the
  logical parent, not a trap.

## Sources / Prior art

- [`ADR-0012`](0012-routed-pages-for-expense-settleup-forms.md): established
  expense/settle-up as routed pages with deep-linkability as an explicit goal
  and a Teleport-based topbar back arrow
  (`apps/frontend/src/views/GroupSettingsView.vue:34-67` per that ADR). This
  decision extends the same deep-linkability goal to overlays via the
  `?overlay=<id>` query, rather than fighting it with an invisible sentinel.
- [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md): the 250
  pure-LOC ceiling (measured by `scripts/pure-loc.mjs`, after Prettier) is why
  this logic lands in two new single-responsibility composables/libs rather
  than inline in the views. `GroupDetailView.vue` measures 223 pure LOC today —
  25 lines of headroom before the touched views and components (also
  `CategoryPicker.vue` 225, `DateTimePicker.vue` 215, `UserPicker.vue` 211)
  would need a further child-component split just to accommodate this change.
- [`ADR-0009`](0009-testing-strategy.md): the Vitest-unit-plus-Playwright-
  against-a-deployed-app model this change's test plan (Vitest for
  `goBackTo`/`goBackOr`/`useRoutedOverlay`, Playwright for the browser Back
  button itself) follows.
- `node_modules/vue-router/dist/vue-router.js:91-146` — `buildState`, `push`,
  and `replace` on the web history implementation: `push` writes `back` as a
  plain fullPath string on the new entry, while `replace` *preserves* the
  existing entry's `back` value. This is why the `state.back === resolve(target).fullPath`
  comparison in `goBackTo`/`goBackOr` is sound, and why falling back to
  `replace` never corrupts a later pop's view of what came before.
- `node_modules/vue-router/dist/vue-router.js:228-288` — `createMemoryHistory`
  does **not** populate `back`, `current`, `forward`, or `position` at all (its
  `state` getter returns whatever was passed to `push`/`replace` verbatim).
  This is why the unit tests for `goBackTo`/`goBackOr` need a hand-rolled fake
  router rather than a real `createMemoryHistory`-backed one.
- `node_modules/vue-router/dist/index-BN0B0y8a.d.ts:1474-1477` —
  `Router.back(): void`: it returns nothing, i.e. it is fire-and-forget, unlike
  `push`/`replace` which return a `Promise`.
- Call-site inventory read directly: `GroupDetailView.vue:67`,
  `GroupSettingsView.vue:36`, `AccountView.vue:37`, `useExpenseForm.ts:58`,
  `useSettleUpForm.ts:186`.
- The user's stated rule, verbatim: "when I press the back button of the
  browser: if there is a modal open then close it, if there is a back button in
  the top bar then trigger it."

## Consequences

- Positive: two small, targeted rules replace five hand-written forward-push
  exits — `goBackTo` for the four labelled back arrows and their shared
  save/delete exits, `goBackOr` for the one avatar-reachable exit — so the
  topbar back arrows and the browser Back button become the same history
  operation rather than behaviours kept in sync by hand.
- Positive: overlays become deep-linkable (e.g. `/groups/:id?overlay=totals`),
  extending the deep-linkability goal ADR-0012 set for forms to overlays too.
- Positive: Back and Escape become the same gesture for every overlay, which
  also prompts adding an Escape handler to Totals and Export, which currently
  lack one.
- Positive: a pre-existing bug is fixed in passing —
  `GroupDetailView.vue:150-155` applies the *settings* title suffix
  (`groupDetail.settingsTitleSuffix`) to the group-detail title whenever
  `history.state.groupName` is set, so the page briefly flashes "⟨name⟩
  Settings" on arrival. Fixing the `state` shape that `goBackTo`/`goBackOr`
  produce corrects this alongside the navigation change.
- Negative / trade-offs: URLs now carry transient UI state (`?overlay=…`) that
  has no meaning once the overlay closes. Only one overlay can be
  representable at a time — acceptable today since no overlay opens from
  inside another, and enforced structurally, not just by convention: the
  overlay query key is single-valued, and `open()` must `replace` rather than
  `push` when a *different* overlay is already open on the same route, which
  keeps the invariant "at most one history entry per route for the whole
  overlay layer" — otherwise a second `push` would leave two overlay entries
  stacked on one route, and a single Back press would not return to the bare
  route.
- Negative / trade-offs: `router.back()` is fire-and-forget (`Router.back():
  void`, unlike `push`/`replace`), so a fast double-tap on Back or on a
  back-arrow can pop two entries where the old double-`push` behaviour was
  merely invisible, not broken. A `popPending` latch is therefore mandatory,
  not a nice-to-have: it is set before calling `router.back()` and cleared by a
  lazily-installed `router.afterEach`, which is used specifically because it
  fires even on failed or aborted navigations, so the latch can never get
  stuck open.
- Negative / trade-offs: `UserPicker` needs a new required `overlayId` prop,
  since it is mounted twice on the settle-up page and its existing `testId`
  prop must not be reused for production behaviour. Four picker unit tests
  (`CategoryPicker.test.ts`, `CategoryPickerDismissal.test.ts`,
  `UserPicker.test.ts`, `DateTimePicker.test.ts`) currently mount with no
  router at all and must start installing one. The expense and settlement
  delete flows need a second `closeBeforeLeaving()` operation distinct from
  `close()`, so that a post-delete back pop does not leave a history entry
  pointing at a now-deleted expense or settlement.
- Negative / trade-offs: scroll position is not restored across a pop. No
  `scrollBehavior` is configured on the router, and the app scrolls inner
  `overflow-y-auto` containers rather than the window, so a pop back to a long
  expense list resets to the top of that container. This is unchanged by this
  ADR, not introduced by it, but it becomes more visible once Back is a real
  pop that people use routinely rather than an edge case.
- Negative / trade-offs, accepted deliberately: after a pop from a successful
  *save*, a forward entry remains that re-enters an empty create form if the
  user presses forward — harmless, since `useExpenseForm` re-runs on that
  entry and `sharedGroup` is `null`, so it simply refetches. After a
  *delete*, the equivalent forward entry is a dead edit URL that renders the
  existing "Expense not found." state. The alternative — `replace` instead of
  pop after a delete — was considered and rejected: it leaves a duplicate
  `/groups/:id` entry in the stack and a dead-feeling Back press (two entries
  rendering the same group-detail screen), which is worse than an unlikely
  forward-navigation into a stale form.
- Follow-ups, by topic (no ADR number — a future ADR would need its own
  accepted number):
  - Whether an overlay stack or nesting is ever needed, if a future feature
    wants to open one overlay from inside another.
  - Extracting the four copy-pasted teleported back-arrow blocks
    (`GroupDetailView.vue`, `GroupSettingsView.vue`, `AccountView.vue`, and the
    expense/settle-up forms) into one shared component.
  - Whether `authStore.logout()` should `replace` rather than `push` `/login`,
    for the same "don't grow the stack on an exit" reasoning applied here.
  - A router `scrollBehavior` using `savedPosition`, now that Back is a real
    history pop rather than a fresh forward navigation, so returning to a long
    list could restore its prior scroll offset — subject to the inner-container
    scrolling trade-off noted above.
