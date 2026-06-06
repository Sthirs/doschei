import { Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth';
import { GroupService } from '../services/groupService';

const groupService = new GroupService();

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
  const { description, amount } = request.body as { description?: unknown; amount?: unknown };

  if (typeof description !== 'string' || description.trim().length === 0) {
    response.status(400).json({ message: 'Description is required.' });
    return;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    response.status(400).json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  try {
    const expense = await groupService.createExpenseForGroup(
      groupId,
      description.trim(),
      amount,
      request.auth!.userId
    );

    response.status(201).json({ expense });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to create expense.' });
  }
};

export const updateExpense = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groupId = request.params.id as string;
  const expenseId = request.params.expenseId as string;
  const { description, amount } = request.body as { description?: unknown; amount?: unknown };

  if (description !== undefined && (typeof description !== 'string' || description.trim().length === 0)) {
    response.status(400).json({ message: 'Description must be a non-empty string.' });
    return;
  }

  if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
    response.status(400).json({ message: 'Valid amount greater than 0 is required.' });
    return;
  }

  try {
    const expense = await groupService.updateExpenseForGroup(
      groupId,
      expenseId,
      {
        description: typeof description === 'string' ? description.trim() : undefined,
        amount: typeof amount === 'number' ? amount : undefined,
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

