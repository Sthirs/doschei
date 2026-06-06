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

  /**
   * Verifies the user is a member of the group and returns the group entity.
   * Throws if not found or user is not a member.
   */
  private async getGroupForMember(groupId: string, userId: string): Promise<Group> {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    return group;
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
      order: { date: 'DESC', createdAt: 'DESC' },
    });

    return {
      ...this.serializeGroup(group),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: Number(expense.amount),
        paidByName: expense.paidBy.displayName,
        date: expense.date,
        createdAt: expense.createdAt.toISOString(),
      })),
    };
  }

  async updateGroup(groupId: string, name: string, userId: string) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    group.name = name;
    const savedGroup = await this.groupRepository.save(group);

    return this.serializeGroup(savedGroup);
  }

  async addMemberByEmail(groupId: string, email: string, userId: string) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    const userToAdd = await this.userRepository.findOne({ where: { email } });

    if (!userToAdd) {
      throw new Error('No user found with that email.');
    }

    const alreadyMember = group.members.some((m) => m.id === userToAdd.id);
    if (alreadyMember) {
      throw new Error('User is already a member of this group.');
    }

    group.members.push(userToAdd);
    const savedGroup = await this.groupRepository.save(group);

    return this.serializeGroup(savedGroup);
  }

  async removeMember(groupId: string, memberUserId: string, userId: string) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
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
    await this.groupRepository.save(group);
  }

  async createExpenseForGroup(groupId: string, description: string, amount: number, date: string | undefined, userId: string) {
    const group = await this.getGroupForMember(groupId, userId);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found.');
    }

    const expense = this.expenseRepository.create({
      description,
      amount,
      date: date ?? new Date().toISOString().slice(0, 10),
      paidBy: user,
      group,
    });

    const savedExpense = await this.expenseRepository.save(expense);

    return {
      id: savedExpense.id,
      description: savedExpense.description,
      amount: Number(savedExpense.amount),
      paidByName: savedExpense.paidBy.displayName,
      date: savedExpense.date,
      createdAt: savedExpense.createdAt.toISOString(),
    };
  }

  async updateExpenseForGroup(
    groupId: string,
    expenseId: string,
    updates: { description?: string; amount?: number; date?: string },
    userId: string,
  ) {
    await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: expenseId, group: { id: groupId } },
      relations: ['paidBy'],
    });

    if (!expense) {
      throw new Error('Expense not found.');
    }

    if (updates.description !== undefined) {
      expense.description = updates.description;
    }
    if (updates.amount !== undefined) {
      expense.amount = updates.amount;
    }
    if (updates.date !== undefined) {
      expense.date = updates.date;
    }

    const savedExpense = await this.expenseRepository.save(expense);

    return {
      id: savedExpense.id,
      description: savedExpense.description,
      amount: Number(savedExpense.amount),
      paidByName: savedExpense.paidBy.displayName,
      date: savedExpense.date,
      createdAt: savedExpense.createdAt.toISOString(),
    };
  }

  async deleteExpenseForGroup(groupId: string, expenseId: string, userId: string) {
    await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: expenseId, group: { id: groupId } },
      relations: ['paidBy'],
    });

    if (!expense) {
      throw new Error('Expense not found.');
    }

    await this.expenseRepository.remove(expense);
  }
}
