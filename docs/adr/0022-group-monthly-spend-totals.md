# ADR-0022: Group monthly spend totals — client-side aggregation, dependency-free bars

- **Status:** 🟡 proposed
- **Date:** 2026-09-04
- **Deciders:** Sthirs

## Context

A group screen could answer "who owes whom right now" but not "how much did this
group spend last month, and how much of that was mine". The requested feature is
a **Totals** control in the group-detail action row that opens a bottom sheet
holding a three-bar stacked chart — one bar per month, the bar's full height the
group's spend, the lower segment the signed-in user's own share — with a stepper
that moves the three-month window one month at a time and starts at the current
month plus the two before it.

Four forces made this worth deciding rather than leaving to implementation taste:

1. **The data was already on the client.** `GET /api/groups/:id`
   (`apps/backend/src/services/group/groupCrud.ts`, `getGroupByIdForUser`)
   returns the group's **complete, unpaginated** expense ledger, each entry
   carrying `amount`, `date`, `kind`, and `splits[].computedAmount`. A per-month
   aggregation therefore needed no new endpoint, no new query, and no backend
   change — but [`ADR-0011`](0011-group-expenses-csv-export.md) had put a
   comparable read (CSV export) on the **server**, so "which side aggregates"
   needed an answer that generalises rather than a coin flip.
2. **A charting dependency was the obvious default and the wrong one.** The
   frontend has nine runtime dependencies and none is chart-adjacent. The design
   is a stack of two coloured boxes per bar, four ruled lines, and a text column
   — no curves, no scales, no interaction, no axis library.
3. **"Spend" and "the ledger" are not the same set.** ADR-0011 §Product
   Decisions deliberately **includes** settle-up entries in the CSV export,
   because the export mirrors what the ledger shows. A settle-up is a transfer
   between two members, so counting it as spend would inflate both the group
   total and the user's share, and the two features would disagree about what a
   month "cost".
4. **The host view had no room.** `GroupDetailView.vue` sat at 230 of the 250
   pure-LOC ceiling that [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md)
   sets, and ADR-0021 names this view as one addition away from breaking it.

## Decision

We will compute the monthly totals **on the client**, from the ledger the group
detail response already carries, and render the chart with **plain CSS boxes and
no charting dependency**, with the following binding choices:

1. **No backend change.** No route, handler, service, entity, or query is added.
   `apps/frontend/src/lib/monthlyTotals.ts` is a pure, Vue-free module that folds
   `GroupDetail.expenses[]` into one `{ monthKey, groupCents, userCents }` per
   requested month. The rule that generalises: a **derived read already covered
   by data in hand** is computed client-side; a read that needs data the client
   does not have, or that must stream (ADR-0011), stays on the server.

2. **Integer cents, per [`ADR-0006`](0006-money-ledger-and-balance-math.md).**
   `toCents(v) = Math.round(Number(v) * 100)` — the same discipline as
   `apps/backend/src/services/expenseSplitMath.ts` — and the division by 100
   happens only inside a formatter. `userCents` **sums** every split whose
   `userId` matches rather than taking the first match, so a duplicated
   participant row cannot silently drop cents.

3. **The user segment is the user's share of the splits**, i.e.
   `Σ splits[].computedAmount where userId === currentUserId` — what was spent on
   them, not what they fronted. This is always ≤ the group total, which is what
   makes the stacked bar structurally valid for every possible input. The viewer
   is identified by `group.balance.currentUserId` from the response, computed once
   in the parent view and passed down as a prop per ADR-0021.

4. **Settlements are excluded.** Only `kind === 'EXPENSE'` contributes. This is a
   deliberate divergence from ADR-0011's export, and the reason is that the two
   features answer different questions: the export reproduces the ledger, these
   totals measure spending.

5. **A rolling three-month window that never enters the future.** The window is
   `[anchor-2, anchor-1, anchor]`; `anchor` starts at the current month; the back
   arrow is always live and the forward arrow is disabled once `anchor` is the
   current month. Month keys are `YYYY-MM` strings, which compare correctly with
   `<`, so the bound needs no date parsing. Month arithmetic goes through
   `new Date(year, month - 1 + delta, 1)` — day 1, so a 31-day month cannot
   overflow into the next one.

