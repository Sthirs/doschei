import type { BalanceSummary, GroupMember } from '@/types/group';

/**
 * The net amount the current user has with a specific counterpart.
 * Returns the entry's netForCurrentUser, or 0 when the user is absent
 * from perUser (the backend omits zero-net entries by contract — see
 * `expenseSplitMath.ts:226-231`).
 */
export function outstandingWith(balance: BalanceSummary, userId: string): number {
  const entry = balance.perUser.find((p) => p.userId === userId);
  return entry ? entry.netForCurrentUser : 0;
}

/**
 * Pre-fill defaults for the settle-up modal.
 *
 * Sign convention (from `expenseSplitMath.ts:186-196`):
 *   net > 0  → counterpart owes the current user
 *   net < 0  → current user owes the counterpart
 *   net === 0 → no debt
 *
 * Selection: among non-current members, pick the one with the greatest
 * `|net|`. Ties resolve by `displayName.localeCompare('en')` so the
 * result is deterministic across runs.
 */
export function computeSettleUpDefaults(
  balance: BalanceSummary,
  members: GroupMember[],
  currentUserId: string,
): { payerId: string; payeeId: string; amount: number | '' } {
  const candidates = members.filter((m) => m.id !== currentUserId);

  if (candidates.length === 0) {
    return { payerId: currentUserId, payeeId: '', amount: '' };
  }

  const sorted = [...candidates].sort((a, b) => {
    const absA = Math.abs(outstandingWith(balance, a.id));
    const absB = Math.abs(outstandingWith(balance, b.id));
    if (absA !== absB) return absB - absA;
    return a.displayName.localeCompare(b.displayName, 'en');
  });

  const counterpart = sorted[0];
  const net = outstandingWith(balance, counterpart.id);

  if (net === 0) {
    return { payerId: currentUserId, payeeId: counterpart.id, amount: '' };
  }

  if (net < 0) {
    return { payerId: currentUserId, payeeId: counterpart.id, amount: round2(-net) };
  }
  return { payerId: counterpart.id, payeeId: currentUserId, amount: round2(net) };
}

/**
 * Returns `|net|` between the current user and the other party when
 * exactly one of payer/payee is the current user; otherwise `''`.
 * The amount is rounded to 2 decimals so a non-2-decimal `net` (e.g.
 * -10.005) does not leak floating-point drift into the input field.
 */
export function settlementAmountFor(
  balance: BalanceSummary,
  currentUserId: string,
  payerId: string,
  payeeId: string,
): number | '' {
  const currentIsParty = payerId === currentUserId || payeeId === currentUserId;
  if (!currentIsParty) return '';
  if (payerId === payeeId) return '';

  const otherId = payerId === currentUserId ? payeeId : payerId;
  const net = outstandingWith(balance, otherId);
  if (net === 0) return '';
  return round2(Math.abs(net));
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
