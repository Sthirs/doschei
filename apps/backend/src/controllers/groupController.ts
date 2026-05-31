import { Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth';
import { GroupService } from '../services/groupService';

const groupService = new GroupService();

export const listGroups = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const groups = await groupService.getGroupsForUser(request.auth!.userId);

  response.json({ groups });
};
