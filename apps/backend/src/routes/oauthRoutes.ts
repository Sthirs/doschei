import { Router } from 'express';

import { oauthCallback, oauthConfig, oauthInitiate } from '../controllers/oauthController';

export const oauthRouter = Router();

oauthRouter.get('/config', oauthConfig);
oauthRouter.get('/callback', oauthCallback);
oauthRouter.get('/', oauthInitiate);
