import { Request, Response } from 'express';

import { env } from '../../config/env';

export const authConfig = (_request: Request, response: Response): void => {
  response.json({
    localLoginEnabled: env.localLoginEnabled,
    localRegistrationEnabled: env.localRegistrationEnabled,
  });
};
