import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { apiRouter } from './routes';

const healthHandler = (_request: express.Request, response: express.Response) => {
  response.json({ status: 'ok' });
};

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', healthHandler);

  app.use('/api', apiRouter);

  return app;
};
