# ADR-0011: Group expenses CSV export — streaming, per-expense net, single-month

- **Status:** 🟡 proposed
- **Date:** 2026-08-02
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Features line 82) requires that
"Group expenses can be exported as a CSV file," and §Product Decisions line 93
requires that "CSV export must include both regular expenses and settle-up
entries that are currently visible in the group ledger." As of the 2026-08-01
audit (`docs/specifications.md` lines 246-252) this feature is **not
implemented** — no CSV generation code, no export route, no export UI.

The request that triggered this ADR also imposed concrete operational
requirements that are not in the spec:

- The CSV column shape: `date, description, category, expense, currency`, plus
  one column per group member (by name) holding "the amount they paid or they
  will receive (positive or negative)."
- The user selects a single month to export in the UI.
- The backend must extract data from the database in chunks of at most
  10 000 rows and write CSV rows line-by-line directly into the HTTP response
  after the headers — no buffering the whole CSV in RAM, no physical file on
  the server.
- The downloaded filename must be `<group name>-<date of now>`.

Three open design questions needed an architectural decision before
implementation:

1. **Per-person column semantics** — per-row net vs running cumulative balance
   per member up to that row.
2. **Streaming transport** — buffer-then-send vs chunked streaming with no
   `Content-Length`; and how to keep large exports out of RAM and off disk.
3. **Filename encoding** for non-ASCII group names and the bytes-after-headers
   contract the streaming imposes.

Constraints from accepted ADRs:

- ADR-0006: money math runs in integer cents via pure functions; balances are
  derived from the ledger; settle-up is a `kind='SETTLEMENT'` expense entry.
- ADR-0009: integration tests target the deployed backend (no in-process
  server); Playwright targets the deployed app (no `webServer`); every
  user-facing feature gets ≥1 Playwright happy-path e2e.

## Decision

We will implement group expenses CSV export as a single streaming endpoint plus
a single UI control, with the following binding choices:

1. **Endpoint.** `GET /api/groups/:id/expenses/export?month=YYYY-MM`, protected
   by the existing `requireAuth` (any group member may export, per spec §Product
   Decisions line 91). `month` is **required** and validated against
   `^(\d{4})-(0[1-9]|1[0-2])$`; missing or malformed → 400.

2. **Per-person column = per-expense net**, not a running balance. For each
   expense row and each member `m`: `net(m) = (m is the payer ? amount : 0) −
   Σ split.computedAmount where split.userId === m`. The math runs in integer
   cents (`Math.round(v * 100)`, same `toCents` discipline as ADR-0006) and is
   divided by 100 only at the output boundary. `+` means the member will
   receive (creditor); `−` means the member owes (debtor). This matches spec
   §Balance Rules lines 101-106 exactly and is consistent with the existing
   `aggregateBalance` per-expense contribution. **Settlement row signs are
   fixed by the model:** a settlement has `paidBy = payer` and one split on the
   payee with `computedAmount = amount`, so the formula yields
   `payer net = +amount`, `payee net = −amount` — which is exactly the spec
   §Balance Rules lines 110-111 outcome ("reduces the debt of the payer [→ net
   +] and reduces the credit of the payee [→ net −]"). Do not invert it.

3. **Streaming, no buffer, no disk.** The service calls `res.flushHeaders()`
   after setting headers, writes the header row, then pages the expense
   repository with `take: 10000` (ordered `date ASC, createdAt ASC`) and calls
   `res.write(row + "\r\n")` once per expense. It never accumulates rows in an
   array or string. There is no `Content-Length` (we do not pre-count); the
   response uses HTTP chunked transfer-encoding. No file is written to disk on
   the server at any point. On a mid-stream error, if headers are not yet sent
   the service responds `500`; otherwise it calls `res.destroy(error)` to abort
   the partial stream.

