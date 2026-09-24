# ADR-0026: Group monthly category recap — family-level, client-side, sharing ADR-0022's rules

- **Status:** 🟢 accepted
- **Date:** 2026-09-24
- **Deciders:** Sthirs

## Context

[`ADR-0022`](0022-group-monthly-spend-totals.md) added a Totals sheet that answers "how much did
this group spend, and how much was mine" for three months at a time, and named "a per-category
breakdown of a month's spend" as a follow-up (§Consequences). The design mockup for that follow-up
specifies a **"Category details"** bottom sheet listing one row per **category family** — colour
dot, family name, percentage of the month, amount — each with a proportional progress bar, a
footer with the month's total, expense count, and the viewer's own share, and a one-month stepper
identical in chrome to the Totals sheet's three-month stepper.

Three forces carry over unchanged from ADR-0022:

1. **The data is already on the client**, in the same `GroupDetail.expenses[]` this ADR's
   predecessor already folds. No new endpoint, query, or backend change is needed for the same
   reason ADR-0022 gave: this is a derived read over data already in hand.
2. **"Spend" must mean the same thing everywhere it's shown.** ADR-0022 excludes settle-up entries
   because a settlement is a transfer between members, not spend. A category recap that included
   them would disagree with the Totals sheet about the same month's number, which is confusing in a
   single screen's two panels.
3. **The design reuses the Totals sheet's chrome almost verbatim** — same scrim, same bottom-sheet/
   centred-popup responsive rule, same stepper look — so the only genuinely new surface is the list
   of family rows and the footer.

One force is new to this feature:

1. **`Expense.category` is a leaf key** (`docs/specifications.md` §Features; `apps/frontend/src/lib/
   categories.ts`), not a family. Rendering "one row per category actually used" would mean up to 39
   rows for a busy month, which does not match the seven-row design and would make the sheet a
   scroll-heavy list rather than a recap. The design groups by **family**
   (`CategoryDefinition.family`, one of the seven `CategoryFamily` values already used to colour
   every category icon in `CategoryPicker.vue` and `ExpenseRow.vue`).

## Decision

We will add a **Categories** action next to Totals and Export in the group-detail action row that
opens a **category recap** bottom sheet, computed client-side, grouped by category family, for one
month at a time. Binding choices:

1. **No backend change**, for the same reason as ADR-0022 §1. `apps/frontend/src/lib/
   categoryRecap.ts` is a pure, Vue-free module — `monthKeyOf`, `shiftMonthKey`, and `toCents` are
   imported from `apps/frontend/src/lib/monthlyTotals.ts` rather than re-implemented, and
   `toCents` is exported from there for that reuse.

2. **Grouped by family, not by leaf category.** `getCategory(expense.category).family` assigns each
   expense to one of the seven families in `CATEGORY_FAMILY_COLORS`. `getCategory`'s existing
   fallback to `general` (Uncategorized) means an expense with an unrecognized or missing category
   key is counted under Uncategorized rather than dropped or crashing the aggregation — the same
   defensive default the category picker already relies on.

3. **All seven families are always shown, including at €0.** The design's own figures cover seven of
   the seven families with nonzero spend, so it does not settle whether an unused family is hidden
   or shown at zero; we show it. A recap that silently drops a family a member expected to see (e.g.
   "did we really spend nothing on Home this month?") is a worse experience than seven rows where
   several read "€0.00 · 0.0%", and it keeps the row set — and therefore the sheet's height — stable
   as a user steps between months, rather than reflowing every time a family's spend crosses zero.

4. **Integer-cent aggregation, per [`ADR-0006`](0006-money-ledger-and-balance-math.md) and ADR-0022
   §2.** `userCents` sums every split whose `userId` matches, not a `find`, for the same
   duplicated-participant-row reason ADR-0022 gives.

5. **Percentages are integer tenths of a percent** (`shareTenths = Math.round(cents * 1000 /
   totalCents)`, or `0` for every row when `totalCents` is `0`), never a float division formatted at
   render time. This keeps the percentage a pure, testable integer alongside the cents it is derived
   from, the same discipline ADR-0022 applies to its axis geometry. A new formatter,
   `formatPercentTenths` in `apps/frontend/src/lib/format.ts`, renders it via `Intl.NumberFormat`
   (`style: 'percent'`, one fraction digit), so Italian output uses `,` and a narrow space (`38,8 %`)
   for free, matching how `formatEur` already delegates locale punctuation to `Intl`.

