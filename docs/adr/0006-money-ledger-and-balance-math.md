# ADR-0006: Money, ledger, and balance math — integer-cent pure functions

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Product Decisions and §Balance Rules) mandates that monetary values must be stored and processed as integer cents to avoid floating-point rounding issues. The sum of all member balances in a group must always be exactly zero. Equal splits must allocate the full amount in cents; when the amount cannot be divided evenly, remaining cents are distributed one by one using the participant order. The canonical financial source of truth is the ledger of expenses and settlement entries; balances are always derived from that ledger. A settle-up payment is represented as a special expense entry (same ledger, same balances). PR #23 (`feat: split expense with groups members`) delivered the split allocation engine with PERCENT, FIXED, and EQUAL share types. The settle-up feature commit (`4b34086` — `feat(settle): add settle up feature`) added the `EXPENSE | SETTLEMENT` kind discriminator and settlement-specific validation rules.

## Decision

We will process all money math in pure functions operating on integer cents. The function `toCents(value)` converts decimal amounts to cents via `Math.round(value * 100)`. The allocator (`computeAllocatedAmounts`) uses `Math.floor` for PERCENT and EQUAL splits and distributes the leftover remainder one cent at a time in participant input order — the result is deterministic and the sum always equals the full expense amount in cents. Balance aggregation (`aggregateBalance`) runs entirely in integer cents and divides by 100 only at the display boundary. A single `expenses` table is the ledger; the `kind` column (`EXPENSE` | `SETTLEMENT`) discriminates regular expenses from settle-up payments. Balances are always derived from the current set of non-deleted ledger entries — there is no cached balance. Deleting an expense is a hard delete (`expenseRepository.remove`); splits are replaced on edit.

## Alternatives considered

- **Floating-point storage and arithmetic** — Not chosen: the spec explicitly mandates integer cents to avoid rounding errors; floating-point cannot guarantee the zero-sum invariant.
- **Soft-delete with tombstone column** — Not chosen: hard delete is simpler and the spec says deletion removes entries from active balances immediately; activity history (which would require soft-delete or an event log) is not yet implemented.
- **Cached balance columns** — Not chosen: the spec mandates balances are always derived from the ledger; caching risks drift between cached and computed balances.
- **Separate settlements table** — Not chosen: the spec decision "a settle-up payment is represented as a special expense entry" means a single ledger with a `kind` discriminator, not two tables.
- **Integer (bigint) column for cents in the database** — Not chosen: the `Expense.amount` column uses `decimal(10,2)` in the database, not an integer-cent column; all cent-precise math happens in the application layer.

## Sources / Prior art

- `docs/specifications.md` §Product Decisions — "Monetary values must be stored and processed as integer cents to avoid floating-point rounding issues."
- `docs/specifications.md` §Balance Rules — zero-sum invariant, deterministic remainder distribution, balances derived from ledger, settle-up as special expense.
- PR #23 (`651c19b` — `feat: split expense with groups members`) — delivered `validateSplits`, `computeAllocatedAmounts`, `aggregateBalance` in `expenseSplitMath.ts` with PERCENT/FIXED/EQUAL share types and cent-precise allocation.
- Settle-up commit (`4b34086` — `feat(settle): add settle up feature`) — added `Expense.kind` discriminator, `settlementRules.ts`, settlements endpoints.
- `apps/backend/src/services/expenseSplitMath.ts` — `toCents`, `computeAllocatedAmounts` (floor + remainder in input order), `aggregateBalance` (integer-cent arithmetic throughout).
- `apps/backend/src/services/settlementRules.ts` — settlement-specific validation.
- `apps/backend/src/entities/Expense.ts` — `amount: decimal(10,2)`, `kind: 'EXPENSE' | 'SETTLEMENT'`.

## Consequences

- Positive: pure functions with integer-cent arithmetic guarantee the zero-sum invariant exactly — no floating-point drift.
- Positive: deterministic remainder distribution (in participant order) means the same expense always produces the same allocation, enabling reliable round-trip editing.
- Positive: a single ledger with `kind` discriminator means settle-up payments appear in the same balance calculations as regular expenses — no separate reconciliation needed.
- Positive: pure functions are trivially unit-testable — `expenseSplitMath.test.ts` and `settlementRules.test.ts` provide comprehensive coverage.
- Negative / trade-offs: the database stores `amount` as `decimal(10,2)` not integer cents — the spec says "stored as integer cents" but the implementation stores decimal and processes in cents; this is a divergence.
- Negative / trade-offs: hard delete means no audit trail — once an expense is deleted, it is gone; the spec mentions activity history (deletion entries persist) but it is not implemented.
- Follow-ups: Reconcile the spec's "stored as integer cents" with the `decimal(10,2)` database column — either change the schema to integer cents (breaking) or update the spec wording to "processed as integer cents, stored as decimal(10,2)".
- Follow-ups: Implement activity history per spec (deletion entries persist in an activity log) — this requires either soft-delete or a separate event/audit table.
- Follow-ups: Add currency support — the spec targets a single currency (EUR) per workspace; multi-currency would require exchange-rate handling.
