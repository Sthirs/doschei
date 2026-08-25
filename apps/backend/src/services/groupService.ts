import { Between, In } from 'typeorm';

import { AppDataSource } from '../db/data-source';
import { Expense } from '../entities/Expense';
import { ExpenseSplit } from '../entities/ExpenseSplit';
import { Group } from '../entities/Group';
import { Invitation } from '../entities/Invitation';
import { User } from '../entities/User';
import { csvEscapeField, formatMemberNet, rfc5987Filename, sanitizeLatin1Filename, type CsvExportHeaders, type CsvExportStream } from './csvExport';
import {
  aggregateBalance,
  aggregateNetForUser,
  computeAllocatedAmounts,
  validateSplits,
  type AggregateBalanceInput,
  type ParsedSplit,
} from './expenseSplitMath';
import { invitationService } from './invitationService';
import { buildSettlementSplit, validateSettlementInput } from './settlementRules';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const CSV_PAGE_SIZE = 10000;

type SerializedSplit = {
  userId: string;
  displayName: string;
  shareType: 'PERCENT' | 'FIXED' | 'EQUAL';
  shareValue: number;
  computedAmount: number;
};

type SerializedExpense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  paidByUserId: string;
  paidByName: string;
  date: string;
  createdAt: string;
  kind: 'EXPENSE' | 'SETTLEMENT';
  settledWithUserId: string | null;
  settledWithName: string | null;
  splits: SerializedSplit[];
};

type SerializedGroup = {
  id: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  members: { id: string; displayName: string; email: string }[];
  netForCurrentUser: number;
};

type SerializedBalanceEntry = {
  userId: string;
  displayName: string;
  netForCurrentUser: number;
};

type SerializedBalance = {
  currentUserId: string;
  currentUserName: string;
  netForCurrentUser: number;
  perUser: SerializedBalanceEntry[];
};

type PendingInvitationView = {
  id: string;
  email: string;
  createdAt: string;
};

export class GroupService {
  private groupRepository = AppDataSource.getRepository(Group);
  private expenseRepository = AppDataSource.getRepository(Expense);
  private userRepository = AppDataSource.getRepository(User);
  private splitRepository = AppDataSource.getRepository(ExpenseSplit);
  private invitationRepository = AppDataSource.getRepository(Invitation);

