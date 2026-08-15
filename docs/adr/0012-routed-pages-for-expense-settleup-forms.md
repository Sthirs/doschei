# ADR-0012: Routed pages for expense and settle‑up forms instead of modals

- **Status:** 🟢 accepted
- **Date:** 2026-08-09
- **Deciders:** the user

## Context

The Add Expense, Edit Expense, and Settle Up forms today live inside full-screen modals
(`ExpenseFormModal.vue`, `SettleUpModal.vue`). The user chose to make them first-class routed
pages with the global top bar and a back arrow, matching the Figma mockups and the pre-existing
`GroupSettingsView` page pattern.

The routed-page pattern already exists in the codebase. `GroupSettingsView` uses
`<Teleport to="#topbar-leading">` for a back arrow, navigates with `router.push`, and sets
`currentPageTitle` on mount. The plan replicates that pattern.

The product spec ([`docs/specifications.md`](../specifications.md) §Features 67, 78, 79) does not
prescribe modal vs page. It only specifies the behaviours (add expense, edit expense, record
settle-up), so the architectural form is an implementation choice.

## Decision

We will implement the Add Expense, Edit Expense, and Settle Up forms as dedicated Vue Router
pages under `/groups/:id/expenses/new`, `/groups/:id/expenses/:expenseId/edit`,
`/groups/:id/settle-up`, and `/groups/:id/settlements/:sid/edit`, reusing the existing
AppTopbar + `<Teleport to="#topbar-leading">` back-arrow pattern from `GroupSettingsView`, and
delete the old `ExpenseFormModal.vue` and `SettleUpModal.vue` modal components.

## Alternatives considered

- **Alternative A: keep the modals (current state).** Rejected. The user explicitly asked for
  "new pages", and the Figma mockups show full-screen routed layouts with top nav bars.
- **Alternative B: refactor to a shared form component imported by both modals (legacy) and
  pages (new).** Rejected. It doubles the component surface (the same form body exists in two
  places), adds dead code, and the modals become unused once the pages replace them. Choosing A
  was the cleanest path per the user.

## Sources / Prior art

- The Speccode `GroupSettingsView` routed-page convention
  (`apps/frontend/src/views/GroupSettingsView.vue:34-67`).
- The vue-router lazy-load pattern in `apps/frontend/src/router/index.ts:6-11`.
- The AppTopbar Teleport slot-target pattern in
  `apps/frontend/src/components/AppTopbar.vue:24,31`.
- The Figma mockups for Add Expense (`#15:1234`) and Settle Up (`#15:1595`).
- The product spec in [`docs/specifications.md`](../specifications.md) §Features 67, 78, 79 and
  §Balance 99-112.

## Consequences

- Positive: deep-linkable forms (bookmark `/groups/:id/expenses/new`), consistent UX with the
  existing GroupSettings page, no dead modal code, and cleaner test coverage (the page is the
  source of truth, not a detached dialog).
- Negative / trade-offs: 4 new routes increase the route table, and the heavy test surface
  (Playwright page object + 3 e2e specs tied to the old modal markup) must be rewritten
  (committed as a separate test commit, per the plan's test-after strategy).
- Follow-ups: none immediate. If the two-user group shortcuts (spec §Features 72-76) are
  implemented later, they will also use routed pages.
