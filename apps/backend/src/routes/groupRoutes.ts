import { Router } from 'express';

import { createGroup, listGroups } from '../controllers/groupController';
import { requireAuth } from '../middleware/auth';

export const groupRouter = Router();

groupRouter.get('/', requireAuth, listGroups);
groupRouter.post('/', requireAuth, createGroup);