6. **Rows always render in the fixed family order already used by `CATEGORIES_GROUPED`**
   (`food-and-drink, transportation, home, life, utilities, entertainment, uncategorized`) — the same
   order the category picker renders its groups in — rather than being re-sorted by amount each
   month. A family's row therefore stays in the same position from one month to the next, so a
   member scanning the sheet across months doesn't have to re-find where a given family landed; only
   its amount, percentage and bar change.

7. **Settle-up entries are excluded**, matching ADR-0022 §4 and for the same reason (§Context force
   2 above): a settlement is a transfer, not a purchase, and the recap must not disagree with the
   Totals sheet's number for the same month.

8. **One month, not three.** The design's own stepper moves a single month, unlike the Totals
   window. The rule that bounds it is unchanged from ADR-0022 §5: the anchor starts at the current
   month, the back arrow is always live, and the forward arrow disables once the anchor **is** the
   current month, so the recap — like Totals — never shows a future month.

9. **The period stepper is extracted and shared**, rather than duplicated. The `<div>` that is
   `TotalsModal.vue`'s period selector moves, as-is, into `apps/frontend/src/components/group-detail/
   PeriodStepper.vue` (label, forward/back handlers and disabled state as props/emits), per
   [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md)'s extract-as-is rule.
   `TotalsModal.vue`'s rendered DOM must stay byte-identical after the extraction — proved by its
   existing component test and e2e spec passing unchanged — before `CategoryRecapModal.vue` is
   written against the same component.

10. **The mockup is followed for layout and adapted for four things already fixed elsewhere in this
    codebase or decided otherwise for this feature:**
    - **Currency is EUR, not the mockup's USD figures** (`docs/specifications.md` §Product
      Decisions; ADR-0011 §5): `formatEur` throughout, not a literal `$`.
    - **Family colours are `CATEGORY_FAMILY_COLORS`** (`apps/frontend/src/lib/categories.ts`), not
      the mockup's own swatches. Those colours already tint every category icon and chip in
      `CategoryPicker.vue` and `ExpenseRow.vue`; using a second palette here would mean the same
      family reads as two different colours in the same app.
    - **No drag handle**, matching ADR-0022 §9's reasoning verbatim: the sheet is not draggable, and
      a handle would advertise a gesture that does not exist. (The design's own handle is present on
      every screen in its component library, including screens, like Totals, that ship without one
      today.)
    - **Rows do not re-sort by amount**, unlike the mockup's single (descending) snapshot — see
      §Decision item 6.

11. **Tests, per [`ADR-0009`](0009-testing-strategy.md).** Vitest unit tests for `categoryRecap.ts`
    (the design's own seven-family figures, settle-up exclusion, month-boundary exclusion, the
    unknown-category fallback, the fixed family order holding even when a later family has more
    spend than an earlier one, and the all-zero month) and for `formatPercentTenths`; a
    mounted-component test for the modal pinning the design's figures in both locales and the
    stepper bounds; the existing `TotalsModal` test and e2e spec re-run unchanged as the extraction's
    regression proof; and one Playwright happy-path e2e.

## Alternatives considered

- **Grouping by leaf category instead of family** — Not chosen: see §Context force 4. It does not
  match the design (which has exactly seven rows, one per family) and does not bound the sheet's
  height as a group's category usage grows.
- **Hiding zero-spend families** — Not chosen: see §Decision item 3. A `v-if` per row is one line
  either way; the choice is a product one, not an implementation cost.
- **Sorting rows by amount descending, matching the mockup's single snapshot** — Not chosen: see
  §Decision item 6. A fixed order keeps each family's row in the same position every month, which
  matters more once a member is stepping back and forth than matching the mockup's one-month
  screenshot exactly.
- **A `GET /api/groups/:id/expenses/category-recap?month=` endpoint** — Not chosen, for the same
  reason ADR-0022 rejected an equivalent totals endpoint: the client already holds the full ledger,
  so the endpoint would re-fetch data already in hand and add a round trip per stepper press. If
  `GET /api/groups/:id` is ever paginated, both this ADR and ADR-0022 need superseding together.
- **Reusing `MonthlyTotalsChart.vue`'s stacked-bar visual instead of a percentage-bar list** — Not
  chosen: the design is a list of proportional bars, one per family, which is a different shape from
  a stacked bar per month. Forcing the existing chart component to also render this would couple two
  unrelated visual specs behind one prop surface.
- **A float percentage (`(cents / totalCents) * 100`) formatted at render time** — Not chosen, for
  the same reason ADR-0022 keeps its axis math in integer cents: the percentage becomes something a
  unit test can pin exactly, and rounding happens once, in the aggregation, not once per formatter
  call.
- **Keeping the design's own USD figures and swatch palette** — Not chosen: both are already fixed
  by earlier, binding decisions (EUR: ADR-0011 §5 and the spec; family colours: `categories.ts`,
  already the single source used everywhere else a family is coloured).

## Sources / Prior art

- `docs/specifications.md` §Features and §Product Decisions — the lines this ADR adds, and the
  existing single-currency (EUR) and stable-category-key decisions.
- [`ADR-0006`](0006-money-ledger-and-balance-math.md) — the integer-cent discipline this ADR's
  percentages and totals follow.
- [`ADR-0009`](0009-testing-strategy.md) — the unit + deployed-app proof model the test plan follows.
- [`ADR-0011`](0011-group-expenses-csv-export.md) — the EUR currency constant, and the
  settle-up-inclusion decision this ADR deliberately diverges from (§Decision item 7).
- [`ADR-0017`](0017-category-suggestions-client-side-learning.md) — `apps/frontend/src/lib/
  categories.ts`'s `CategoryDefinition.family` and `CATEGORY_FAMILY_COLORS`, reused here rather than
  duplicated, and the precedent for a pure, client-side, group-scoped, settle-up-ignoring engine.
- [`ADR-0018`](0018-internationalization-en-it.md) — both message catalogs carry every new string;
  `formatPercentTenths` delegates locale punctuation to `Intl`, as `formatEur` already does.
- [`ADR-0021`](0021-module-size-ceiling-and-split-convention.md) — the 250 pure-LOC ceiling, and the
  extract-as-is rule the `PeriodStepper` split follows.
- [`ADR-0022`](0022-group-monthly-spend-totals.md) — this ADR's direct predecessor: the client-side
  aggregation rule, the settle-up exclusion, the "own share = split total, not amount paid" rule, the
  never-future-month rule, and the follow-up this ADR closes.
- [`ADR-0024`](0024-browser-back-as-dismiss-and-up-navigation.md) — `useRoutedOverlay`, reused
  unchanged for the `?overlay=categories` sheet, the same way Totals and Export already use it.
- The "Group Detail (Category Recap)" design mockup — the visual reference for row layout, the
  footer, and the stepper; its figures (Home $186.20/38.8%, Food & Drink $154.00/32.1%,
  Entertainment $48.00/10.0%, Transportation $34.80/7.3%, Life $28.50/5.9%, Utilities $16.00/3.3%,
  Uncategorized $12.50/2.6%; total $480.00, 8 expenses, own share $186.40) are reproduced exactly
  (in EUR) by the component test.

## Consequences

- Positive: zero backend surface, for the same reasons ADR-0022 lists — no route, query,
  integration test, or authorization concern beyond what `GET /api/groups/:id` already covers.
- Positive: the family-order and colour constants are shared with the category picker and expense
  list, so a future family addition or recolour updates every surface at once.
- Positive: extracting `PeriodStepper.vue` removes duplication that would otherwise exist between
  this sheet and Totals from day one, and is proven behaviour-neutral by `TotalsModal`'s existing
  tests passing unchanged.
- Negative / trade-offs: same ledger-in-memory coupling as ADR-0022 — this feature is not usable
  once `GET /api/groups/:id` is paginated, without superseding both ADRs together.
- Negative / trade-offs: a family with real spend that rounds to `0.0%` (e.g. one cent against a
  large total) is visually indistinguishable from a family with genuinely no spend, since both show
  `€0.0x` amounts at a near-zero bar width. This is judged acceptable because the amount column,
  unlike the percentage, is never rounded away.
- Negative / trade-offs: showing all seven families regardless of spend means the sheet is the same
  height for an active month and a nearly-empty one, which is intentional (§Decision item 3) but
  does mean a very quiet month still renders seven rows.
- Follow-ups: a leaf-category (not just family) drill-down, if a family row is ever made
  interactive — not part of this ADR.
- Follow-ups: multi-currency, still blocked on the EUR constant of ADR-0011, same as ADR-0022.
