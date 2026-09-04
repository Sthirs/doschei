# ADR-0021: Module size ceiling of 250 pure LOC and the responsibility-split convention

- **Status:** 🟢 accepted
- **Date:** 2026-08-31
- **Deciders:** Sthirs

## Context

A repository-wide slop-removal pass measured every in-scope source file
(`apps/backend/src/**/*.ts` plus `apps/frontend/src/**/*.{ts,vue}`, 68 files) and
found 12 of them above 250 lines of code once blanks and comments were excluded.
The worst offenders were `groupService.ts` (692), `ExpenseFormView.vue` (714),
`GroupDetailView.vue` (691), and `groupController.ts` (450).

Several forces made this worth deciding rather than leaving to taste:

1. **Measurement was not agreed.** Advisory line counts circulating before the
   pass came from whole-file `awk` counts. For `.vue` files those numbers were
   wrong by 6 to 25 lines, and for `GroupsView.vue` a naive "stop at the first
   `</template>`" extraction undercounted the template block by 57 lines because
   the file nests `<template v-else>` inside the SFC template. Without one
   canonical measurement, "is this file too big" had no answer.
2. **Layering had to survive the splits.** [`ADR-0003`](0003-backend-stack.md)
   fixes a routes/controllers/services/entities layering with a REST surface that
   callers depend on. Any split of a controller or a service has to keep that
   layering and keep every import specifier that routes, tests, and other
   services already use.
3. **Behaviour was pinned by tests that could not be edited.** Characterization
   suites written earlier in the same pass pin the money and ledger arithmetic of
   [`ADR-0006`](0006-money-ledger-and-balance-math.md), the client-side category
   suggestion call site of
   [`ADR-0017`](0017-category-suggestions-client-side-learning.md), and
   controller status-code discrimination. Splits had to be provably behaviour
   neutral, not merely plausible.
4. **Two files could not be split at all.** The i18n catalogs named by
   [`ADR-0018`](0018-internationalization-en-it.md) sit just above the ceiling
   and have no responsibilities to separate.

## Decision

We will hold every source file under `apps/backend/src` and `apps/frontend/src`
to a ceiling of **250 pure LOC**, measured only by
[`scripts/pure-loc.mjs`](../../scripts/pure-loc.mjs), and we will bring a file
back under the ceiling by splitting it along responsibility lines behind a
zero-logic re-export barrel, never by deleting behaviour and never by splitting
on line count.

### Measurement

Pure LOC is the number of non-blank lines remaining after comment removal,
summed across all top-level SFC blocks. `scripts/pure-loc.mjs` is the only
authority:

- `.ts` files: `//` and `/* */` comments are stripped by a character-level state
  machine that is aware of single-quoted, double-quoted, and nested template
  literals, including brace depth inside `${...}` interpolations, so a comment
  marker inside a string is never treated as a comment. Newlines inside block
  comments are preserved as blank lines so counting stays stable.
- `.vue` files: blocks are located with `@vue/compiler-sfc`'s `parse()`, never a
  regex. `<script>` and `<script setup>` use the TypeScript rules above,
  `<template>` strips `<!-- -->`, `<style>` strips CSS comments. Template and
  style lines **do** count toward the ceiling.

Measure **after** running Prettier. Prettier's 80-column wrapping inflated pure
LOC repeatedly during this pass: `expenseHandlers.ts` was roughly 150 lines
unformatted and 199 formatted, and `GroupDetailView.vue` went from 210 to 230
once its multi-attribute child tags were reflowed. A file measured before
formatting can cross the ceiling the moment the formatter runs.

### Naming

New files are named for the single responsibility they own. `utils.ts`,
`helpers.ts`, `common.ts`, and numbered part files such as `foo_1.ts` are
banned. The directories created in this pass are the reference examples:

- `apps/backend/src/services/group/`: `groupRepositories.ts`,
  `groupSerialization.ts`, `balanceComputation.ts`, `groupMembership.ts`,
  `groupCrud.ts`, `expenseCrud.ts`, `settlementCrud.ts`, `expensesCsvExport.ts`,
  `groupService.ts`.
- `apps/backend/src/controllers/group/`: `groupServiceInstance.ts`,
  `expenseValidation.ts`, `groupHandlers.ts`, `memberHandlers.ts`,
  `expenseHandlers.ts`, `settlementHandlers.ts`, `invitationHandlers.ts`,
  `expenseExportHandlers.ts`, `groupImageHandlers.ts`.
