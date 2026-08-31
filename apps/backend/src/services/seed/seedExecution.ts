import { In } from 'typeorm';

import { AppDataSource } from '../../db/data-source';
import { Expense } from '../../entities/Expense';
import { ExpenseSplit } from '../../entities/ExpenseSplit';
import { Group } from '../../entities/Group';
import { User } from '../../entities/User';
import { hashPassword } from '../../utils/password';
import { computeAllocatedAmounts, type ParsedSplit } from '../expenseSplitMath';
import { COMMON_PASSWORD, DEMO_EMAIL, SEED_EXPENSE_DESCRIPTIONS, SEED_EXPENSES, SEED_GROUPS, SEED_USERS } from './seedData';

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
