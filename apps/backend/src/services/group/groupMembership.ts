import { Group } from '../../entities/Group';
import type { ParsedSplit } from '../expenseSplitMath';
import { invitationService } from '../invitationService';
import type { GroupRepositories } from './groupRepositories';

/**
 * Verifies the user is a member of the group and returns the group entity.
 * Throws if not found or user is not a member.
 */
export async function getGroupForMember(
  repositories: GroupRepositories,
  groupId: string,
  userId: string,
): Promise<Group> {
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

  return group;
}

export function assertAllSplitUsersAreMembers(
  splits: ParsedSplit[],
  group: Group,
): void {
  for (const split of splits) {
    if (!group.members.some((member) => member.id === split.userId)) {
      throw new Error(
        `Split user ${split.userId} is not a member of this group.`,
      );
    }
  }
}

export async function addMemberByEmail(
  repositories: GroupRepositories,
  groupId: string,
  email: string,
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

  const normalizedEmail = email.trim().toLowerCase();
  const alreadyMember = group.members.some(
    (member) => member.email === normalizedEmail,
  );
  if (alreadyMember) {
    throw new Error('User is already a member of this group.');
  }

  return invitationService.createInvitation(groupId, normalizedEmail, userId);
}

export async function removeMember(
  repositories: GroupRepositories,
  groupId: string,
  memberUserId: string,
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

  const memberIndex = group.members.findIndex((m) => m.id === memberUserId);
  if (memberIndex === -1) {
    throw new Error('User is not a member of this group.');
  }

  group.members.splice(memberIndex, 1);
  await repositories.groupRepository.save(group);
}
