import { Group } from '../../entities/Group';
import { aggregateBalance } from '../expenseSplitMath';
import type { SerializedExpense } from './groupSerialization';

export type SerializedBalanceEntry = {
  userId: string;
  displayName: string;
  netForCurrentUser: number;
};

export type SerializedBalance = {
  currentUserId: string;
  currentUserName: string;
  netForCurrentUser: number;
  perUser: SerializedBalanceEntry[];
};

export function computeBalance(
  group: Group,
  expenses: SerializedExpense[],
  currentUserId: string,
): SerializedBalance {
  const currentMember = group.members.find(
    (member) => member.id === currentUserId,
  );
  const currentUserName = currentMember?.displayName ?? '';

  const aggregation = aggregateBalance(
    expenses.map((expense) => ({
      paidByUserId: expense.paidByUserId,
      splits: expense.splits.map((split) => ({
        userId: split.userId,
        computedAmount: split.computedAmount,
      })),
    })),
    currentUserId,
  );

  const perUser: SerializedBalanceEntry[] = [];
  for (const [userId, netForCurrentUser] of aggregation.perUser) {
    const otherMember = group.members.find((member) => member.id === userId);
    perUser.push({
      userId,
      displayName: otherMember?.displayName ?? '',
      netForCurrentUser,
    });
  }

  return {
    currentUserId,
    currentUserName,
    netForCurrentUser: aggregation.netForCurrentUser,
    perUser,
  };
}
