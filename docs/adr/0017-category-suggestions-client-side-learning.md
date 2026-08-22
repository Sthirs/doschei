# ADR-0017: Category suggestions — client-side, group-scoped learning

- **Status:** 🟢 accepted
- **Date:** 2026-08-22
- **Deciders:** Sthirs

## Context

The specification now requires two related behaviours when creating or editing an
expense: users can **search categories by name** inside the category picker, and if
no category has been selected yet the application **auto-selects the category whose
past descriptions in the same group best match the entered description**
(`docs/specifications.md` §Features; the accompanying Product Decisions bullet
states suggestions are "computed entirely client-side").

The architectural question underneath: **where does categorization intelligence
live?** Two facts shaped the answer:

1. The client already holds the complete learning corpus. `GET /api/groups/:id`
   returns every expense of the group including `description` and `category`
   (`groupService.serializeExpense`), and the routed expense form holds that
   payload in memory at mount (the `sharedGroup` ref, or its fallback fetch).
2. The server has no suggestion surface today, and none is required to satisfy
   the spec — any backend involvement would be additive API surface chosen for
   placement reasons, not data reasons.

Additional forces: the repo's established preference for pure, deterministic,
unit-testable functions (ADR-0006); the testing strategy's demand for
deterministic vectors plus browser-level proof (ADR-0009); and privacy —
expense descriptions are already visible to every member of their group, and the
decision must not create new flows that move them across group boundaries.

Shipped on branch `category-auto-select`: engine `apps/frontend/src/lib/categorySuggest.ts`
(commit `fcd1a84`), searchable picker `CategoryPicker.vue` (`0eae5cf`), guarded
wiring in `ExpenseFormView.vue` (`36b2e76`), end-to-end coverage
(`tests/e2e/expense-category-suggest.spec.ts`, commit `5092e3d`).

## Decision

We will compute expense category suggestions **entirely client-side**, learning
only from the current group's ledger that the frontend already holds; the server
has no suggestion role — no endpoint, no aggregation job, no storage beyond the
existing expense rows, and nothing learned across groups.

Mechanics of the decision:

- The engine (`lib/categorySuggest.ts`) is a pure, deterministic, three-stage
  matcher over `{description, category}` pairs: Stage 1 exact normalized-description
  match returning the dominant category at ≥ 60% share with strict dominance;
  Stage 2 token-overlap scoring (Jaccard × query-token recall) requiring an
  absolute minimum score and dominance over the runner-up; Stage 3
  (taxonomy-name fallback): when Stages 1–2 yield no qualifying candidate,
  rank every non-generic category label (`Other` and `General` excluded as
  ambiguous) by how completely its words appear in the entered description —
  full-name matches first, partial ones (e.g. `gas` → Gas/Fuel, `dining` →
  Dining Out) ranked by coverage ratio, ties broken deterministically by key.
  All thresholds are exported constants, tunable without architectural change.
- Settlement entries and unknown category keys are excluded from the corpus.
- Suggestions apply silently and only fill the still-default slot
  (`DEFAULT_CATEGORY_KEY`) while the user has not picked a category themselves;
  loading an existing expense never triggers a suggestion. (Behavioural guards are
  specified in `docs/specifications.md`; this ADR fixes *where* the computation runs.)

## Alternatives considered

- **Backend suggestion endpoint** (e.g. `GET /api/groups/:id/suggest-category`) —
  not chosen for v1: it adds API surface, auth scoping, and integration-test
  burden while offering zero data advantage, since the client already possesses
  the entire group corpus. Becomes interesting only if ranking must weigh data
  the client cannot see (e.g., global priors).
- **Cross-group personal learning** (aggregate a user's expenses across all their
  groups so habits travel, e.g. "Lidl" → Groceries everywhere) — not chosen: it
  requires a cross-membership aggregation API, introduces product/privacy
  questions about descriptions flowing between groups, and its cold-start benefit
  is marginal relative to that complexity.
- **ML/embedding-based classification** — not chosen: non-deterministic, adds
  heavy dependencies or an inference service, produces opaque failure modes, and
  is untestable against fixed thresholds for corpora of this scale (tens to
  thousands of rows). Contradicts the pure-function ethos of ADR-0006.

## Sources / Prior art

- `docs/specifications.md` §Features (category-search bullet; description-driven
  auto-selection bullet) and §Product Decisions (client-side computation bullet) —
  introduced by commit `f177b1f`.
- `apps/frontend/src/lib/categorySuggest.ts`, `apps/frontend/src/components/CategoryPicker.vue`,
  `apps/frontend/src/views/ExpenseFormView.vue` and their tests — the realised decision.
- ADR-0006 (money/ledger math as integer-cent pure functions) — the repo's
  determinism-first convention this engine follows.
- ADR-0012 (routed pages instead of modals) — precedent that frontend
  interaction-architecture decisions are recorded as ADRs here.
- ADR-0009 (testing strategy) — mandated the unit-vector + deployed-e2e proof
  used to validate the matcher.
- Comparable expense trackers (Splitwise-style tools) commonly auto-categorize
  from description/merchant text using transparent heuristics rather than models
  at small scale — the general pattern this decision aligns with.

## Consequences

- Positive: zero backend/API/schema surface; suggestions are deterministic and
  fully covered by unit vectors; nothing user-visible leaves the group context
  the viewer already has; suggestions are instant (no round-trip).
- Negative / trade-offs: each new group starts with no learned history until
  members categorize expenses; matching quality is bounded by substring/token
  heuristics (no semantic understanding — searching "dinner" will not find
  "Dining Out"); all members of a group get identical suggestions (no
  personalization); thresholds may need tuning against real usage; partial
  name matching can mis-fire on coincidental word overlaps (e.g. `out`);
  impact is bounded because suggestions only fill the still-default slot and
  never override a manual pick.
- Follow-ups: a future cross-group or server-side ranking capability must
  **supersede** this ADR (never edit it); threshold tuning is expected to happen
  in the exported constants first, and only escalate to an architecture change if
  the heuristic ceiling is genuinely hit.
