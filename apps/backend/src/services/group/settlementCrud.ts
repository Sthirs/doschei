import { AppDataSource } from '../../db/data-source';
import { Expense } from '../../entities/Expense';
import { ExpenseSplit } from '../../entities/ExpenseSplit';
import {
  buildSettlementSplit,
  validateSettlementInput,
} from '../settlementRules';
import type { GroupRepositories } from './groupRepositories';
import { getGroupForMember } from './groupMembership';
import { serializeExpense } from './groupSerialization';

export async function createSettlementForGroup(
  repositories: GroupRepositories,
  groupId: string,
  requesterUserId: string,
  input: {
    paidByUserId?: unknown;
    paidToUserId: unknown;
    amount: unknown;
    date?: unknown;
  },
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

  const resolvedPayer =
    typeof input.paidByUserId === 'string' &&
    input.paidByUserId.trim().length > 0
      ? input.paidByUserId
      : requesterUserId;

  const result = validateSettlementInput(
    {
      paidByUserId: resolvedPayer,
      paidToUserId: input.paidToUserId,
      amount: input.amount,
      date: input.date,
    },
    group.members.map((m) => m.id),
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  const paidByUser = group.members.find(
    (m) => m.id === result.settlement.paidByUserId,
  );
  if (!paidByUser) {
    throw new Error('The selected user is not a member of this group.');
  }

  const payeeUser = group.members.find(
    (m) => m.id === result.settlement.paidToUserId,
  );
  if (!payeeUser) {
    throw new Error('The selected user is not a member of this group.');
  }

  const splitSpec = buildSettlementSplit(
    result.settlement.paidToUserId,
    result.settlement.amount,
  );
  const splitEntity = repositories.splitRepository.create({
    user: payeeUser,
    shareType: splitSpec.shareType,
    shareValue: splitSpec.shareValue,
    computedAmount: result.settlement.amount,
  });

  const expense = repositories.expenseRepository.create({
    description: 'Settlement',
    amount: result.settlement.amount,
    date: result.settlement.date ?? new Date().toISOString().slice(0, 10),
    category: 'general',
    kind: 'SETTLEMENT',
    paidBy: paidByUser,
    group,
    splits: [splitEntity],
  });

  const savedExpense = await repositories.expenseRepository.save(expense);

  const reloaded = await repositories.expenseRepository.findOne({
    where: { id: savedExpense.id },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!reloaded) {
    throw new Error('Created settlement could not be reloaded.');
  }

  return serializeExpense(reloaded);
}

export async function updateSettlementForGroup(
  repositories: GroupRepositories,
  groupId: string,
  settlementId: string,
  updates: {
    paidByUserId?: unknown;
    paidToUserId?: unknown;
    amount?: unknown;
    date?: unknown;
  },
  userId: string,
) {
  const group = await getGroupForMember(repositories, groupId, userId);

  const expense = await repositories.expenseRepository.findOne({
    where: { id: settlementId, group: { id: groupId } },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!expense || expense.kind !== 'SETTLEMENT') {
    throw new Error('Settlement not found.');
  }

  const paidByUserId =
    typeof updates.paidByUserId === 'string' &&
    updates.paidByUserId.trim().length > 0
      ? updates.paidByUserId
      : expense.paidBy.id;
  const paidToUserId =
    typeof updates.paidToUserId === 'string' &&
    updates.paidToUserId.trim().length > 0
      ? updates.paidToUserId
      : expense.splits[0].user.id;
  const amount =
    typeof updates.amount === 'number'
      ? updates.amount
      : Number(expense.amount);
  const date = typeof updates.date === 'string' ? updates.date : expense.date;

  const result = validateSettlementInput(
    { paidByUserId, paidToUserId, amount, date },
    group.members.map((m) => m.id),
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  const paidByUser = group.members.find(
    (m) => m.id === result.settlement.paidByUserId,
  );
  if (!paidByUser) {
    throw new Error('The selected user is not a member of this group.');
  }

  const payeeUser = group.members.find(
    (m) => m.id === result.settlement.paidToUserId,
  );
  if (!payeeUser) {
    throw new Error('The selected user is not a member of this group.');
  }

  const splitSpec = buildSettlementSplit(
    result.settlement.paidToUserId,
    result.settlement.amount,
  );
  const nextSplit = repositories.splitRepository.create({
    expense,
    user: payeeUser,
    shareType: splitSpec.shareType,
    shareValue: splitSpec.shareValue,
    computedAmount: result.settlement.amount,
  });

  expense.paidBy = paidByUser;
  expense.amount = result.settlement.amount;
  expense.date = result.settlement.date ?? expense.date;

  const savedExpense = await AppDataSource.transaction(async (manager) => {
    const splitRepo = manager.getRepository(ExpenseSplit);
    await splitRepo.delete({ expense: { id: expense.id } });
    expense.splits = [nextSplit];
    return manager.getRepository(Expense).save(expense);
  });

  const reloaded = await repositories.expenseRepository.findOne({
    where: { id: savedExpense.id },
    relations: { paidBy: true, splits: { user: true } },
  });

  if (!reloaded) {
    throw new Error('Updated settlement could not be reloaded.');
  }

  return serializeExpense(reloaded);
}

export async function deleteSettlementForGroup(
  repositories: GroupRepositories,
  groupId: string,
  settlementId: string,
  userId: string,
) {
  await getGroupForMember(repositories, groupId, userId);

  const expense = await repositories.expenseRepository.findOne({
    where: { id: settlementId, group: { id: groupId } },
    relations: { paidBy: true },
  });

  if (!expense || expense.kind !== 'SETTLEMENT') {
    throw new Error('Settlement not found.');
  }

  await repositories.expenseRepository.remove(expense);
}
