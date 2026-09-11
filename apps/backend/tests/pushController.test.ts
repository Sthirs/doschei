/**
 * Unit tests for the push subscription controller
 * (`controllers/push/pushHandlers.ts`) using supertest against
 * `createApp()`. `AuthService.findById` is stubbed (matching
 * `groupController.test.ts`) so `requireAuth` resolves without touching
 * Postgres, and the subscription store module is mocked outright since it
 * is a set of plain functions rather than a class.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// createApp() eagerly wires every route module, including the expense/
// settlement/invitation services that import `webPushClient.ts`, which calls
// `webpush.setVapidDetails` at import time whenever `pushEnabled` is true —
// so these have to be well-formed VAPID keys, not arbitrary test strings.
// Generated fresh each run rather than hardcoded so no real key material
// ever sits in the repo (gitleaks flags a hardcoded pair as a secret). A
// dynamic `import()` inside an async vi.hoisted factory, not a static
// `import` at the top of the file — vi.hoisted's factory runs before the
// file's own static imports resolve, so an imported binding isn't available
// here yet, but `vi.hoisted` can be awaited when the factory is async.
const { envMock } = await vi.hoisted(async () => {
  const vapidKeys = (await import('web-push')).generateVAPIDKeys();
  return {
    envMock: {
      pushEnabled: true,
      VAPID_PUBLIC_KEY: vapidKeys.publicKey,
      VAPID_PRIVATE_KEY: vapidKeys.privateKey,
      VAPID_SUBJECT: 'mailto:test@doschei.local',
      pushEndpointExtraHostSuffixes: [] as string[],
      NODE_ENV: 'test',
      CORS_ORIGIN: 'http://doschei.test',
      JWT_SECRET: 'test-jwt-secret',
      ACCESS_TOKEN_TTL_SECONDS: 3600,
      REFRESH_TOKEN_TTL_SECONDS: 7776000,
      REFRESH_TOKEN_REUSE_GRACE_SECONDS: 30,
    },
  };
});

vi.mock('../src/config/env', () => ({ env: envMock }));

vi.mock('../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({})),
    transaction: vi.fn(),
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

vi.mock('../src/services/push/pushSubscriptionStore', () => ({
  upsertSubscription: vi.fn(async () => undefined),
  deleteByEndpointForUser: vi.fn(async () => undefined),
}));

import { createApp } from '../src/app';
import { AuthService } from '../src/services/authService';
import {
  deleteByEndpointForUser,
  upsertSubscription,
} from '../src/services/push/pushSubscriptionStore';

const upsertSubscriptionMock = vi.mocked(upsertSubscription);
const deleteByEndpointForUserMock = vi.mocked(deleteByEndpointForUser);

const JWT_SECRET = 'test-jwt-secret';
const AUTH_USER = {
  id: 'u1',
  email: 'u@doschei.local',
  displayName: 'U',
  language: 'en' as const,
};

function bearerAuth() {
  return {
    Authorization: `Bearer ${jwt.sign({ userId: AUTH_USER.id, email: AUTH_USER.email }, JWT_SECRET)}`,
  };
}

describe('push routes', () => {
  beforeEach(() => {
    vi.spyOn(AuthService.prototype, 'findById').mockResolvedValue(
      AUTH_USER as never,
    );
    envMock.pushEnabled = true;
    envMock.pushEndpointExtraHostSuffixes = [];
    upsertSubscriptionMock.mockClear();
    deleteByEndpointForUserMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    envMock.pushEnabled = true;
    envMock.pushEndpointExtraHostSuffixes = [];
  });

  describe('GET /api/push/public-key', () => {
    it('returns the VAPID public key when push is enabled', async () => {
      const app = createApp();
      const response = await request(app).get('/api/push/public-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ publicKey: envMock.VAPID_PUBLIC_KEY });
    });

    it('returns 503 when push is disabled', async () => {
      envMock.pushEnabled = false;

      const app = createApp();
      const response = await request(app).get('/api/push/public-key');

      expect(response.status).toBe(503);
    });

    it('requires no authentication', async () => {
      const app = createApp();
      const response = await request(app).get('/api/push/public-key');

      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/push/subscriptions', () => {
    it('401s without a bearer token', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'p', auth: 'a' } });

      expect(response.status).toBe(401);
      expect(upsertSubscriptionMock).not.toHaveBeenCalled();
    });

    it('400s when endpoint is missing', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .set(bearerAuth())
        .send({ keys: { p256dh: 'p', auth: 'a' } });

      expect(response.status).toBe(400);
    });

    it('400s when keys are missing', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .set(bearerAuth())
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' });

      expect(response.status).toBe(400);
    });

    it('201s and upserts the subscription for the authenticated user', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .set(bearerAuth())
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          keys: { p256dh: 'p', auth: 'a' },
        });

      expect(response.status).toBe(201);
      expect(upsertSubscriptionMock).toHaveBeenCalledWith(
        AUTH_USER.id,
        'https://fcm.googleapis.com/fcm/send/abc123',
        'p',
        'a',
      );
    });

    // Regression: `endpoint` used to be accepted on type alone, so any
    // authenticated user could store an internal address that the backend then
    // POSTed to on the next notification dispatch — an SSRF reachable from a
    // plain user account. The store must never see such a value.
    it.each([
      ['the in-cluster Kubernetes API', 'https://kubernetes.default.svc/api/v1/namespaces/doschei/pods'],
      ['an in-cluster service', 'https://doschei-postgres.doschei.svc.cluster.local:5432/'],
      ['loopback', 'https://127.0.0.1:3000/api/groups'],
      ['the link-local metadata address', 'https://169.254.169.254/latest/meta-data/'],
      ['a lookalike of an allowed host', 'https://fcm.googleapis.com.evil.test/fcm/send/x'],
      ['an allowed host in the credentials section', 'https://fcm.googleapis.com@169.254.169.254/'],
      ['plaintext http on an allowed host', 'http://fcm.googleapis.com/fcm/send/abc123'],
    ])('400s and stores nothing when the endpoint targets %s', async (_label, endpoint) => {
      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .set(bearerAuth())
        .send({ endpoint, keys: { p256dh: 'p', auth: 'a' } });

      expect(response.status).toBe(400);
      expect(upsertSubscriptionMock).not.toHaveBeenCalled();
    });

    it('accepts a host an operator added via PUSH_ENDPOINT_ALLOWLIST', async () => {
      envMock.pushEndpointExtraHostSuffixes = ['push.self-hosted.test'];

      const app = createApp();
      const response = await request(app)
        .post('/api/push/subscriptions')
        .set(bearerAuth())
        .send({
          endpoint: 'https://push.self-hosted.test/wpush/v2/abc',
          keys: { p256dh: 'p', auth: 'a' },
        });

      expect(response.status).toBe(201);
      expect(upsertSubscriptionMock).toHaveBeenCalledWith(
        AUTH_USER.id,
        'https://push.self-hosted.test/wpush/v2/abc',
        'p',
        'a',
      );
    });
  });

  describe('DELETE /api/push/subscriptions', () => {
    it('401s without a bearer token', async () => {
      const app = createApp();
      const response = await request(app)
        .delete('/api/push/subscriptions')
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' });

      expect(response.status).toBe(401);
      expect(deleteByEndpointForUserMock).not.toHaveBeenCalled();
    });

    it('400s when endpoint is missing', async () => {
      const app = createApp();
      const response = await request(app)
        .delete('/api/push/subscriptions')
        .set(bearerAuth())
        .send({});

      expect(response.status).toBe(400);
    });

    it('204s and deletes the subscription scoped to the authenticated user', async () => {
      const app = createApp();
      const response = await request(app)
        .delete('/api/push/subscriptions')
        .set(bearerAuth())
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' });

      expect(response.status).toBe(204);
      expect(deleteByEndpointForUserMock).toHaveBeenCalledWith(
        AUTH_USER.id,
        'https://fcm.googleapis.com/fcm/send/abc123',
      );
    });
  });
});
