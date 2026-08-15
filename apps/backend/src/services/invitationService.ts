import type { EntityManager, Repository } from 'typeorm';

import { AppDataSource } from '../db/data-source';
import { Group } from '../entities/Group';
import { Invitation } from '../entities/Invitation';
import { User } from '../entities/User';

type SerializedInvitation = {
  id: string;
  groupId: string;
  inviteeEmail: string;
  inviteeId: string | null;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
};

type PendingInvitationSummary = {
  id: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  createdAt: string;
};

export class InvitationService {
  private _invitationRepository?: Repository<Invitation>;
  private _groupRepository?: Repository<Group>;
  private _userRepository?: Repository<User>;

  private get invitationRepository(): Repository<Invitation> {
    if (!this._invitationRepository) {
      this._invitationRepository = AppDataSource.getRepository(Invitation);
    }
    return this._invitationRepository;
  }

  private get groupRepository(): Repository<Group> {
    if (!this._groupRepository) {
      this._groupRepository = AppDataSource.getRepository(Group);
    }
    return this._groupRepository;
  }

  private get userRepository(): Repository<User> {
    if (!this._userRepository) {
      this._userRepository = AppDataSource.getRepository(User);
    }
    return this._userRepository;
  }

  async createInvitation(
    groupId: string,
    inviteeEmail: string,
    inviterUserId: string,
  ): Promise<SerializedInvitation> {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId: inviterUserId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    const email = inviteeEmail.trim().toLowerCase();

    const existing = await this.invitationRepository.findOne({
      where: { groupId, inviteeEmail: email, status: 'pending' },
    });

    if (existing) {
      throw new Error('Invitation already pending for this email.');
    }

    const inviteeUser = await this.userRepository.findOne({ where: { email } });
    const inviteeId = inviteeUser ? inviteeUser.id : null;

    const invitation = this.invitationRepository.create({
      group,
      groupId,
      inviterId: inviterUserId,
      inviteeId,
      inviteeEmail: email,
      status: 'pending',
    });

    const saved = await this.invitationRepository.save(invitation);

    return this.serializeInvitation(saved);
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<SerializedInvitation> {
    const invitation = await this.invitationRepository.findOne({ where: { id: invitationId } });

    if (!invitation) {
      throw new Error('Invitation not found.');
    }

    if (invitation.inviteeId !== userId) {
      throw new Error('You are not the invitee of this invitation.');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending.');
    }

    await AppDataSource.transaction(async (manager) => {
      const groupRepo = manager.getRepository(Group);
      const invitationRepo = manager.getRepository(Invitation);
      const userRepo = manager.getRepository(User);

      const group = await groupRepo.findOne({
        where: { id: invitation.groupId },
        relations: { members: true },
      });

      if (!group) {
        throw new Error('Group not found.');
      }

      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found.');
      }

      if (!group.members.some((member) => member.id === userId)) {
        group.members.push(user);
        await groupRepo.save(group);
      }

      invitation.status = 'accepted';
      await invitationRepo.save(invitation);
    });

    return this.serializeInvitation(invitation);
  }

  async declineInvitation(invitationId: string, userId: string): Promise<SerializedInvitation> {
    const invitation = await this.invitationRepository.findOne({ where: { id: invitationId } });

    if (!invitation) {
      throw new Error('Invitation not found.');
    }

    if (invitation.inviteeId !== userId) {
      throw new Error('You are not the invitee of this invitation.');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending.');
    }

    invitation.status = 'declined';
    const saved = await this.invitationRepository.save(invitation);

    return this.serializeInvitation(saved);
  }

  async cancelInvitation(invitationId: string, inviterUserId: string): Promise<void> {
    const invitation = await this.invitationRepository.findOne({ where: { id: invitationId } });

    if (!invitation) {
      throw new Error('Invitation not found.');
    }

    if (invitation.inviterId !== inviterUserId) {
      throw new Error('You are not the inviter of this invitation.');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending.');
    }

    await this.invitationRepository.remove(invitation);
  }

  async listPendingForInvitee(userId: string): Promise<PendingInvitationSummary[]> {
    const invitations = await this.invitationRepository
      .createQueryBuilder('invitation')
      .innerJoinAndSelect('invitation.group', 'group')
      .leftJoinAndSelect('invitation.inviter', 'inviter')
      .where('invitation.inviteeId = :userId', { userId })
      .andWhere('invitation.status = :status', { status: 'pending' })
      .orderBy('invitation.createdAt', 'ASC')
      .getMany();

    return invitations.map((invitation) => ({
      id: invitation.id,
      groupId: invitation.groupId,
      groupName: invitation.group.name,
      inviterName: invitation.inviter?.displayName ?? '',
      createdAt: invitation.createdAt.toISOString(),
    }));
  }

  async attachPendingInvitationsForEmail(
    user: { id: string; email: string },
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager?.getRepository(Invitation) ?? this.invitationRepository;
    const result = await repo
      .createQueryBuilder()
      .update(Invitation)
      .set({ inviteeId: user.id })
      .where('inviteeEmail = :email', { email: user.email })
      .andWhere('inviteeId IS NULL')
      .andWhere('status = :status', { status: 'pending' })
      .execute();

    return result.affected ?? 0;
  }

  private serializeInvitation(invitation: Invitation): SerializedInvitation {
    return {
      id: invitation.id,
      groupId: invitation.groupId,
      inviteeEmail: invitation.inviteeEmail,
      inviteeId: invitation.inviteeId,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    };
  }
}

const invitationService = new InvitationService();

export { invitationService };
