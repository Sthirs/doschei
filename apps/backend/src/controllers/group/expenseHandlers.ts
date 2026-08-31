import { Response } from 'express';

import { AuthenticatedRequest } from '../../middleware/auth';
import {
  isValidExpenseDate,
  VALID_EXPENSE_CATEGORIES,
} from './expenseValidation';
import { groupService } from './groupServiceInstance';

type ExpenseBody = {
  description?: unknown;
  amount?: unknown;
  date?: unknown;
  category?: unknown;
  paidByUserId?: unknown;
  splits?: unknown;
};

export const createExpense = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const { description, amount, date, category, paidByUserId, splits } =
    request.body as ExpenseBody;
  const normalizedCategory =
    typeof category === 'string' ? category.trim() : undefined;

  if (typeof description !== 'string' || description.trim().length === 0) {
    response.status(400).json({ message: 'Description is required.' });
    return;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    response
      .status(400)
      .json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  if (
    date !== undefined &&
    (typeof date !== 'string' || !isValidExpenseDate(date))
  ) {
    response.status(400).json({ message: 'Valid expense date is required.' });
    return;
  }

  if (category !== undefined && typeof category !== 'string') {
    response.status(400).json({ message: 'Category must be a string.' });
    return;
  }

  if (
    normalizedCategory !== undefined &&
    normalizedCategory.length > 0 &&
    !VALID_EXPENSE_CATEGORIES.has(normalizedCategory)
  ) {
    response
      .status(400)
      .json({ message: 'Category must be one of the supported values.' });
    return;
  }

  if (paidByUserId !== undefined && typeof paidByUserId !== 'string') {
    response.status(400).json({ message: 'paidByUserId must be a string.' });
    return;
  }

  const resolvedPaidByUserId =
    typeof paidByUserId === 'string' && paidByUserId.trim().length > 0
      ? paidByUserId.trim()
      : request.auth!.userId;

  try {
    const expense = await groupService.createExpenseForGroup(
      groupId,
      description.trim(),
      amount,
      typeof date === 'string' ? date : undefined,
      normalizedCategory && normalizedCategory.length > 0
        ? normalizedCategory
        : undefined,
      request.auth!.userId,
      resolvedPaidByUserId,
      splits,
    );

    response.status(201).json({ expense });
  } catch (error: unknown) {
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to create expense.',
    });
  }
};

export const updateExpense = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const expenseId = request.params.expenseId as string;
  const { description, amount, date, category, paidByUserId, splits } =
    request.body as ExpenseBody;
  const normalizedCategory =
    typeof category === 'string' ? category.trim() : undefined;

  if (
    description !== undefined &&
    (typeof description !== 'string' || description.trim().length === 0)
  ) {
    response
      .status(400)
      .json({ message: 'Description must be a non-empty string.' });
    return;
  }

  if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
    response
      .status(400)
      .json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  if (
    date !== undefined &&
    (typeof date !== 'string' || !isValidExpenseDate(date))
  ) {
    response.status(400).json({ message: 'Valid expense date is required.' });
    return;
  }

  if (category !== undefined && typeof category !== 'string') {
    response.status(400).json({ message: 'Category must be a string.' });
    return;
  }

  if (
    normalizedCategory !== undefined &&
    normalizedCategory.length > 0 &&
    !VALID_EXPENSE_CATEGORIES.has(normalizedCategory)
  ) {
    response
      .status(400)
      .json({ message: 'Category must be one of the supported values.' });
    return;
  }

  if (paidByUserId !== undefined && typeof paidByUserId !== 'string') {
    response.status(400).json({ message: 'paidByUserId must be a string.' });
    return;
  }

  try {
    const expense = await groupService.updateExpenseForGroup(
      groupId,
      expenseId,
      {
        description:
          typeof description === 'string' ? description.trim() : undefined,
        amount: typeof amount === 'number' ? amount : undefined,
        date: typeof date === 'string' ? date : undefined,
        category:
          normalizedCategory && normalizedCategory.length > 0
            ? normalizedCategory
            : undefined,
        paidByUserId:
          typeof paidByUserId === 'string' && paidByUserId.trim().length > 0
            ? paidByUserId.trim()
            : undefined,
        splits,
      },
      request.auth!.userId,
    );

    response.status(200).json({ expense });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('own expenses'))
    ) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to update expense.',
    });
  }
};

export const deleteExpense = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const expenseId = request.params.expenseId as string;

  try {
    await groupService.deleteExpenseForGroup(
      groupId,
      expenseId,
      request.auth!.userId,
    );

    response.status(204).send();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('own expenses'))
    ) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to delete expense.',
    });
  }
};
