import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { apiRouter } from './routes';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);

  return app;
};
