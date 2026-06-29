import { Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth';
import { GroupService } from '../services/groupService';

const groupService = new GroupService();

const VALID_EXPENSE_CATEGORIES = new Set([
  'games',
  'movies',
  'music',
  'entertainment-other',
  'sports',
  'dining-out',
  'groceries',
  'liquor',
  'food-other',
  'electronics',
  'furniture',
  'household-supplies',
  'maintenance',
  'mortgage',
  'home-other',
  'pets',
  'rent',
  'services',
  'childcare',
  'clothing',
  'education',
  'gifts',
  'insurance',
  'medical-expenses',
  'life-other',
  'taxes',
  'bicycle',
  'bus-train',
  'car',
  'gas-fuel',
  'hotel',
  'transportation-other',
  'parking',
  'plane',
  'taxi',
  'general',
  'cleaning',
  'electricity',
  'heat-gas',
  'utilities-other',
  'trash',
  'tv-phone-internet',
  'water',
 ]);

const isValidExpenseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const listGroups = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groups = await groupService.getGroupsForUser(request.auth!.userId);

  response.json({ groups });
};

export const getGroup = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const id = request.params.id as string;

  const group = await groupService.getGroupByIdForUser(id, request.auth!.userId);

  if (!group) {
    response.status(404).json({ message: 'Group not found.' });
    return;
  }

  response.json({ group });
};

export const createGroup = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const { name } = request.body as { name?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    response.status(400).json({ message: 'Group name is required.' });
    return;
  }

  try {
    const group = await groupService.createGroupForUser(request.auth!.userId, name.trim());

    response.status(201).json({ group });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to create group.' });
  }
};

export const createExpense = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const { description, amount, date, category, paidByUserId, splits } = request.body as {
    description?: unknown;
    amount?: unknown;
    date?: unknown;
    category?: unknown;
    paidByUserId?: unknown;
    splits?: unknown;
  };
  const normalizedCategory = typeof category === 'string' ? category.trim() : undefined;

  if (typeof description !== 'string' || description.trim().length === 0) {
    response.status(400).json({ message: 'Description is required.' });
    return;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    response.status(400).json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  if (date !== undefined && (typeof date !== 'string' || !isValidExpenseDate(date))) {
    response.status(400).json({ message: 'Valid expense date is required.' });
    return;
  }

  if (category !== undefined && typeof category !== 'string') {
    response.status(400).json({ message: 'Category must be a string.' });
    return;
  }

  if (normalizedCategory !== undefined && normalizedCategory.length > 0 && !VALID_EXPENSE_CATEGORIES.has(normalizedCategory)) {
    response.status(400).json({ message: 'Category must be one of the supported values.' });
    return;
  }

  if (paidByUserId !== undefined && typeof paidByUserId !== 'string') {
    response.status(400).json({ message: 'paidByUserId must be a string.' });
    return;
  }

  const resolvedPaidByUserId = typeof paidByUserId === 'string' && paidByUserId.trim().length > 0 ? paidByUserId.trim() : request.auth!.userId;

  try {
    const expense = await groupService.createExpenseForGroup(
      groupId,
      description.trim(),
      amount,
      typeof date === 'string' ? date : undefined,
      normalizedCategory && normalizedCategory.length > 0 ? normalizedCategory : undefined,
      request.auth!.userId,
      resolvedPaidByUserId,
      splits,
    );

    response.status(201).json({ expense });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to create expense.' });
  }
};

export const updateExpense = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const expenseId = request.params.expenseId as string;
  const { description, amount, date, category, splits } = request.body as {
    description?: unknown;
    amount?: unknown;
    date?: unknown;
    category?: unknown;
    splits?: unknown;
  };
  const normalizedCategory = typeof category === 'string' ? category.trim() : undefined;

  if (description !== undefined && (typeof description !== 'string' || description.trim().length === 0)) {
    response.status(400).json({ message: 'Description must be a non-empty string.' });
    return;
  }

  if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
    response.status(400).json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  if (date !== undefined && (typeof date !== 'string' || !isValidExpenseDate(date))) {
    response.status(400).json({ message: 'Valid expense date is required.' });
    return;
  }

  if (category !== undefined && typeof category !== 'string') {
    response.status(400).json({ message: 'Category must be a string.' });
    return;
  }

  if (normalizedCategory !== undefined && normalizedCategory.length > 0 && !VALID_EXPENSE_CATEGORIES.has(normalizedCategory)) {
    response.status(400).json({ message: 'Category must be one of the supported values.' });
    return;
  }

  try {
    const expense = await groupService.updateExpenseForGroup(
      groupId,
      expenseId,
      {
        description: typeof description === 'string' ? description.trim() : undefined,
        amount: typeof amount === 'number' ? amount : undefined,
        date: typeof date === 'string' ? date : undefined,
        category: normalizedCategory && normalizedCategory.length > 0 ? normalizedCategory : undefined,
        splits,
      },
      request.auth!.userId
    );

    response.status(200).json({ expense });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('own expenses'))) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update expense.' });
  }
};

export const deleteExpense = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const expenseId = request.params.expenseId as string;

  try {
    await groupService.deleteExpenseForGroup(groupId, expenseId, request.auth!.userId);

    response.status(204).send();
  } catch (error) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('own expenses'))) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete expense.' });
  }
};

export const updateGroup = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const { name } = request.body as { name?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    response.status(400).json({ message: 'Group name is required.' });
    return;
  }

  try {
    const group = await groupService.updateGroup(groupId, name.trim(), request.auth!.userId);

    response.json({ group });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update group.' });
  }
};

export const addMember = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const { email } = request.body as { email?: unknown };

  if (typeof email !== 'string' || email.trim().length === 0) {
    response.status(400).json({ message: 'Email is required.' });
    return;
  }

  try {
    const group = await groupService.addMemberByEmail(groupId, email.trim().toLowerCase(), request.auth!.userId);

    response.status(200).json({ group });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('No user found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to add member.' });
  }
};

export const removeMember = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const memberUserId = request.params.userId as string;

  try {
    await groupService.removeMember(groupId, memberUserId, request.auth!.userId);

    response.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not a member')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to remove member.' });
  }
};