6. **A "nice axis" of three equal steps.** The step is the smallest value of
   `[1, 2, 2.5, 4, 5, 10] × 10^n` (in cents) that covers `maxCents / 3`; the axis
   top is `step × 3` and the four gridlines are `3·step, 2·step, step, 0`. On the
   design's own figures (a €1,040 peak) this yields a €1,200 axis in €400 steps
   and bars at 54% / 87% / 66%, so the rule is pinned by a unit test rather than
   by a screenshot. When every month is zero the axis falls back to a €100 step
   so the chart still reads as a chart.

7. **Dates via the existing helpers.** Bucketing uses
   `getExpenseDateValue(expense).slice(0, 7)` and every `Date` is built with
   `fromDateValue` (both in `apps/frontend/src/lib/expenseDate.ts`), never
   `new Date('YYYY-MM-DD')`, which parses as UTC midnight and renders a day early
   in negative-offset locales.

8. **Currency stays the EUR constant** of ADR-0011 §5 and
   `docs/specifications.md` §Product Decisions. Three label shapes are needed and
   all three are `Intl` currency formatters in
   `apps/frontend/src/lib/format.ts` beside the existing `formatEur`: the period
   total keeps `formatEur`, bar labels use a new `formatEurWhole` (no decimals),
   and axis ticks use a new `formatEurAxis` (compact notation, lower-cased unit →
   `€1.2k`). Italian symbol placement and separators come from `Intl` for free.

9. **Three components, and an extraction to make room.** The action row of
   `GroupDetailView.vue` moves verbatim into
   `apps/frontend/src/components/group-detail/ActionRow.vue` — its existing
   `<div class="flex gap-2">` becoming the child's single root, per ADR-0021's
   extract-as-is rule — which takes the view to 223 pure LOC and is what makes
   room for the feature. `TotalsModal.vue` owns the sheet chrome, the anchor
   state and the stepper; `MonthlyTotalsChart.vue` owns the axis, bars, month
   labels and period total. The sheet follows the existing teleported
   bottom-sheet idiom of `DateTimePicker.vue`, not `ExportModal.vue`'s in-place
   overlay, because the design is a bottom sheet.

10. **Every icon is a glyph the codebase already ships.** The close X and the
    chevron come from `ExportModal.vue` and `DateTimePicker.vue`; the previous /
    next arrows are that same chevron rotated with `rotate-90` / `-rotate-90`
    rather than new path data.

11. **Tests, per [`ADR-0009`](0009-testing-strategy.md).** Vitest unit tests for
    the pure module and the two formatters; a mounted-component test for the
    modal that pins the design's own figures (€650 / €1,040 / €790 with a
    €210 / €390 / €190 share over an Aug–Oct 2024 window) and the stepper bounds
    in both locales; the existing `GroupDetailView` inline DOM snapshot
    re-recorded, where the action row stays byte-identical apart from the added
    button, which is the proof the extraction was behaviour neutral; and one
    Playwright happy-path e2e against the deployed app.

## Alternatives considered

- **A `GET /api/groups/:id/expenses/totals?from=&to=` aggregation endpoint** —
  Not chosen: the client already holds every expense for the group, so the
  endpoint would re-fetch data in hand and add a round trip per arrow press. It
  would also introduce the first SQL `GROUP BY` in the codebase (nothing uses SQL
  aggregates today) for a chart that reads three numbers off an in-memory array.
  If the group detail response is ever paginated, this becomes the right answer
  and this ADR should be superseded.
- **Reusing the CSV export endpoint and parsing its rows** — Not chosen: it is
  single-month by construction (ADR-0011 §1), streams for size rather than for
  aggregation, and includes settlements, which these totals must exclude.
- **Adding a charting library (Chart.js, ApexCharts, ECharts)** — Not chosen: it
  would be the largest runtime dependency in the frontend, for a static
  three-bar stack with no interaction. It also would not reproduce the design
  without heavy option overrides, and it puts the bar geometry outside the reach
  of a plain unit test. This follows ADR-0011's rejection of a CSV library on the
  same grounds.
- **Hand-rolled inline `<svg>` instead of CSS boxes** — Not chosen: the design's
  bars are rounded rectangles with a border, a clipped inner segment, an inset
  shadow, and centred text labels, all of which are ordinary CSS and awkward SVG.
  Flexbox percentages also keep the chart responsive without a viewBox.
- **Including settlements so the chart matches the CSV export** — Not chosen: see
  §Context force 3. A transfer between members is not spend, and including it
  would make a month with heavy settling look like a month of heavy spending.
