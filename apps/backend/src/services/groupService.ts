import { AppDataSource } from '../db/data-source';
import { Group } from '../entities/Group';

export class GroupService {
  private groupRepository = AppDataSource.getRepository(Group);

  async getGroupsForUser(userId: string) {
    const groups = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .orderBy('group.created_at', 'ASC')
      .getMany();

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      imageUrl: group.imageUrl,
      memberCount: group.members.length,
      members: group.members.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        email: member.email,
      })),
    }));
  }
}
