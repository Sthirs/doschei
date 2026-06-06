import { AppDataSource } from '../db/data-source';
import { Expense } from '../entities/Expense';
import { Group } from '../entities/Group';
import { User } from '../entities/User';

export class GroupService {
  private groupRepository = AppDataSource.getRepository(Group);
  private expenseRepository = AppDataSource.getRepository(Expense);
  private userRepository = AppDataSource.getRepository(User);

  private serializeGroup(group: Group) {
    return {
      id: group.id,
      name: group.name,
      imageUrl: group.imageUrl,
      memberCount: group.members.length,
      members: group.members.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        email: member.email,
      })),
    };
  }

  async createGroupForUser(userId: string, name: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('Authenticated user not found.');
    }

    const group = this.groupRepository.create({
      name,
      members: [user],
    });

    const savedGroup = await this.groupRepository.save(group);

    return this.serializeGroup(savedGroup);
  }

  async getGroupsForUser(userId: string) {
    const groups = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .orderBy('group.created_at', 'ASC')
      .getMany();

    return groups.map((group) => this.serializeGroup(group));
  }

  async getGroupByIdForUser(groupId: string, userId: string) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      return null;
    }

    const expenses = await this.expenseRepository.find({
      where: { group: { id: groupId } },
      relations: ['paidBy'],
      order: { createdAt: 'DESC' },
    });

    return {
      ...this.serializeGroup(group),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: Number(expense.amount),
        paidByName: expense.paidBy.displayName,
        createdAt: expense.createdAt.toISOString(),
      })),
    };
  }
}