- **The user segment as "amount you paid"** — Not chosen: the feature answers
  what a member spent, and the paid amount is already visible per-row in the
  ledger and in the balance card. It is also not bounded by the group total in
  any intuitive way for the reader of a stacked bar.
- **Highlighting one bar, as the source design does** — Not chosen: the design
  emphasises its middle/peak month decoratively, but any rule for which bar gets
  emphasis (peak, middle, current) is arbitrary or misleading once the window
  moves. All three bars render identically.
- **Allowing the window to run into future months** — Not chosen: future months
  are always empty, so forward navigation past the current month only ever
  flattens the chart.
- **Adding the chart inline in `GroupDetailView.vue`** — Not chosen: it would
  break the ADR-0021 ceiling, and the modal plus chart are two nameable
  responsibilities.
- **A calendar-quarter window ("Selected Quarter Total", as the design labels
  it)** — Not chosen: the window is a rolling three months that a user steps one
  month at a time, so it is only a calendar quarter by coincidence. The label is
  "Selected Period Total".

## Sources / Prior art

- `docs/specifications.md` §Features and §Product Decisions — the lines this ADR
  adds for the feature, and the existing single-currency (EUR) decision.
- [`ADR-0006`](0006-money-ledger-and-balance-math.md) — the integer-cent pure
  function discipline every total here follows, and the ledger-as-source-of-truth
  rule that makes a derived client-side view safe.
- [`ADR-0011`](0011-group-expenses-csv-export.md) — the contrasting server-side
  read, the EUR-constant currency, the `Expense.date` calendar-date month-window
  semantics, and the precedent for rejecting a dependency over ~30 lines of pure
  code.
- [`ADR-0017`](0017-category-suggestions-client-side-learning.md) — the existing
  precedent for a pure, deterministic, client-side, group-scoped engine with no
  server role, and for ignoring settle-up entries in a derived view.
- [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md) — the 250 pure
  LOC ceiling, the extract-as-is child-component rule the `ActionRow` split
  follows, and the DOM-snapshot invariance that proves it.
- [`ADR-0018`](0018-internationalization-en-it.md) — both message catalogs carry
  every new string, with `it.ts` type-checked against the English schema.
- [`ADR-0009`](0009-testing-strategy.md) — the unit + deployed-app proof model
  the test plan follows.
- `docs/mockup/totals.png` — the visual reference. Its figures are reproduced
  exactly by the component test, and its measured geometry (a 160px plot,
  gridlines at 0/53/106/159, 48px bars, a 40px axis gutter) was verified against
  the running app.

## Consequences

- Positive: the feature ships with zero backend surface — no route, no query, no
  integration test, no rate-limit or authorization consideration, because the
  data was already fetched and already authorized by `GET /api/groups/:id`.
- Positive: arrow presses are instant and offline-safe; stepping the window is a
  recompute over an in-memory array, not a request.
- Positive: the axis and bar geometry live in a pure function, so the design's
  own numbers are asserted by a unit test instead of a screenshot review.
- Positive: no new runtime dependency, so bundle size and the upgrade surface are
  unchanged.
- Negative / trade-offs: the chart can only ever show months present in the
  already-loaded ledger. Today that is every expense the group has, because the
  group detail response is unpaginated — so **this decision is coupled to that
  response staying unpaginated**. Paginating it would silently truncate the chart
  rather than fail loudly, and would require superseding this ADR with the
  aggregation endpoint rejected above.
- Negative / trade-offs: a very large group ships its whole ledger to the client
  and folds it on every arrow press. That cost already existed for the expense
  list; this feature does not add a fetch, but it does add a fold.
- Negative / trade-offs: "spend" now means something different here than in the
  CSV export (settlements excluded vs included). That is intentional and
  documented, but it is a real inconsistency a reader can trip over.
- Negative / trade-offs: the bar geometry is CSS percentages against a fixed
  180px plot height, so the pixel threshold that decides whether a thin user
  segment keeps its label is duplicated as a constant in the chart component and
  must stay in step with the template's height classes.
- Negative / trade-offs: three months is fixed by the design. A different window
  length is a product change, not a prop.
- Follow-ups: a per-category breakdown of a month's spend (the source design also
  sketches a separate "Charts" action, which this ADR does not implement).
- Follow-ups: a decision on pagination for the group detail expense list, which
  would force the aggregation endpoint rejected here — the trigger to supersede
  this ADR.
- Follow-ups: multi-currency, still blocked on the EUR constant of ADR-0011.
