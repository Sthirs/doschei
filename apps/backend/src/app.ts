import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

import { env } from './config/env';
import { apiRouter } from './routes';

const healthHandler = (_request: express.Request, response: express.Response) => {
  response.json({ status: 'ok' });
};

export const createApp = () => {
  const app = express();

  // Trust reverse-proxy headers (X-Forwarded-Proto / -Host / -For) ONLY when
  // the immediate peer is on a private / loopback / link-local address range.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Global per-IP limiter for all /api routes; /api/health is registered
  // before this middleware and therefore stays unthrottled for k8s probes.
  const apiRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', healthHandler);

  app.use(apiRateLimiter);

  app.use('/api', apiRouter);

  return app;
};