- `apps/backend/src/services/seed/`: `seedData.ts` (declarative constants) and
  `seedExecution.ts` (the `seedDatabase()` function).
- `apps/frontend/src/components/expense-form/`: `AmountField.vue`,
  `DescriptionRow.vue`, `PaidBySection.vue`, `SplitWithSection.vue`,
  `SplitDetails.vue`, `SplitModeTabs.vue`, `SplitPercentRows.vue`,
  `SplitFixedRows.vue`, `DeleteConfirmPanel.vue`, `FormFooter.vue`.
- `apps/frontend/src/components/group-detail/`: `ExportModal.vue`,
  `BalanceCard.vue`, `ExpenseRow.vue`, `TopbarSettingsButtons.vue`,
  `TopbarBackButton.vue`.

A single shared value gets its own named module rather than a grab bag:
`groupServiceInstance.ts` exists solely so that the one `new GroupService()`
stays one construction, and `grep -rn "new GroupService()" apps/backend/src`
still returns exactly one match.

### Re-export barrels

The original file path stays alive as a barrel that contains re-exports and
nothing else. No logic, no instantiation, no re-wrapping. `groupService.ts`,
`groupController.ts`, and `seedService.ts` are all barrels now, which is why
`groupRoutes.ts` was never edited, why `vi.mock('../src/db/data-source')` in the
existing tests still lands, and why zero test files changed across the whole
split arc.

The barrel is load bearing, not decoration. Renaming the `groupService.ts`
barrel export to a typo took the backend typecheck from 2 pre-existing errors to
14, naming the barrel plus three dependents.

### Vue SFCs: SCRIPT-ONLY versus DOM-RESTRUCTURING

Because `<template>` lines count, the script budget of an SFC is fixed before a
line is written: `budget = 249 - templatePureLoc`. That arithmetic decides the
technique.

**SCRIPT-ONLY.** When the template alone fits under the ceiling, extract
composables and leave the template byte-identical. Used for `SettleUpView.vue`
(365 to 218), `GroupsView.vue` (361 to 249), `GroupSettingsPanel.vue` (327 to
241), `CategoryPicker.vue` (287 to 225), and `AccountView.vue` (264 to 218).
Two constraints follow from a frozen template: every name the template
references must remain a top-level `<script setup>` binding, so a wide
destructure is mandatory, and template `ref="..."` bindings survive a
destructure but fail silently when they do not, so they need a characterization
test first.

**DOM-RESTRUCTURING.** When the template alone exceeds the ceiling, no amount of
composable extraction is enough and child components are required. Used for
`ExpenseFormView.vue` (714, template 445, down to 137) and `GroupDetailView.vue`
(691, template 543, down to 230). `GroupsView.vue` is a borderline case: its
real template is 236 pure LOC, so the composable split reached 249 with one line
of headroom and the durable fix is a future child-component extraction.

### Extract as is

Child extraction is done verbatim:

- Copy the template region unchanged. No new wrapper elements, no class changes.
- Each region's existing root element becomes the child's **single** root. A
  single-root child with no extra attributes renders identical `outerHTML`.
- Leave rendered HTML comments in the parent, immediately before the child tag.
  Moving a comment into the child makes it multi-root, which changes attribute
  fallthrough and is the one thing that breaks byte identity.
- When a region is naturally multi-root, look one level up for a single-vnode
  wrapper that already exists, such as a `<Teleport>`, `<Transition>`, or
  `<section>`, rather than inventing a `<div>`.
- Compute shared values once in the parent and pass the result down, rather than
  re-instantiating a store per child.

Held to this discipline, both DOM-restructuring splits produced **byte-identical
DOM**: the pre-existing inline DOM snapshots passed unedited, and no snapshot
update commit was needed for either view. When a child must write shared
reactive state, use a typed `provide`/`inject` rather than a prop, because a
prop trips `vue/no-mutating-props` and every workaround is lint-rule evasion.

### The i18n catalog exemption

