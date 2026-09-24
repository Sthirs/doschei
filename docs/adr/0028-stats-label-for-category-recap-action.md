# ADR-0028: "Stats" as the label of the category recap action

- **Status:** 🟢 accepted
- **Date:** 2026-09-24
- **Deciders:** Sthirs

## Context

[`ADR-0026`](0026-group-monthly-category-recap.md) §Decision opens with "We will add a
**Categories** action next to Totals and Export in the group-detail action row that opens a
**category recap** bottom sheet". The label is therefore part of an accepted, binding decision,
and changing it cannot be done in code alone (`AGENTS.md` §2).

The product owner asked for the action to read **Stats** instead. "Categories" reads as an entry
point to the category list itself (the same word the category picker uses for what it lets you
browse and search), while the sheet it opens is a monthly spend breakdown — a statistic about the
group, not a place to manage categories.

## Decision

We label the group-detail action that opens the category recap sheet **"Stats"** (EN) /
**"Statistiche"** (IT), via the `groupDetail.stats` message key, replacing the former
`groupDetail.categories` key. This supersedes ADR-0026 **only** in the name of that action; every
numbered item of ADR-0026's §Decision stays in force unchanged, including the sheet's own title
("Category details"), the `?overlay=categories` route query, and all the
aggregation rules.

## Alternatives considered

- **Keep "Categories"** — Not chosen: see §Context; the label suggests category management rather
  than the spend breakdown the sheet actually shows.
- **Also rename the sheet title and the `?overlay=categories` query value to "stats"** — Not
  chosen: the sheet really is a per-category breakdown, so its title stays accurate; and the
  overlay id is a URL a user may have in their history (ADR-0024), so renaming it would break Back
  navigation into it for no user-visible gain.
- **Fully supersede ADR-0026 with a restated copy** — Not chosen: it would duplicate eleven
  decisions to change one word, and a superseded ADR-0026 would read as no longer binding for the
  aggregation rules that have not changed.

## Sources / Prior art

- [`ADR-0026`](0026-group-monthly-category-recap.md) §Decision — the label this ADR changes.
- [`ADR-0018`](0018-internationalization-en-it.md) — both catalogs carry the new key.
- [`ADR-0024`](0024-browser-back-as-dismiss-and-up-navigation.md) — why the overlay id is kept.
- `AGENTS.md` §2–§3 — a change to an accepted ADR's decision goes through a new ADR.
- None external — a naming decision, trivially reversible.

## Consequences

- Positive: the action row describes what the sheet shows, not the taxonomy it groups by.
- Negative / trade-offs: the action's label ("Stats") and the sheet's title ("Category details")
  now differ, so the button no longer names the sheet it opens word-for-word.
- Negative / trade-offs: ADR-0026 stays `accepted` but is partly overridden by this ADR, so a
  reader of ADR-0026 must also consult this one for the action's name.
- Follow-ups: if more statistics sheets are added behind the same action, the sheet title and
  overlay id may need revisiting in a follow-up ADR.
