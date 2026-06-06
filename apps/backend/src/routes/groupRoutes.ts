import { Router } from 'express';

import { createGroup, getGroup, listGroups } from '../controllers/groupController';
import { requireAuth } from '../middleware/auth';

export const groupRouter = Router();

groupRouter.get('/', requireAuth, listGroups);
groupRouter.get('/:id', requireAuth, getGroup);
groupRouter.post('/', requireAuth, createGroup);
