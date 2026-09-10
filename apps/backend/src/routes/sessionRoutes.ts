import { Router } from 'express';

import { logout, refresh } from '../controllers/authController';

/**
 * Mounted at `/api/auth/session` (see routes/index.ts), which is also the path
 * the refresh cookie is scoped to — so the secret reaches exactly these two
 * endpoints and nothing else. Neither route is behind `requireAuth`: the
 * cookie is the credential (ADR-0023).
 */
export const sessionRouter = Router();

sessionRouter.post('/refresh', refresh);
sessionRouter.post('/logout', logout);
