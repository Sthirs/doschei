import { Router } from 'express';

import { authRouter } from './authRoutes';
import { groupRouter } from './groupRoutes';
import { oauthRouter } from './oauthRoutes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/auth/oauth', oauthRouter);
apiRouter.use('/groups', groupRouter);