`apps/frontend/src/i18n/en.ts` (285) and `apps/frontend/src/i18n/it.ts` (286) are
**exempt** from the ceiling. [`ADR-0018`](0018-internationalization-en-it.md)
names exactly these two paths as the statically imported message catalogs, with
Italian type-checked against the English schema via `satisfies MessageSchema`.
They are declarative data with a single responsibility, so there is nothing to
separate: any split would be a split by line count, which this ADR bans. Their
values are observable behaviour, asserted through i18n keys rather than English
literals per [`ADR-0017`](0017-category-suggestions-client-side-learning.md)'s
ethos of keeping engines pure and pushing strings to the caller, so editing them
to save lines would be a product change, not a refactor. They are the only
permitted exemption; a new exemption requires a new ADR.

## Alternatives considered

- **A repo-wide `max-lines` ESLint rule.** Rejected: ESLint's counter does not
  understand SFC blocks, so `.vue` files would be counted wrongly in exactly the
  way that produced the bad advisory numbers, and a lint error offers no place to
  record the i18n exemption and its grounds.
- **A soft guideline with no number.** Rejected: the pass began with a soft
  guideline and produced a 714-line view. A number that a script can check is
  what makes the rule enforceable in review.
- **Splitting by line count into numbered part files.** Rejected: it satisfies
  the measurement while making the code harder to navigate, and it destroys the
  property that made these splits safe, namely that each new module owns one
  nameable concept.
- **Changing import specifiers at every call site instead of a barrel.**
  Rejected: it would have forced edits to `groupRoutes.ts` and to the
  characterization test files whose unchanged state is the proof that the splits
  were behaviour neutral.
- **Raising the ceiling to accommodate the i18n catalogs.** Rejected: the
  catalogs are the exception, not the rule, and raising the number for two
  declarative data files would licence a 300-line controller.

## Sources / Prior art

- [`ADR-0003`](0003-backend-stack.md): the routes/controllers/services layering
  every backend split preserved, and the REST surface the barrels kept intact.
- [`ADR-0018`](0018-internationalization-en-it.md) lines 49 to 55: names
  `apps/frontend/src/i18n/en.ts` and `it.ts` as exactly two statically imported
  catalogs, which is the grounds for the exemption above.
- [`ADR-0017`](0017-category-suggestions-client-side-learning.md): the pure,
  deterministic engine ethos, and the `suggestCategory` call-site timing that
  the `ExpenseFormView` split had to preserve verbatim.
- [`ADR-0006`](0006-money-ledger-and-balance-math.md): the integer-cent split
  and balance arithmetic that the `groupService` split ran through unmocked, so
  a mutation to the remainder allocation still turns the characterization tests
  red.
- [`ADR-0009`](0009-testing-strategy.md): the unit plus deployed-browser proof
  model that the cluster-verified SFC splits followed.
- Empirical basis: a 25-step slop-removal pass over the 68 in-scope files.
  Behaviour was locked first with characterization tests and inline DOM
  snapshots, then each split was verified with `scripts/pure-loc.mjs`, the local
  gate set, and, for the two DOM-restructuring views, targeted Playwright specs
  run against a live Minikube deployment whose pod bytes were compared to the
  built image.

## Consequences

- Positive: file size has one canonical answer that a script produces, so
  "too big" stops being a matter of taste in review.
- Positive: the barrel convention means a split is invisible to callers, which
  is what allowed every split in this pass to land with zero test edits.
- Positive: extract-as-is turns the existing DOM snapshots into an exact,
  free regression proof instead of a diff to rubber stamp.
- Negative: the ceiling counts template and style lines, so a template-heavy SFC
  has a small script budget and may need child components for what feels like a
  small change. `GroupsView.vue` (249) and `GroupDetailView.vue` (230) are both
  close enough that the next section added to either re-breaks the ceiling.
- Negative: measuring after Prettier means a file can be compliant while being
  written and non-compliant once formatted, so the check belongs at the end of
  the change, not the start.
- Negative: the exemption list is a standing invitation to grow. It is capped at
  the two i18n catalogs on purpose, and widening it needs a new ADR.
- Note on ADR immutability: `ADR-0009` still describes Cypress as part of the
  testing stack, although the Cypress installation was removed during this pass.
  Per `AGENTS.md` §3 and the process in [`README.md`](README.md), an accepted ADR
  is never edited, so that text stays as historical record and is corrected only
  by a future ADR that supersedes it. This ADR does not do so.
- Follow-ups: a durable child-component extraction for `GroupsView.vue`'s
  invitations section, which the composable split could only defer; and a
  decision on whether the ceiling should be enforced automatically in CI rather
  than by review, which would need its own ADR.
