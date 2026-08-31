import type { Repository } from 'typeorm';

import { AppDataSource } from '../../db/data-source';
import { Expense } from '../../entities/Expense';
import { ExpenseSplit } from '../../entities/ExpenseSplit';
import { Group } from '../../entities/Group';
import { Invitation } from '../../entities/Invitation';
import { User } from '../../entities/User';

/**
 * The set of TypeORM repositories the group service modules operate on.
 * They are resolved once per `GroupService` instance (not at module load)
 * so the data source is only touched when a service is constructed.
 */
export type GroupRepositories = {
  groupRepository: Repository<Group>;
  expenseRepository: Repository<Expense>;
  userRepository: Repository<User>;
  splitRepository: Repository<ExpenseSplit>;
  invitationRepository: Repository<Invitation>;
};

export function createGroupRepositories(): GroupRepositories {
  return {
    groupRepository: AppDataSource.getRepository(Group),
    expenseRepository: AppDataSource.getRepository(Expense),
    userRepository: AppDataSource.getRepository(User),
    splitRepository: AppDataSource.getRepository(ExpenseSplit),
    invitationRepository: AppDataSource.getRepository(Invitation),
  };
}
