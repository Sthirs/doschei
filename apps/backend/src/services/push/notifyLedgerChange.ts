import { dispatchNotification } from './pushDispatch';
import type { NotificationKind } from './notificationMessages';

export type LedgerChangeKind =
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'settlement.created'
  | 'settlement.updated'
  | 'settlement.deleted';

export type LedgerChangeInput = {
  kind: LedgerChangeKind;
  groupId: string;
  groupName: string;
  actor: { id: string; displayName: string };
  paidBy: { id: string };
  splitUsers: { id: string }[];
  description: string;
  amount: number;
};

/**
 * Resolves the recipients for an expense/settlement change — payer ∪ split
 * users, minus the actor (docs/specifications.md §Product Decisions) — and
 * dispatches one notification. This rule needs no settlement special case:
 * a settlement's single split row is the payee.
 *
 * Call this AFTER the write succeeds and do not await it on a path whose
 * failure would fail the request — `dispatchNotification` never rejects,
 * but callers should still treat this as fire-and-forget for latency.
 */
export const notifyLedgerChange = async (
  input: LedgerChangeInput,
): Promise<void> => {
  const recipientIds = new Set<string>([
    input.paidBy.id,
    ...input.splitUsers.map((user) => user.id),
  ]);
  recipientIds.delete(input.actor.id);

  if (recipientIds.size === 0) return;

  await dispatchNotification(
    Array.from(recipientIds),
    input.kind as NotificationKind,
    {
      actorName: input.actor.displayName,
      groupName: input.groupName,
      description: input.description,
      amount: input.amount,
      url: `/groups/${input.groupId}`,
    },
  );
};
