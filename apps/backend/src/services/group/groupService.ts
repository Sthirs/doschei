import type { CsvExportStream } from '../csvExport';
import * as expenseCrud from './expenseCrud';
import * as csvExport from './expensesCsvExport';
import * as groupCrud from './groupCrud';
import * as groupMembership from './groupMembership';
import {
  createGroupRepositories,
  type GroupRepositories,
} from './groupRepositories';
import * as settlementCrud from './settlementCrud';

/**
 * Facade over the group domain modules. The public method surface is the
 * contract consumed by `groupController.ts` (a module-level singleton) and
 * spied on via `GroupService.prototype` in the controller tests, so every
 * method must stay a prototype method with an unchanged signature.
 */
export class GroupService {
  private repositories: GroupRepositories = createGroupRepositories();

  async createGroupForUser(userId: string, name: string) {
    return groupCrud.createGroupForUser(this.repositories, userId, name);
  }

  async getGroupsForUser(userId: string) {
    return groupCrud.getGroupsForUser(this.repositories, userId);
  }

  async getGroupByIdForUser(groupId: string, userId: string) {
    return groupCrud.getGroupByIdForUser(this.repositories, groupId, userId);
  }

  async updateGroup(groupId: string, name: string, userId: string) {
    return groupCrud.updateGroup(this.repositories, groupId, name, userId);
  }

  async updateGroupImage(groupId: string, imageUrl: string, userId: string) {
    return groupCrud.updateGroupImage(
      this.repositories,
      groupId,
      imageUrl,
      userId,
    );
  }

  async addMemberByEmail(groupId: string, email: string, userId: string) {
    return groupMembership.addMemberByEmail(
      this.repositories,
      groupId,
      email,
      userId,
    );
  }

  async removeMember(groupId: string, memberUserId: string, userId: string) {
    return groupMembership.removeMember(
      this.repositories,
      groupId,
      memberUserId,
      userId,
    );
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
    return expenseCrud.createExpenseForGroup(
      this.repositories,
      groupId,
      description,
      amount,
      date,
      category,
      requesterUserId,
      paidByUserId,
      splitsInput,
    );
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
    return expenseCrud.updateExpenseForGroup(
      this.repositories,
      groupId,
      expenseId,
      updates,
      userId,
    );
  }

  async deleteExpenseForGroup(
    groupId: string,
    expenseId: string,
    userId: string,
  ) {
    return expenseCrud.deleteExpenseForGroup(
      this.repositories,
      groupId,
      expenseId,
      userId,
    );
  }

  async createSettlementForGroup(
    groupId: string,
    requesterUserId: string,
    input: {
      paidByUserId?: unknown;
      paidToUserId: unknown;
      amount: unknown;
      date?: unknown;
    },
  ) {
    return settlementCrud.createSettlementForGroup(
      this.repositories,
      groupId,
      requesterUserId,
      input,
    );
  }

  async updateSettlementForGroup(
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
    return settlementCrud.updateSettlementForGroup(
      this.repositories,
      groupId,
      settlementId,
      updates,
      userId,
    );
  }

  async deleteSettlementForGroup(
    groupId: string,
    settlementId: string,
    userId: string,
  ) {
    return settlementCrud.deleteSettlementForGroup(
      this.repositories,
      groupId,
      settlementId,
      userId,
    );
  }

  async startExpensesCsv(
    groupId: string,
    userId: string,
    month: string,
  ): Promise<CsvExportStream> {
    return csvExport.startExpensesCsv(
      this.repositories,
      groupId,
      userId,
      month,
    );
  }
}
