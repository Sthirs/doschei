import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';

import { env } from './config/env';
import { apiRouter } from './routes';
import { UnsupportedImageTypeError } from './services/imageService';

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

  // `credentials: true` so the ADR-0023 refresh cookie is not dropped if the
  // app and API are ever served from different origins. Every environment is
  // same-origin behind one ingress today, so this changes nothing now — but it
  // requires CORS_ORIGIN to stay a concrete origin and never '*'.
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  // No CSRF token, by design (ADR-0023): the refresh cookie is sameSite
  // 'strict' and CORS never allows a foreign origin; the OAuth state cookie is
  // itself the anti-CSRF check for the callback.
  // codeql[js/missing-token-validation]
  app.use(cookieParser());

  app.get('/api/health', healthHandler);

  app.use(apiRateLimiter);

  app.use('/api', apiRouter);

  // Multer / image-service error handler — must be after routes
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({ message: 'File too large.' });
        return;
      }
      response.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof UnsupportedImageTypeError) {
      response.status(415).json({ message: error.message });
      return;
    }
    if (response.headersSent) {
      _next(error);
      return;
    }
    // Client errors raised by middleware (malformed JSON body, oversize
    // payload) keep their status; `expose` marks messages safe to return.
    const { status, expose, message } = (error ?? {}) as {
      status?: unknown;
      expose?: unknown;
      message?: unknown;
    };
    if (typeof status === 'number' && status >= 400 && status < 500) {
      response.status(status).json({
        message:
          expose === true && typeof message === 'string'
            ? message
            : 'Bad request.',
      });
      return;
    }
    // Anything else is a bug: log it, and answer in JSON like every other
    // endpoint instead of Express's HTML page (which includes the stack trace
    // outside production).
    console.error('[api] Unhandled error', error);
    response.status(500).json({ message: 'Internal server error.' });
  });

  return app;
};
