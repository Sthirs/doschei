# ADR-0027: Bottom-sheet motion and drag-to-dismiss — Carbon productive tokens, hand-written

- **Status:** 🟡 proposed
- **Date:** 2026-09-24
- **Deciders:** Sthirs

## Context

Every modal and picker sheet in the app — `TotalsModal`, `CategoryRecapModal`, `ExportModal`
(mounted by `GroupDetailView.vue`, per ADR-0022/ADR-0026), and the mobile sheets inside
`CategoryPicker.vue`, `UserPicker.vue` and `DateTimePicker.vue` — appeared and disappeared
instantly, with `v-if`/no transition at all. All six are routed overlays (`useRoutedOverlay`,
ADR-0024): closing one is a history pop, and the route then decides whether the sheet renders.
The product ask was to give every one of them a slide-up entrance, a slide-down exit, and a
swipe-down-to-dismiss gesture, all following Carbon Design System's ["productive" motion
principles](https://carbondesignsystem.com/elements/motion/overview/) — without adding
`@carbon/motion` or any other Carbon package, since the CSS involved is simple enough to write by
hand.

Each of the six sheets carried its own copy of the Teleport + scrim + panel markup, with small
per-sheet variations (bottom-sheet-only vs. bottom-sheet-on-mobile/centred-popup-on-desktop,
different panel chrome classes, different close triggers). An exit *animation* specifically needs
the closing content to stay mounted for the duration of a `<Transition>` leave phase — a plain
`v-if` unmounts synchronously and gives a leave transition nothing to animate. Retrofitting that
onto six independent copies would have meant six independent drag/transition implementations to
keep in sync; ADR-0021's 250-pure-LOC ceiling also rules out inlining all of that markup directly
into `GroupDetailView.vue`, `CategoryPicker.vue`, etc.

ADR-0022 §9 and ADR-0026 §10 previously decided Totals and the category recap sheet carry **no**
drag handle, reasoning that "the sheet is not draggable... and a handle would advertise a gesture
that does not exist." This ADR reverses that reasoning for both: the sheet *is* now draggable, so
a handle (and, on wider viewports where the handle is hidden, the header itself) advertising that
gesture is correct. Per `AGENTS.md` §3.4, only a human reviewer can mark ADR-0022/ADR-0026
superseded; this ADR's Consequences section flags that follow-up rather than performing it.

## Decision

We will build one shared component, `apps/frontend/src/components/BottomSheet.vue`, providing the
Teleport/scrim/panel/`role="dialog"` shell, the Carbon-productive enter/exit transition, and
drag-to-dismiss, and migrate all six existing sheets onto it as their only overlay chrome:

- **Motion tokens**, hand-written as plain CSS custom properties in `apps/frontend/src/style.css`
  (a plain `:root` block, not a Tailwind `@theme` block, so Tailwind's tree-shaking can't drop
  them), matching `@carbon/motion` 11.53.0's values:

  | Token | Value | Use |
  | --- | --- | --- |
  | `--ease-entrance-productive` | `cubic-bezier(0, 0, 0.38, 0.9)` | sheet enter, scrim fade-in |
  | `--ease-exit-productive` | `cubic-bezier(0.2, 0, 1, 0.9)` | sheet leave, scrim fade-out |
  | `--ease-standard-productive` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | snap-back after a drag that doesn't dismiss |
  | `--duration-fast-02` | `110ms` | enter and exit |
  | `--duration-fast-01` | `70ms` | snap-back |

  110ms (`fast-02`) is the duration Carbon's own tokens attach to "a subtle entrance or exit of
  small UI elements" — quick enough that the sheet reads as an immediate response to the tap that
  opened or closed it, rather than a deliberate, expressive moment (`slow-01`/`slow-02`, 400-700ms)
  or even the more visually weighty `moderate-02` (240ms) Carbon reserves for "expansion, system
  communication, toast." The snap-back after an aborted drag uses the even shorter `fast-01`
  (70ms, "instant response to user action") with the `standard-productive` easing — distinct from
  the entrance/exit tokens, since it's a corrective micro-interaction rather than the sheet's own
  open/close.

- **`BottomSheet.vue`** takes `open`, `label`, an optional `panelClass` (falls back to the
  Totals/Recap panel chrome), `mobileOnly` (hides the whole sheet at the `sm:` breakpoint, for
  pickers that render a separate desktop popover elsewhere), and `centerOnDesktop` (default
  `true`; `false` for sheets like `DateTimePicker` that stay bottom-anchored at every viewport
  size). It renders a `<Transition name="sheet" :duration="110">` around the scrim+panel, and
  emits `close` on a scrim click or a dismissing drag. `role="dialog"`/`aria-modal`/`aria-label`
  sit on the panel element itself (the scrim is the panel's sibling, not its descendant — tests
  and any future markup must locate the scrim independently, e.g. via `.sheet-scrim`, rather than
  as a descendant of the dialog). The explicit `:duration="110"` is required for two reasons: it
  lets Vue time the leave phase itself without a competing `transitionend` listener (the
  component's own drag-settle logic listens for `transitionend` on an unrelated CSS property, and
  Vue's default nested-transition detection would otherwise race it), and it is what makes the
  leave phase resolve deterministically in Vitest, since `@vue/test-utils` does not stub
  `<Transition>` by default and jsdom/happy-dom never fire a real `transitionend` event.
  `BottomSheet` also renders its own drag handle (hidden at `sm:` and up), matching the handle
  `DateTimePicker.vue` already had before this change.

- **Drag-to-dismiss** (`apps/frontend/src/composables/useSheetDrag.ts`) tracks pointer events
  starting only on a descendant carrying `[data-sheet-drag]` — the handle `BottomSheet` renders,
  plus each caller's own header, so the drag zone is "handle + header," not the full panel (which
  would fight scrollable list content inside the sheet). A drag is applied via the CSS `translate`
  property, kept independent of the `transform` the enter/leave `<Transition>` animates, so a
  dismissing drag can hand off directly into the leave transition from wherever the pointer let
  go, with no jump. The dismiss thresholds are a drag past 30% of the panel's own height **or** a
  release velocity above 0.5px/ms — common thresholds for mobile bottom sheets (e.g. iOS/Material
  sheets) — either one dismisses; otherwise the panel snaps back to rest with the
  `standard-productive`/`fast-01` tokens above. A drag that ends over a button (e.g. the header's
  close icon) swallows the next `click` so it doesn't also fire that button — but only for up to a
  macrotask after release (a `setTimeout(…, 0)` always removes the listener even if no `click`
  ever arrives), since a touch drag past the movement threshold typically fires no trailing
  `click` at all, and an un-timed `once` listener would otherwise sit on `window` waiting to
  swallow whatever the user's next, unrelated tap turned out to be. `dragY` and any in-progress
  settle reset whenever the sheet reopens or the leave transition finishes (`@after-leave`), so
  neither a stale drag offset nor a half-finished settle carries into the next open.

- **Reduced motion:** under `prefers-reduced-motion: reduce`, the panel's enter/exit transitions
  opacity instead of `transform`, so the sheet fades rather than translates. This is unconditional
  — it does not depend on JavaScript detecting the media query — and applies to every sheet built
  on `BottomSheet`, satisfying `docs/specifications.md`'s general accessibility expectations
  without a feature-specific carve-out.

- **Call-site migration:** `TotalsModal.vue`, `CategoryRecapModal.vue` and `ExportModal.vue` lose
  their own Teleport/scrim/panel/`role`/`aria-*` markup and become content-only components (still
  emitting `close`), each gaining a `data-sheet-drag` header. The three are wrapped in a new
  `apps/frontend/src/components/group-detail/GroupDetailSheets.vue`, rendered once by
  `GroupDetailView.vue`, so the three `<BottomSheet><XModal /></BottomSheet>` blocks don't push
  the view over ADR-0021's 250-pure-LOC ceiling; each `XModal` still mounts only while its own
  sheet is open, so its internal state (the totals/recap month window, the export form) still
  resets on every open, unchanged from before this ADR. `CategoryPicker.vue`, `UserPicker.vue` and
  `DateTimePicker.vue`'s mobile sheets are migrated the same way in place, each dropping its own
  hand-drawn handle (`BottomSheet` now renders one) and its own scrim/outside-click plumbing where
  `BottomSheet`'s scrim click now covers it.

- **`SheetHeader.vue`**: a small shared component (`apps/frontend/src/components/SheetHeader.vue`)
  for the `[data-sheet-drag]` header row itself — the drag zone, its padding/border rhythm, and the
  close button — used by all six sheets, so their headers no longer drift from each other in
  padding, close-icon shape, or border color the way the six hand-rolled copies had. It takes a
  `closeLabel` prop, emits `close`, and exposes a default slot for each sheet's own title content
  (a plain heading for five of the six sheets; `DateTimePicker`'s caption-plus-value pair for the
  sixth). Its look matches `DateTimePicker.vue`'s header, the one sheet whose header had not
  drifted. Migrating `ExportModal.vue` onto it also removed that sheet's `-mx-6`/`px-6`
  negative-margin trick (needed only because it was the sole sheet applying padding at the panel
  level rather than per-section): its `panel-class` in `GroupDetailSheets.vue` no longer sets
  outer horizontal/top padding, and its body content is now wrapped in its own `px-5` div, matching
  how the other five sheets already applied section-level padding.

## Alternatives considered

- **`@carbon/motion` as a dependency** — rejected per the explicit product decision: the tokens
  used are three cubic-béziers and two millisecond constants, simple enough to hand-write and keep
  in one place (`style.css`), without taking on a package whose only other exports (layout grid,
  type tokens, etc.) this codebase doesn't use.
- **Per-sheet transitions, no shared component** — rejected: six independent copies of
  scrim/panel/transition/drag logic would have meant six places to keep the easing, duration, and
  dismiss-threshold values consistent, and six places to fix if the drag math had a bug. It would
  also have made the ADR-0021 pure-LOC ceiling harder to respect in `GroupDetailView.vue` and the
  three picker components, which already sit close to the limit.
- **A drag zone covering the whole panel** — rejected: a picker's own list content needs its
  native vertical scroll gesture; restricting the drag zone to `[data-sheet-drag]` (handle +
  header, per the confirmed product decision) keeps the two gestures from fighting each other.
- **CSS `transform: translateY` for the drag offset, same property as the enter/exit transition**
  — rejected: using the same property for both would mean either fighting the `<Transition>`'s own
  `transform` rules during a drag, or needing to toggle the transition on and off per-frame while
  dragging. Using the separate `translate` property for drag offset keeps the two concerns (drag
  position vs. enter/exit animation) independent, and lets a dismissing drag hand off into the
  leave transition from its current position with no jump.

## Sources / Prior art

- [Carbon Design System — Motion overview](https://carbondesignsystem.com/elements/motion/overview/) —
  productive vs. expressive motion, the entrance/exit/standard easing curves, and the duration
  scale (`fast-01`/`fast-02`/`moderate-01`/`moderate-02`, etc.).
- `@carbon/motion` 11.53.0 — the token package's actual `cubic-bezier` and millisecond values were
  read to confirm the hand-written constants match exactly, without adding the package itself as a
  dependency.
- [ADR-0024](0024-browser-back-as-dismiss-and-up-navigation.md) — every sheet migrated here is a
  routed overlay (`useRoutedOverlay`); this ADR's `close` semantics (history pop) are unchanged,
  only the visual transition around them is new.
- [ADR-0021](0021-module-size-ceiling-and-split-convention.md) — the pure-LOC ceiling that shaped
  the `GroupDetailSheets.vue` extraction.
- [ADR-0022](0022-group-monthly-spend-totals.md) §9 and [ADR-0026](0026-group-monthly-category-recap.md)
  §10 — the prior "no drag handle" decisions this ADR reverses for Totals and the category recap
  sheet (see Context and Consequences).
- Common mobile bottom-sheet dismiss heuristics (a height-ratio-of-drag threshold combined with a
  release-velocity threshold), as seen in iOS and Material Design sheet implementations — consulted
  for the 30%-of-panel-height / 0.5px/ms thresholds in `useSheetDrag.ts`, not any specific package.

## Consequences

- Positive: every modal and picker sheet now shares one transition/drag implementation, so any
  future timing, easing, or threshold change is a one-file edit (`BottomSheet.vue` /
  `useSheetDrag.ts`) instead of six. New sheets built later only need to wrap their content in
  `BottomSheet`.
- Positive: `role="dialog"` moving onto the panel itself (rather than an outer wrapper) is more
  precise for assistive tech, since the scrim is decorative, not part of the dialog's accessible
  content tree.
- Negative / trade-offs: `role="dialog"` now sitting on the panel, with the scrim as its sibling
  rather than its descendant, is a breaking change for any existing selector that located the
  scrim as a descendant of the dialog element (several unit and e2e tests needed exactly this
  fix). Any future test or code touching sheet markup must locate the scrim (`.sheet-scrim`)
  independently rather than assuming it nests under the dialog.
- Negative / trade-offs: `BottomSheet`'s `<Transition :duration="110">` keeps a closing sheet
  mounted for a real 110ms after `close` fires (or however long a dismissing drag's handoff takes
  to settle), rather than unmounting synchronously. Tests asserting a sheet's absence after
  closing it must account for that delay (e.g. awaiting the leave duration) if they don't already
  use fake timers.
- Follow-ups: a human reviewer should mark [ADR-0022](0022-group-monthly-spend-totals.md) and
  [ADR-0026](0026-group-monthly-category-recap.md) as superseded by this ADR once accepted, since
  both their "no drag handle" decisions (§9 and §10 respectively) no longer hold — per `AGENTS.md`,
  only a human changes ADR status, so this ADR does not perform that edit itself.