4. **CSV format = RFC 4180.** CRLF row terminator; any field containing `,`,
   `"`, `\r`, or `\n` is wrapped in `"…"` with inner `"` doubled. Member column
   order = group members sorted by `displayName` ascending (matches the existing
   `selectableMembers` sort in the frontend). Row order = `date ASC, createdAt
   ASC` (chronological — intentionally opposite of the UI's descending list).

5. **Currency column = constant `EUR`.** Per spec §Product Decisions line 86
   ("first release targets a single currency per workspace, with EUR as the
   default currency"). No currency entity, column, or conversion is introduced
   by this ADR.

6. **Filename.** `Content-Disposition: attachment; filename="<safe>.csv";
   filename*=UTF-8''<encoded>.csv` where `<safe>` is the group name sanitized
   to `[A-Za-z0-9._-]` (spaces → `-`) plus `-${todayYYYYMMDD}`, and `<encoded>`
   is the **raw** group name (accented/unicode preserved) plus
   `-${todayYYYYMMDD}.csv` percent-encoded per RFC 5987. Both the ASCII
   `filename` and the `filename*` carry the date (the user requirement is "name
   of the group and date of now"). `Cache-Control: no-store` is set so
   re-downloads are never stale.

7. **Month window.** `Expense.date` is a TypeORM `date` column (calendar,
   no time, stored as `YYYY-MM-DD`) → month filtering uses lexicographic
   `Between('<YYYY>-<MM>-01', '<YYYY>-<MM>-<lastDay>')` with
   `lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()`. No timezone
   ambiguity because there is no time-of-day component.

8. **UI.** A month picker (`<input type="month">`, default current month) and
   an "Export CSV" button are added to the group expenses screen (the Balance
   card). The download is triggered with a manual `fetch` carrying the bearer
   JWT (axios forces JSON handling and does not cleanly trigger a browser
   download), read as a `Blob`, and saved via `createObjectURL` + a
   programmatic `<a download>`.

9. **Tests.** Per ADR-0009: a Vitest unit test for the pure CSV/filename util,
   an integration test (one file per endpoint, against the deployed backend)
   covering 200/400/401/404 + per-member signed nets + settlement rows +
   month-filter exclusion, and a Playwright happy-path e2e that captures the
   download and asserts filename + CSV content.

## Alternatives considered

- **Per-person column = running cumulative balance** — Not chosen: the request
  reads as a per-row value ("the amount they paid or they will receive" for
  each expense), the spec §Balance Rules defines the *per-expense* net, and a
  running balance would make every row order-dependent. (If a running balance
  export is later wanted, it can be added as an additional option without
  changing the per-expense columns.)
- **Buffer the CSV in memory and send once with `Content-Length`** — Not
  chosen: the requirement explicitly forbids holding the whole CSV in RAM and
  forbids saving a physical file; pre-computing `Content-Length` would require
  a full pre-count or full buffering. Chunked transfer-encoding keeps memory
  flat regardless of export size.
- **Write to a temporary file on disk and stream that** — Not chosen: the
  requirement explicitly forbids physical files on the backend; it adds disk
  I/O and cleanup surface for no benefit.
- **Stream the whole history (no month filter)** — Not chosen: the UI
  requirement is a single selected month; an "export all" option is out of
  scope here and can be added later.
- **Use a CSV library** — Not chosen: RFC 4180 escaping is ~30 lines of pure
  code; a dependency is unjustified and conflicts with the no-new-runtime-deps
  posture.
- **Use axios for the download in the frontend** — Not chosen: axios targets
  JSON responses and does not trigger a browser download as cleanly as a manual
  `fetch` + `Blob`; the manual path carries the bearer token and parses
  `Content-Disposition` directly.
- **Add a currency entity/column** — Not chosen: spec §Product Decisions line
  86 targets a single currency (EUR) per workspace; this ADR keeps currency a
  constant string and leaves multi-currency as a follow-up.

## Sources / Prior art

- `docs/specifications.md` §Features line 82 — "Group expenses can be exported
  as a CSV file" (flagged NOT IMPLEMENTED at lines 246-252).
- `docs/specifications.md` §Product Decisions line 93 — "CSV export must
  include both regular expenses and settle-up entries … visible in the group
  ledger."
- `docs/specifications.md` §Product Decisions line 86 — single currency, EUR
  default.
- `docs/specifications.md` §Product Decisions line 91 — all members share
  export permission.
- `docs/specifications.md` §Balance Rules lines 101-106 — per-expense net =
  paid − owed; `+` = owed money, `−` = owes money.
- `docs/specifications.md` §Balance Rules lines 110-111 — settle-up reduces
  payer debt and payee credit by the same amount (basis for the settlement
  sign convention).
- [ADR-0006](0006-money-ledger-and-balance-math.md) — integer-cent math, ledger
  model, settle-up as `kind='SETTLEMENT'` expense.
- [ADR-0009](0009-testing-strategy.md) — Vitest + deployed-backend Supertest +
  deployed-app Playwright, one e2e per feature.
- RFC 4180 — CSV field escaping and CRLF row terminator.
- RFC 5987 / RFC 6266 — `filename` (ASCII fallback) and `filename*=UTF-8''…`
  (unicode-preserving) in `Content-Disposition`.
- `.omo/plans/group-expenses-csv-export.md` — the decision-complete
  implementation plan derived from this ADR (pending human acceptance of this
  ADR before commits may cite `Implements ADR-0011`).

## Consequences

- Positive: a single, self-contained export endpoint that scales to arbitrarily
  large months with flat memory (one `res.write` per row, page size 10 000).
- Positive: per-row per-member nets reuse the exact §Balance Rules math, so
  the export is provably consistent with the in-app balances and with
  `aggregateBalance`.
- Positive: settlements appear in the export with the same sign convention as
  everywhere else — no special-casing, no drift.
- Positive: non-ASCII group names download with their real name in modern
  browsers (`filename*`) and a safe ASCII fallback in legacy clients
  (`filename`).
- Negative / trade-offs: no `Content-Length` and no streaming progress bar —
  the browser cannot show percent complete; acceptable for a per-month export
  bounded by the page size.
- Negative / trade-offs: per-expense net only (no cumulative running balance);
  if a running-balance export is later wanted, it is a follow-up, not a change
  to these columns.
- Negative / trade-offs: currency is a constant `EUR`; the columns cannot
  represent mixed currencies until multi-currency support exists (a follow-up
  ADR).
- Follow-ups: multi-currency support (would require a currency entity/column
  and exchange handling — a separate ADR).
- Follow-ups: an "export all months" / arbitrary date-range mode (separate UI
  affordance, not covered here).
- Follow-ups: a running-cumulative-balance export mode if ever requested.
- Follow-ups: explicit audit logging of export requests (no activity tracking
  exists yet; see the §Features line 81 gap) — a separate ADR on activity
  tracking if adopted.
