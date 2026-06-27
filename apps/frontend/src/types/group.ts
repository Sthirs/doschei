export type GroupMember = {
  id: string;
  displayName: string;
  email: string;
};

export type Group = {
  id: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  members: GroupMember[];
};

export type ShareType = 'PERCENT' | 'FIXED';

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
  description: string;
  amount: number;
  category: string;
  paidByName: string;
  paidByUserId: string;
  date: string;
  createdAt: string;
  splits: ExpenseSplit[];
};

export type GroupDetail = Group & {
  expenses: Expense[];
  balance: BalanceSummary;
};
