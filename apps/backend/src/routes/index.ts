import { Router } from 'express';

import { authRouter } from './authRoutes';
import { groupRouter } from './groupRoutes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/groups', groupRouter);
