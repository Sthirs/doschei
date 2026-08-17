export type GroupMember = {
  id: string;
  displayName: string;
  email: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  createdAt: string;
};

export type Group = {
  id: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  members: GroupMember[];
  netForCurrentUser: number;
  pendingInvitations?: PendingInvitation[];
};

export type InvitationListItem = {
  id: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  createdAt: string;
};

export type GroupsListResponse = {
  groups: Group[];
  invitations: InvitationListItem[];
};

export type ShareType = 'PERCENT' | 'FIXED' | 'EQUAL';

/**
 * Read model for an expense split as returned by the backend (GET).
 * `computedAmount` is always present in server responses.
 */
export type ExpenseSplit = {
  userId: string;
  displayName: string;
  shareType: ShareType;
  shareValue: number;
  computedAmount: number;
};

export type PerUserBalance = {
  userId: string;
  displayName: string;
  netForCurrentUser: number;
};

export type BalanceSummary = {
  currentUserId: string;
  currentUserName: string;
  netForCurrentUser: number;
  perUser: PerUserBalance[];
};

export type Expense = {
  id: string;
  kind: 'EXPENSE' | 'SETTLEMENT';
  description: string;
  amount: number;
  category: string;
  paidByName: string;
  paidByUserId: string;
  settledWithUserId: string | null;
  settledWithName: string | null;
  date: string;
  createdAt: string;
  splits: ExpenseSplit[];
};

export type GroupDetail = Group & {
  expenses: Expense[];
  balance: BalanceSummary;
};
