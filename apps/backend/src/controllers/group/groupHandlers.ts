import { Response } from 'express';

import { AuthedRequest, AuthenticatedRequest } from '../../middleware/auth';
import { invitationService } from '../../services/invitationService';
import { groupService } from './groupServiceInstance';

export const listGroups = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const groups = await groupService.getGroupsForUser(auth.userId);
  const invitations = await invitationService.listPendingForInvitee(
    auth.userId,
  );

  response.json({ groups, invitations });
};

export const getGroup = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const id = request.params.id as string;

  const group = await groupService.getGroupByIdForUser(id, auth.userId);

  if (!group) {
    response.status(404).json({ message: 'Group not found.' });
    return;
  }

  response.json({ group });
};

export const createGroup = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const { name } = request.body as { name?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    response.status(400).json({ message: 'Group name is required.' });
    return;
  }

  try {
    const group = await groupService.createGroupForUser(
      auth.userId,
      name.trim(),
    );

    response.status(201).json({ group });
  } catch (error: unknown) {
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to create group.',
    });
  }
};

export const updateGroup = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const groupId = request.params.id as string;
  const { name } = request.body as { name?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    response.status(400).json({ message: 'Group name is required.' });
    return;
  }

  try {
    const group = await groupService.updateGroup(
      groupId,
      name.trim(),
      auth.userId,
    );

    response.json({ group });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to update group.',
    });
  }
};
