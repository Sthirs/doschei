import { Router } from 'express';

import { authConfig, login, me, register, updateName } from '../controllers/authController';
import { requireAuth, requireLocalAuthEnabled } from '../middleware/auth';
import { env } from '../config/env';

export const authRouter = Router();

authRouter.post('/register', requireLocalAuthEnabled(env.localRegistrationEnabled, 'Local registration is disabled.', 'local_registration_disabled'), register);
authRouter.post('/login', requireLocalAuthEnabled(env.localLoginEnabled, 'Local login is disabled.', 'local_login_disabled'), login);
authRouter.get('/config', authConfig);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/me', requireAuth, updateName);
