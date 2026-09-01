import { AppDataSource } from '../../db/data-source';
import { Expense } from '../../entities/Expense';
import { ExpenseSplit } from '../../entities/ExpenseSplit';
import { User } from '../../entities/User';
import { computeAllocatedAmounts, validateSplits } from '../expenseSplitMath';
import type { GroupRepositories } from './groupRepositories';
import {
  assertAllSplitUsersAreMembers,
  getGroupForMember,
} from './groupMembership';
import { serializeExpense } from './groupSerialization';

export async function createExpenseForGroup(
  repositories: GroupRepositories,
  groupId: string,
  description: string,
  amount: number,
  date: string | undefined,
  category: string | undefined,
  requesterUserId: string,
  paidByUserId: string,
  splitsInput: unknown,
) {
  const group = await repositories.groupRepository
    .createQueryBuilder('group')
    .innerJoin(
      'group.members',
      'membership',
      'membership.id = :requesterUserId',
      {
        requesterUserId,
      },
    )
    .leftJoinAndSelect('group.members', 'member')
    .where('group.id = :groupId', { groupId })
    .getOne();

  if (!group) {
    throw new Error('Group not found or you are not a member.');
  }

  const paidByUser = group.members.find((member) => member.id === paidByUserId);
  if (!paidByUser) {
    throw new Error('The selected user is not a member of this group.');
  }

  const splitsValidation = validateSplits(splitsInput, amount);
  if (!splitsValidation.ok) {
    throw new Error(splitsValidation.message);
  }

  assertAllSplitUsersAreMembers(splitsValidation.splits, group);

  const allocated = computeAllocatedAmounts(amount, splitsValidation.splits);

  const splitEntities = allocated.map((entry) => {
    const user = group.members.find((member) => member.id === entry.userId);
    if (!user) {
      throw new Error(
        `Split user ${entry.userId} is not a member of this group.`,
      );
    }
    return repositories.splitRepository.create({
      user,
      shareType: entry.shareType,
      shareValue: entry.shareValue,
      computedAmount: entry.computedAmount,
    });
  });

  const expense = repositories.expenseRepository.create({
    description,
    amount,
    date: date ?? new Date().toISOString().slice(0, 10),
    category: category ?? 'general',
    paidBy: paidByUser,
    group,
    splits: splitEntities,
  });

  const savedExpense = await repositories.expenseRepository.save(expense);

  const reloaded = await repositories.expenseRepository.findOne({
    where: { id: savedExpense.id },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!reloaded) {
    throw new Error('Created expense could not be reloaded.');
  }

  return serializeExpense(reloaded);
}

export async function updateExpenseForGroup(
  repositories: GroupRepositories,
  groupId: string,
  expenseId: string,
  updates: {
    description?: string;
    amount?: number;
    date?: string;
    category?: string;
    paidByUserId?: string;
    splits?: unknown;
  },
  userId: string,
) {
  const group = await getGroupForMember(repositories, groupId, userId);

  const expense = await repositories.expenseRepository.findOne({
    where: { id: expenseId, group: { id: groupId } },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!expense) {
    throw new Error('Expense not found.');
  }

  if (expense.kind === 'SETTLEMENT') {
    throw new Error(
      'Settlements must be updated through the settlements endpoint.',
    );
  }

  let resolvedPaidByUser: User | undefined;
  if (updates.paidByUserId !== undefined) {
    const paidByUser = group.members.find(
      (member) => member.id === updates.paidByUserId,
    );
    if (!paidByUser) {
      throw new Error('The selected user is not a member of this group.');
    }
    resolvedPaidByUser = paidByUser;
  }

  // `splits` is always required on PATCH. The previous splits are deleted
  // and the new ones are inserted in a single transaction, regardless of
  // which expense fields are also being updated.
  const effectiveAmount = updates.amount ?? Number(expense.amount);
  const splitsValidation = validateSplits(updates.splits, effectiveAmount);
  if (!splitsValidation.ok) {
    throw new Error(splitsValidation.message);
  }

  assertAllSplitUsersAreMembers(splitsValidation.splits, group);

  const allocated = computeAllocatedAmounts(
    effectiveAmount,
    splitsValidation.splits,
  );
  const nextSplits = allocated.map((entry) => {
    const user = group.members.find((member) => member.id === entry.userId);
    if (!user) {
      throw new Error(
        `Split user ${entry.userId} is not a member of this group.`,
      );
    }
    return repositories.splitRepository.create({
      expense,
      user,
      shareType: entry.shareType,
      shareValue: entry.shareValue,
      computedAmount: entry.computedAmount,
    });
  });

  if (updates.description !== undefined) {
    expense.description = updates.description;
  }
  if (updates.amount !== undefined) {
    expense.amount = updates.amount;
  }
  if (updates.date !== undefined) {
    expense.date = updates.date;
  }
  if (updates.category !== undefined) {
    expense.category = updates.category;
  }
  if (resolvedPaidByUser !== undefined) {
    expense.paidBy = resolvedPaidByUser;
  }

  const savedExpense = await AppDataSource.transaction(async (manager) => {
    const splitRepo = manager.getRepository(ExpenseSplit);
    await splitRepo.delete({ expense: { id: expense.id } });
    expense.splits = nextSplits;
    return manager.getRepository(Expense).save(expense);
  });

  const reloaded = await repositories.expenseRepository.findOne({
    where: { id: savedExpense.id },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!reloaded) {
    throw new Error('Updated expense could not be reloaded.');
  }

  return serializeExpense(reloaded);
}

export async function deleteExpenseForGroup(
  repositories: GroupRepositories,
  groupId: string,
  expenseId: string,
  userId: string,
) {
  await getGroupForMember(repositories, groupId, userId);

  const expense = await repositories.expenseRepository.findOne({
    where: { id: expenseId, group: { id: groupId } },
    relations: { paidBy: true },
  });

  if (!expense) {
    throw new Error('Expense not found.');
  }

  if (expense.kind === 'SETTLEMENT') {
    throw new Error(
      'Settlements must be deleted through the settlements endpoint.',
    );
  }

  await repositories.expenseRepository.remove(expense);
}
