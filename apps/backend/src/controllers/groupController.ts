import { Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth';
import { GroupService } from '../services/groupService';

const groupService = new GroupService();

export const listGroups = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groups = await groupService.getGroupsForUser(request.auth!.userId);

  response.json({ groups });
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
