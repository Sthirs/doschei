import { In } from 'typeorm';

import {
  aggregateNetForUser,
  type AggregateBalanceInput,
} from '../expenseSplitMath';
import { computeBalance } from './balanceComputation';
import type { GroupRepositories } from './groupRepositories';
import {
  serializeExpense,
  serializeGroup,
  serializePendingInvitation,
} from './groupSerialization';

export async function createGroupForUser(
  repositories: GroupRepositories,
  userId: string,
  name: string,
) {
  const user = await repositories.userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('Authenticated user not found.');
  }

  const group = repositories.groupRepository.create({
    name,
    members: [user],
  });

  const savedGroup = await repositories.groupRepository.save(group);

  return serializeGroup(savedGroup);
}

export async function getGroupsForUser(
  repositories: GroupRepositories,
  userId: string,
) {
  const groups = await repositories.groupRepository
    .createQueryBuilder('group')
    .innerJoin('group.members', 'membership', 'membership.id = :userId', {
      userId,
    })
    .leftJoinAndSelect('group.members', 'member')
    .orderBy('group.created_at', 'ASC')
    .getMany();

  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((group) => group.id);

  const expenses = await repositories.expenseRepository.find({
    where: { group: { id: In(groupIds) } },
    relations: { group: true, paidBy: true, splits: { user: true } },
    order: { date: 'DESC', createdAt: 'DESC' },
  });

  const expensesByGroup = new Map<string, AggregateBalanceInput[]>();
  for (const expense of expenses) {
    const groupId = expense.group.id;
    const entry: AggregateBalanceInput = {
      paidByUserId: expense.paidBy.id,
      splits: (expense.splits ?? []).map((split) => ({
        userId: split.user.id,
        computedAmount: Number(split.computedAmount),
      })),
    };
    const list = expensesByGroup.get(groupId);
    if (list) {
      list.push(entry);
    } else {
      expensesByGroup.set(groupId, [entry]);
    }
  }

  return groups.map((group) =>
    serializeGroup(
      group,
      aggregateNetForUser(expensesByGroup.get(group.id) ?? [], userId),
    ),
  );
}

export async function getGroupByIdForUser(
  repositories: GroupRepositories,
  groupId: string,
  userId: string,
) {
  const group = await repositories.groupRepository
    .createQueryBuilder('group')
    .innerJoin('group.members', 'membership', 'membership.id = :userId', {
      userId,
    })
    .leftJoinAndSelect('group.members', 'member')
    .where('group.id = :groupId', { groupId })
    .getOne();

  if (!group) {
    return null;
  }

  const expenses = await repositories.expenseRepository.find({
    where: { group: { id: groupId } },
    relations: { paidBy: true, splits: { user: true } },
    order: { date: 'DESC', createdAt: 'DESC' },
  });

  const serializedExpenses = expenses.map((expense) =>
    serializeExpense(expense),
  );
  const balance = computeBalance(group, serializedExpenses, userId);

  const pendingInvitations = await repositories.invitationRepository.find({
    where: { groupId, status: 'pending' },
  });

  return {
    ...serializeGroup(group),
    expenses: serializedExpenses,
    balance,
    pendingInvitations: pendingInvitations.map((invitation) =>
      serializePendingInvitation(invitation),
    ),
  };
}

export async function updateGroup(
  repositories: GroupRepositories,
  groupId: string,
  name: string,
  userId: string,
) {
  const group = await repositories.groupRepository
    .createQueryBuilder('group')
    .innerJoin('group.members', 'membership', 'membership.id = :userId', {
      userId,
    })
    .leftJoinAndSelect('group.members', 'member')
    .where('group.id = :groupId', { groupId })
    .getOne();

  if (!group) {
    throw new Error('Group not found or you are not a member.');
  }

  group.name = name;
  const savedGroup = await repositories.groupRepository.save(group);

  return serializeGroup(savedGroup);
}

export async function updateGroupImage(
  repositories: GroupRepositories,
  groupId: string,
  imageUrl: string,
  userId: string,
) {
  const group = await repositories.groupRepository
    .createQueryBuilder('group')
    .innerJoin('group.members', 'membership', 'membership.id = :userId', {
      userId,
    })
    .leftJoinAndSelect('group.members', 'member')
    .where('group.id = :groupId', { groupId })
    .getOne();

  if (!group) {
    throw new Error('Group not found or you are not a member.');
  }

  group.imageUrl = imageUrl;
  const savedGroup = await repositories.groupRepository.save(group);

  return serializeGroup(savedGroup);
}
