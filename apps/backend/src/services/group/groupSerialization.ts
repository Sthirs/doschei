import { Expense } from '../../entities/Expense';
import { Group } from '../../entities/Group';
import { Invitation } from '../../entities/Invitation';

export type SerializedSplit = {
  userId: string;
  displayName: string;
  shareType: 'PERCENT' | 'FIXED' | 'EQUAL';
  shareValue: number;
  computedAmount: number;
};

export type SerializedExpense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  paidByUserId: string;
  paidByName: string;
  date: string;
  createdAt: string;
  kind: 'EXPENSE' | 'SETTLEMENT';
  settledWithUserId: string | null;
  settledWithName: string | null;
  splits: SerializedSplit[];
};

export type SerializedGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  members: { id: string; displayName: string; email: string }[];
  netForCurrentUser: number;
};

export type PendingInvitationView = {
  id: string;
  email: string;
  createdAt: string;
};

export function serializeGroup(
  group: Group,
  netForCurrentUser = 0,
): SerializedGroup {
  return {
    id: group.id,
    name: group.name,
    imageUrl: group.imageUrl,
    memberCount: group.members.length,
    members: group.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      email: member.email,
      imageUrl: member.imageUrl ?? null,
    })),
    netForCurrentUser,
  };
}

/**
 * Serializes a pending invitation for the group-detail view.
 * The invitee's displayName and id are intentionally suppressed —
 * only the email snapshot and timestamps are exposed until acceptance.
 */
export function serializePendingInvitation(
  invitation: Invitation,
): PendingInvitationView {
  return {
    id: invitation.id,
    email: invitation.inviteeEmail,
    createdAt: invitation.createdAt.toISOString(),
  };
}

export function serializeExpense(expense: Expense): SerializedExpense {
  return {
    id: expense.id,
    description: expense.description,
    amount: Number(expense.amount),
    category: expense.category,
    paidByUserId: expense.paidBy.id,
    paidByName: expense.paidBy.displayName,
    date: expense.date,
    createdAt: expense.createdAt.toISOString(),
    kind: expense.kind,
    settledWithUserId:
      expense.kind === 'SETTLEMENT' && (expense.splits ?? []).length > 0
        ? expense.splits[0].user.id
        : null,
    settledWithName:
      expense.kind === 'SETTLEMENT' && (expense.splits ?? []).length > 0
        ? expense.splits[0].user.displayName
        : null,
    splits: (expense.splits ?? []).map((split) => ({
      userId: split.user.id,
      displayName: split.user.displayName,
      shareType: split.shareType,
      shareValue: Number(split.shareValue),
      computedAmount: Number(split.computedAmount),
    })),
  };
}
