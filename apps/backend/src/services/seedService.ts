import { In } from 'typeorm';

import { AppDataSource } from '../db/data-source';
import { Expense } from '../entities/Expense';
import { ExpenseSplit, type ShareType } from '../entities/ExpenseSplit';
import { Group } from '../entities/Group';
import { User } from '../entities/User';
import { hashPassword } from '../utils/password';
import { computeAllocatedAmounts, type ParsedSplit } from './expenseSplitMath';

const DEMO_EMAIL = 'demo@doschei.local';

type SeedUser = {
  email: string;
  displayName: string;
};

type SeedGroup = {
  name: string;
  memberEmails: string[];
};

const SEED_USERS: SeedUser[] = [
  { email: 'alice@doschei.local', displayName: 'Alice Rossi' },
  { email: 'bob@doschei.local', displayName: 'Bob Bianchi' },
  { email: 'carol@doschei.local', displayName: 'Carol Colombo' },
];

const SEED_GROUPS: SeedGroup[] = [
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

const SEED_EXPENSE_DESCRIPTIONS = SEED_EXPENSES.map((expense) => expense.description);

const COMMON_PASSWORD = 'password123';

export const seedDatabase = async (): Promise<void> => {
  const userRepository = AppDataSource.getRepository(User);
  const groupRepository = AppDataSource.getRepository(Group);

  // Demo user is the canonical seeded credential documented in the README.
  let demoUser = await userRepository.findOne({ where: { email: DEMO_EMAIL }, relations: { groups: true } });

  if (!demoUser) {
    demoUser = userRepository.create({
      email: DEMO_EMAIL,
      displayName: 'Demo User',
      passwordHash: await hashPassword(COMMON_PASSWORD),
    });

    demoUser = await userRepository.save(demoUser);
  }

  // Upsert the additional seed users idempotently.
  const usersByEmail = new Map<string, User>();
  usersByEmail.set(DEMO_EMAIL, demoUser);

  for (const seedUser of SEED_USERS) {
    const existing = await userRepository.findOne({ where: { email: seedUser.email } });

    if (existing) {
      usersByEmail.set(seedUser.email, existing);
      continue;
    }

    const created = userRepository.create({
      email: seedUser.email,
      displayName: seedUser.displayName,
      passwordHash: await hashPassword(COMMON_PASSWORD),
    });

    const saved = await userRepository.save(created);
    usersByEmail.set(seedUser.email, saved);
  }

  // Upsert each seed group idempotently, attaching every declared member.
  for (const seedGroup of SEED_GROUPS) {
    const existingGroup = await groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.members', 'member')
      .where('group.name = :name', { name: seedGroup.name })
      .getOne();

    if (existingGroup) {
      // Ensure every declared member is present even if the group already
      // existed from a previous, smaller seed run.
      const missingMembers = seedGroup.memberEmails
        .map((email) => usersByEmail.get(email))
        .filter((user): user is User => user !== undefined)
        .filter((user) => !existingGroup.members.some((m) => m.id === user.id));

      if (missingMembers.length > 0) {
        existingGroup.members.push(...missingMembers);
        await groupRepository.save(existingGroup);
      }

      continue;
    }

    const members = seedGroup.memberEmails
      .map((email) => usersByEmail.get(email))
      .filter((user): user is User => Boolean(user));

    const group = groupRepository.create({
      name: seedGroup.name,
      imageUrl: null,
      members,
    });

    await groupRepository.save(group);
  }

  const expenseRepository = AppDataSource.getRepository(Expense);
  const splitRepository = AppDataSource.getRepository(ExpenseSplit);

  const groupsByName = new Map<string, Group>();
  for (const seedGroup of SEED_GROUPS) {
    const group = await groupRepository.findOne({ where: { name: seedGroup.name } });
    if (group) {
      groupsByName.set(seedGroup.name, group);
    }
  }

  const usersById = new Map<string, User>();
  for (const user of usersByEmail.values()) {
    usersById.set(user.id, user);
  }

  // Idempotency guard: delete existing seed expenses in target groups before
  // re-inserting. Descriptions are unique across all seed expenses, so this
  // removes exactly the seed rows (and cascades to expense_splits) without
  // touching user-created expenses.
  const targetGroupNames = [...new Set(SEED_EXPENSES.map((expense) => expense.groupName))];
  for (const groupName of targetGroupNames) {
    const group = groupsByName.get(groupName);
    if (!group) {
      continue;
    }
    await expenseRepository.delete({
      description: In(SEED_EXPENSE_DESCRIPTIONS),
      group: { id: group.id },
    });
  }

  for (const spec of SEED_EXPENSES) {
    const group = groupsByName.get(spec.groupName);
    if (!group) {
      continue;
    }

    const paidBy = usersByEmail.get(spec.paidByEmail);
    if (!paidBy) {
      continue;
    }

    const parsedSplits: ParsedSplit[] = spec.splitEmails.map((email) => {
      const user = usersByEmail.get(email);
      if (!user) {
        throw new Error(`Seed user not found: ${email}`);
      }
      return { userId: user.id, shareType: spec.shareType, shareValue: 0 };
    });

    const allocated = computeAllocatedAmounts(spec.amount, parsedSplits);

    const splitEntities = allocated.map((entry) => {
      const user = usersById.get(entry.userId);
      if (!user) {
        throw new Error(`Seed user not found for id: ${entry.userId}`);
      }
      return splitRepository.create({
        user,
        shareType: entry.shareType,
        shareValue: entry.shareValue,
        computedAmount: entry.computedAmount,
      });
    });

    const expense = expenseRepository.create({
      description: spec.description,
      amount: spec.amount,
      date: spec.date,
      category: spec.category,
      kind: 'EXPENSE',
      paidBy,
      group,
      splits: splitEntities,
    });

    await expenseRepository.save(expense);
  }
};