  private serializeGroup(group: Group, netForCurrentUser = 0): SerializedGroup {
    return {
      id: group.id,
      name: group.name,
      imageUrl: group.imageUrl,
      memberCount: group.members.length,
      members: group.members.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        email: member.email,
        imageUrl: member.imageUrl ?? null,
      })),
      netForCurrentUser,
    };
  }

  /**
   * Serializes a pending invitation for the group-detail view.
   * The invitee's displayName and id are intentionally suppressed —
   * only the email snapshot and timestamps are exposed until acceptance.
   */
  private serializePendingInvitation(invitation: Invitation): PendingInvitationView {
    return {
      id: invitation.id,
      email: invitation.inviteeEmail,
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  private serializeExpense(expense: Expense): SerializedExpense {
    return {
      id: expense.id,
      description: expense.description,
      amount: Number(expense.amount),
      category: expense.category,
      paidByUserId: expense.paidBy.id,
      paidByName: expense.paidBy.displayName,
      date: expense.date,
      createdAt: expense.createdAt.toISOString(),
      kind: expense.kind,
      settledWithUserId:
        expense.kind === 'SETTLEMENT' && (expense.splits ?? []).length > 0
          ? expense.splits[0].user.id
          : null,
      settledWithName:
        expense.kind === 'SETTLEMENT' && (expense.splits ?? []).length > 0
          ? expense.splits[0].user.displayName
          : null,
      splits: (expense.splits ?? []).map((split) => ({
        userId: split.user.id,
        displayName: split.user.displayName,
        shareType: split.shareType,
        shareValue: Number(split.shareValue),
        computedAmount: Number(split.computedAmount),
      })),
    };
  }

  private computeBalance(
    group: Group,
    expenses: SerializedExpense[],
    currentUserId: string,
  ): SerializedBalance {
    const currentMember = group.members.find((member) => member.id === currentUserId);
    const currentUserName = currentMember?.displayName ?? '';

    const aggregation = aggregateBalance(
      expenses.map((expense) => ({
        paidByUserId: expense.paidByUserId,
        splits: expense.splits.map((split) => ({
          userId: split.userId,
          computedAmount: split.computedAmount,
        })),
      })),
      currentUserId,
    );

    const perUser: SerializedBalanceEntry[] = [];
    for (const [userId, netForCurrentUser] of aggregation.perUser) {
      const otherMember = group.members.find((member) => member.id === userId);
      perUser.push({
        userId,
        displayName: otherMember?.displayName ?? '',
        netForCurrentUser,
      });
    }

    return {
      currentUserId,
      currentUserName,
      netForCurrentUser: aggregation.netForCurrentUser,
      perUser,
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
      .leftJoinAndSelect('group.members', 'member')
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

    if (groups.length === 0) {
      return [];
    }

    const groupIds = groups.map((group) => group.id);

    const expenses = await this.expenseRepository.find({
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
      this.serializeGroup(
        group,
        aggregateNetForUser(expensesByGroup.get(group.id) ?? [], userId),
      ),
    );
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
      relations: { paidBy: true, splits: { user: true } },
      order: { date: 'DESC', createdAt: 'DESC' },
    });

    const serializedExpenses = expenses.map((expense) => this.serializeExpense(expense));
    const balance = this.computeBalance(group, serializedExpenses, userId);

    const pendingInvitations = await this.invitationRepository.find({
      where: { groupId, status: 'pending' },
    });

    return {
      ...this.serializeGroup(group),
      expenses: serializedExpenses,
      balance,
      pendingInvitations: pendingInvitations.map((invitation) => this.serializePendingInvitation(invitation)),
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

  async updateGroupImage(groupId: string, imageUrl: string, userId: string) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    group.imageUrl = imageUrl;
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

    const normalizedEmail = email.trim().toLowerCase();
    const alreadyMember = group.members.some((member) => member.email === normalizedEmail);
    if (alreadyMember) {
      throw new Error('User is already a member of this group.');
    }

    return invitationService.createInvitation(groupId, normalizedEmail, userId);
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

  async createExpenseForGroup(
    groupId: string,
    description: string,
    amount: number,
    date: string | undefined,
    category: string | undefined,
    requesterUserId: string,
    paidByUserId: string,
    splitsInput: unknown,
  ) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :requesterUserId', { requesterUserId })
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

    this.assertAllSplitUsersAreMembers(splitsValidation.splits, group);

    const allocated = computeAllocatedAmounts(amount, splitsValidation.splits);

    const splitEntities = allocated.map((entry) => {
      const user = group.members.find((member) => member.id === entry.userId);
      if (!user) {
        throw new Error(`Split user ${entry.userId} is not a member of this group.`);
      }
      return this.splitRepository.create({
        user,
        shareType: entry.shareType,
        shareValue: entry.shareValue,
        computedAmount: entry.computedAmount,
      });
    });

    const expense = this.expenseRepository.create({
      description,
      amount,
      date: date ?? new Date().toISOString().slice(0, 10),
      category: category ?? 'general',
      paidBy: paidByUser,
      group,
      splits: splitEntities,
    });

    const savedExpense = await this.expenseRepository.save(expense);

    const reloaded = await this.expenseRepository.findOne({
      where: { id: savedExpense.id },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!reloaded) {
      throw new Error('Created expense could not be reloaded.');
    }

    return this.serializeExpense(reloaded);
  }

  async updateExpenseForGroup(
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
    const group = await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: expenseId, group: { id: groupId } },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!expense) {
      throw new Error('Expense not found.');
    }

    if (expense.kind === 'SETTLEMENT') {
      throw new Error('Settlements must be updated through the settlements endpoint.');
    }

    let resolvedPaidByUser: User | undefined;
    if (updates.paidByUserId !== undefined) {
      const paidByUser = group.members.find((member) => member.id === updates.paidByUserId);
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

    this.assertAllSplitUsersAreMembers(splitsValidation.splits, group);

    const allocated = computeAllocatedAmounts(effectiveAmount, splitsValidation.splits);
    const nextSplits = allocated.map((entry) => {
      const user = group.members.find((member) => member.id === entry.userId);
      if (!user) {
        throw new Error(`Split user ${entry.userId} is not a member of this group.`);
      }
      return this.splitRepository.create({
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

    const reloaded = await this.expenseRepository.findOne({
      where: { id: savedExpense.id },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!reloaded) {
      throw new Error('Updated expense could not be reloaded.');
    }

    return this.serializeExpense(reloaded);
  }

  async deleteExpenseForGroup(groupId: string, expenseId: string, userId: string) {
    await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: expenseId, group: { id: groupId } },
      relations: { paidBy: true },
    });

    if (!expense) {
      throw new Error('Expense not found.');
    }

    if (expense.kind === 'SETTLEMENT') {
      throw new Error('Settlements must be deleted through the settlements endpoint.');
    }

    await this.expenseRepository.remove(expense);
  }

  async createSettlementForGroup(
    groupId: string,
    requesterUserId: string,
    input: { paidByUserId?: unknown; paidToUserId: unknown; amount: unknown; date?: unknown },
  ) {
    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :requesterUserId', { requesterUserId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    const resolvedPayer =
      typeof input.paidByUserId === 'string' && input.paidByUserId.trim().length > 0
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

    const paidByUser = group.members.find((m) => m.id === result.settlement.paidByUserId);
    if (!paidByUser) {
      throw new Error('The selected user is not a member of this group.');
    }

    const payeeUser = group.members.find((m) => m.id === result.settlement.paidToUserId);
    if (!payeeUser) {
      throw new Error('The selected user is not a member of this group.');
    }

    const splitSpec = buildSettlementSplit(result.settlement.paidToUserId, result.settlement.amount);
    const splitEntity = this.splitRepository.create({
      user: payeeUser,
      shareType: splitSpec.shareType,
      shareValue: splitSpec.shareValue,
      computedAmount: result.settlement.amount,
    });

    const expense = this.expenseRepository.create({
      description: 'Settlement',
      amount: result.settlement.amount,
      date: result.settlement.date ?? new Date().toISOString().slice(0, 10),
      category: 'general',
      kind: 'SETTLEMENT',
      paidBy: paidByUser,
      group,
      splits: [splitEntity],
    });

    const savedExpense = await this.expenseRepository.save(expense);

    const reloaded = await this.expenseRepository.findOne({
      where: { id: savedExpense.id },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!reloaded) {
      throw new Error('Created settlement could not be reloaded.');
    }

    return this.serializeExpense(reloaded);
  }

  async updateSettlementForGroup(
    groupId: string,
    settlementId: string,
    updates: { paidByUserId?: unknown; paidToUserId?: unknown; amount?: unknown; date?: unknown },
    userId: string,
  ) {
    const group = await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: settlementId, group: { id: groupId } },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!expense || expense.kind !== 'SETTLEMENT') {
      throw new Error('Settlement not found.');
    }

    const paidByUserId =
      typeof updates.paidByUserId === 'string' && updates.paidByUserId.trim().length > 0
        ? updates.paidByUserId
        : expense.paidBy.id;
    const paidToUserId =
      typeof updates.paidToUserId === 'string' && updates.paidToUserId.trim().length > 0
        ? updates.paidToUserId
        : expense.splits[0].user.id;
    const amount = typeof updates.amount === 'number' ? updates.amount : Number(expense.amount);
    const date = typeof updates.date === 'string' ? updates.date : expense.date;

    const result = validateSettlementInput(
      { paidByUserId, paidToUserId, amount, date },
      group.members.map((m) => m.id),
    );

    if (!result.ok) {
      throw new Error(result.message);
    }

    const paidByUser = group.members.find((m) => m.id === result.settlement.paidByUserId);
    if (!paidByUser) {
      throw new Error('The selected user is not a member of this group.');
    }

    const payeeUser = group.members.find((m) => m.id === result.settlement.paidToUserId);
    if (!payeeUser) {
      throw new Error('The selected user is not a member of this group.');
    }

    const splitSpec = buildSettlementSplit(result.settlement.paidToUserId, result.settlement.amount);
    const nextSplit = this.splitRepository.create({
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

    const reloaded = await this.expenseRepository.findOne({
      where: { id: savedExpense.id },
      relations: { paidBy: true, splits: { user: true } },
    });

    if (!reloaded) {
      throw new Error('Updated settlement could not be reloaded.');
    }

    return this.serializeExpense(reloaded);
  }

  async deleteSettlementForGroup(groupId: string, settlementId: string, userId: string) {
    await this.getGroupForMember(groupId, userId);

    const expense = await this.expenseRepository.findOne({
      where: { id: settlementId, group: { id: groupId } },
      relations: { paidBy: true },
    });

    if (!expense || expense.kind !== 'SETTLEMENT') {
      throw new Error('Settlement not found.');
    }

    await this.expenseRepository.remove(expense);
  }

  /**
   * Returns header metadata + an async iterable of RFC-4180 CSV rows for a
   * single month's expenses. Settlements use the same per-member formula
   * as expenses (payer net = +amount, payee net = −amount) — do not invert
   * or special-case by kind. The caller sets the headers, flushes, then
   * for-await writes each row string to its sink — no Express type leaks
   * into the service layer; the in-memory profile is one page of rows
   * regardless of export size (ADR-0011 §3).
   */
  async startExpensesCsv(
    groupId: string,
    userId: string,
    month: string,
  ): Promise<CsvExportStream> {
    if (!MONTH_PATTERN.test(month)) {
      throw new Error('Invalid month. Expected format YYYY-MM.');
    }

    const group = await this.groupRepository
      .createQueryBuilder('group')
      .innerJoin('group.members', 'membership', 'membership.id = :userId', { userId })
      .leftJoinAndSelect('group.members', 'member')
      .where('group.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      throw new Error('Group not found or you are not a member.');
    }

    const orderedMembers = [...group.members].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );

    const year = Number(month.slice(0, 4));
    const monthNum = Number(month.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const startStr = `${year}-${pad(monthNum)}-01`;
    const endStr = `${year}-${pad(monthNum)}-${pad(lastDay)}`;

    const todayISO = new Date().toISOString().slice(0, 10);
    const safeLatin1 = sanitizeLatin1Filename(group.name);
    const rfc5987 = rfc5987Filename(group.name);

    const headers: CsvExportHeaders = {
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: `attachment; filename="${safeLatin1}-${todayISO}.csv"; filename*=UTF-8''${rfc5987}-${todayISO}.csv`,
      cacheControl: 'no-store',
    };

    const headerRow =
      ['date', 'description', 'category', 'expense', 'currency', ...orderedMembers.map((m) => m.displayName)]
        .map(csvEscapeField)
        .join(',') + '\r\n';

    const expenseRepository = this.expenseRepository;
    const memberIds = orderedMembers.map((m) => m.id);

    const rows: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        yield headerRow;
        for (let skip = 0; ; skip += CSV_PAGE_SIZE) {
          const page = await expenseRepository.find({
            where: { group: { id: groupId }, date: Between(startStr, endStr) },
      relations: { group: true, paidBy: true, splits: { user: true } },
            order: { date: 'ASC', createdAt: 'ASC' },
            take: CSV_PAGE_SIZE,
            skip,
          });

          if (page.length === 0) {
            break;
          }

          for (const expense of page) {
            const amount = Number(expense.amount);
            yield [
              expense.date,
              expense.description,
              expense.category,
              amount.toFixed(2),
              'EUR',
              ...memberIds.map((memberId) =>
                formatMemberNet(expense.paidBy.id, memberId, amount, expense.splits.map((split) => ({
                  userId: split.user.id,
                  computedAmount: Number(split.computedAmount),
                }))),
              ),
            ]
              .map(csvEscapeField)
              .join(',') + '\r\n';
          }

          if (page.length < CSV_PAGE_SIZE) {
            break;
          }
        }
      },
    };

    return { headers, rows };
  }

  private assertAllSplitUsersAreMembers(splits: ParsedSplit[], group: Group): void {
    for (const split of splits) {
      if (!group.members.some((member) => member.id === split.userId)) {
        throw new Error(`Split user ${split.userId} is not a member of this group.`);
      }
    }
  }
}
