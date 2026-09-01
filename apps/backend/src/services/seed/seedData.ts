import type { ShareType } from '../../entities/ExpenseSplit';

export const DEMO_EMAIL = 'demo@doschei.local';

export const COMMON_PASSWORD = 'password123';

export type SeedUser = {
  email: string;
  displayName: string;
};

export type SeedGroup = {
  name: string;
  memberEmails: string[];
};

export const SEED_USERS: SeedUser[] = [
  { email: 'alice@doschei.local', displayName: 'Alice Rossi' },
  { email: 'bob@doschei.local', displayName: 'Bob Bianchi' },
  { email: 'carol@doschei.local', displayName: 'Carol Colombo' },
];

export const SEED_GROUPS: SeedGroup[] = [
  { name: 'Personal Spending', memberEmails: [DEMO_EMAIL] },
  // Overlapping memberships across groups exercise expense-author edge cases.
  { name: 'Weekend in Venice', memberEmails: [DEMO_EMAIL, 'alice@doschei.local'] },
  { name: 'Office Lunch', memberEmails: ['alice@doschei.local', 'carol@doschei.local'] },
  { name: 'Holiday in Palermo', memberEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'] },
];

export type SeedExpenseSpec = {
  description: string;
  amount: number;
  category: string;
  date: string;
  paidByEmail: string;
  groupName: string;
  splitEmails: string[];
  shareType: ShareType;
};

// Venice (demo + alice): demo paid the big items → demo is owed overall (+40.00).
// Palermo (demo + alice + bob): alice and bob paid everything → demo owes overall (−88.00).
// Personal Spending and Office Lunch are intentionally left without seed expenses.
// All amounts divide evenly across the split count so computedAmounts are clean.
export const SEED_EXPENSES: SeedExpenseSpec[] = [
  {
    description: 'Venice train tickets',
    amount: 50,
    category: 'bus-train',
    date: '2024-10-12',
    paidByEmail: DEMO_EMAIL,
    groupName: 'Weekend in Venice',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Venice canal dinner',
    amount: 30,
    category: 'dining-out',
    date: '2024-10-12',
    paidByEmail: DEMO_EMAIL,
    groupName: 'Weekend in Venice',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Venice hotel night',
    amount: 42,
    category: 'hotel',
    date: '2024-10-12',
    paidByEmail: DEMO_EMAIL,
    groupName: 'Weekend in Venice',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Venice morning coffee',
    amount: 24,
    category: 'dining-out',
    date: '2024-10-13',
    paidByEmail: 'alice@doschei.local',
    groupName: 'Weekend in Venice',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Venice gondola ride',
    amount: 18,
    category: 'general',
    date: '2024-10-13',
    paidByEmail: 'alice@doschei.local',
    groupName: 'Weekend in Venice',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Palermo airport taxi',
    amount: 90,
    category: 'taxi',
    date: '2024-10-15',
    paidByEmail: 'alice@doschei.local',
    groupName: 'Holiday in Palermo',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Palermo seafood lunch',
    amount: 60,
    category: 'dining-out',
    date: '2024-10-15',
    paidByEmail: 'bob@doschei.local',
    groupName: 'Holiday in Palermo',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Palermo museum tickets',
    amount: 45,
    category: 'entertainment-other',
    date: '2024-10-16',
    paidByEmail: 'alice@doschei.local',
    groupName: 'Holiday in Palermo',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Palermo street food',
    amount: 33,
    category: 'food-other',
    date: '2024-10-16',
    paidByEmail: 'bob@doschei.local',
    groupName: 'Holiday in Palermo',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
    shareType: 'EQUAL',
  },
  {
    description: 'Palermo beach rental',
    amount: 36,
    category: 'general',
    date: '2024-10-17',
    paidByEmail: 'alice@doschei.local',
    groupName: 'Holiday in Palermo',
    splitEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
    shareType: 'EQUAL',
  },
];

export const SEED_EXPENSE_DESCRIPTIONS = SEED_EXPENSES.map((expense) => expense.description);
