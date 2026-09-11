import { Router } from 'express';

import {
  createSubscription,
  deleteSubscription,
  getPublicKey,
} from '../controllers/push/pushHandlers';
import { requireAuth } from '../middleware/auth';

export const pushRouter = Router();

pushRouter.get('/public-key', getPublicKey);
pushRouter.post('/subscriptions', requireAuth, createSubscription);
pushRouter.delete('/subscriptions', requireAuth, deleteSubscription);
