import { Router } from 'express';

import { listGroups } from '../controllers/groupController';
import { requireAuth } from '../middleware/auth';

export const groupRouter = Router();

groupRouter.get('/', requireAuth, listGroups);
