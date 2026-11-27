import { aggregateNetForUser } from '../expenseSplitMath';
import { computeBalance } from './balanceComputation';
import { foldBalanceRows } from './balanceRows';
import { findBalanceRows, findGroupExpenses } from './expenseQueries';
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

  const expensesByGroup = foldBalanceRows(
    await findBalanceRows(repositories.expenseRepository, groupIds),
  );

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

  const [expenses, pendingInvitations] = await Promise.all([
    findGroupExpenses(repositories.expenseRepository, groupId),
    repositories.invitationRepository.find({
      where: { groupId, status: 'pending' },
    }),
  ]);

  const serializedExpenses = expenses.map((expense) =>
    serializeExpense(expense),
  );
  const balance = computeBalance(group, serializedExpenses, userId);

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
