import type { Repository, SelectQueryBuilder } from 'typeorm';

import type { Expense } from '../../entities/Expense';
import type { BalanceRow } from './balanceRows';

/**
 * The only user columns an expense read needs: `serializeExpense` exposes
 * the payer's and each split user's id + displayName, nothing else.
 *
 * Selecting them explicitly — instead of `find({ relations })`, which also
 * pulls the `eager` relations with every column — keeps `users.image_url`
 * (a base64 data URL, ADR-0019) out of the expense × split join. Fetching it
 * per joined row turned a 135-expense group into ~10 MB read from Postgres
 * per request, only for the serializer to drop it.
 */
export const EXPENSE_USER_COLUMNS = ['id', 'displayName'] as const;

const userColumns = (alias: string) =>
  EXPENSE_USER_COLUMNS.map((column) => `${alias}.${column}`);

/**
 * Expenses with their payer, splits and split users, loading only the
 * columns `serializeExpense` reads. QueryBuilder never auto-joins `eager`
 * relations, so this is the complete set of columns fetched.
 */
export function selectSerializableExpenses(
  expenseRepository: Repository<Expense>,
): SelectQueryBuilder<Expense> {
  return expenseRepository
    .createQueryBuilder('expense')
    .leftJoin('expense.paidBy', 'paidBy')
    .addSelect(userColumns('paidBy'))
    .leftJoinAndSelect('expense.splits', 'split')
    .leftJoin('split.user', 'splitUser')
    .addSelect(userColumns('splitUser'));
}

/** A group's expenses, newest first — the group-detail list order. */
export function findGroupExpenses(
  expenseRepository: Repository<Expense>,
  groupId: string,
): Promise<Expense[]> {
  return selectSerializableExpenses(expenseRepository)
    .where('expense.group_id = :groupId', { groupId })
    .orderBy('expense.date', 'DESC')
    .addOrderBy('expense.createdAt', 'DESC')
    .getMany();
}

/** One expense, ready for `serializeExpense` (e.g. the reload after a save). */
export function findSerializableExpense(
  expenseRepository: Repository<Expense>,
  expenseId: string,
): Promise<Expense | null> {
  return selectSerializableExpenses(expenseRepository)
    .where('expense.id = :expenseId', { expenseId })
    .getOne();
}

/**
 * The four columns the groups-list balance needs, one row per
 * expense × split, for every given group.
 */
export function findBalanceRows(
  expenseRepository: Repository<Expense>,
  groupIds: string[],
): Promise<BalanceRow[]> {
  return expenseRepository
    .createQueryBuilder('expense')
    .leftJoin('expense.splits', 'split')
    .select('expense.group_id', 'group_id')
    .addSelect('expense.id', 'expense_id')
    .addSelect('expense.paid_by_id', 'paid_by_id')
    .addSelect('split.user_id', 'split_user_id')
    .addSelect('split.computed_amount', 'split_computed_amount')
    .where('expense.group_id IN (:...groupIds)', { groupIds })
    .getRawMany<BalanceRow>();
}
