import { Between } from 'typeorm';

import {
  csvEscapeField,
  formatMemberNet,
  rfc5987Filename,
  sanitizeLatin1Filename,
  type CsvExportHeaders,
  type CsvExportStream,
} from '../csvExport';
import type { GroupRepositories } from './groupRepositories';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const CSV_PAGE_SIZE = 10000;

/**
 * Returns header metadata + an async iterable of RFC-4180 CSV rows for a
 * single month's expenses. Settlements use the same per-member formula
 * as expenses (payer net = +amount, payee net = −amount) — do not invert
 * or special-case by kind. The caller sets the headers, flushes, then
 * for-await writes each row string to its sink — no Express type leaks
 * into the service layer; the in-memory profile is one page of rows
 * regardless of export size (ADR-0011 §3).
 */
export async function startExpensesCsv(
  repositories: GroupRepositories,
  groupId: string,
  userId: string,
  month: string,
): Promise<CsvExportStream> {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error('Invalid month. Expected format YYYY-MM.');
  }

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
    [
      'date',
      'description',
      'category',
      'expense',
      'currency',
      ...orderedMembers.map((m) => m.displayName),
    ]
      .map(csvEscapeField)
      .join(',') + '\r\n';

  const expenseRepository = repositories.expenseRepository;
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
              formatMemberNet(
                expense.paidBy.id,
                memberId,
                amount,
                expense.splits.map((split) => ({
                  userId: split.user.id,
                  computedAmount: Number(split.computedAmount),
                })),
              ),
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
