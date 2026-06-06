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

export type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  paidByName: string;
  date: string;
  createdAt: string;
};

export type GroupDetail = Group & {
  expenses: Expense[];
};
