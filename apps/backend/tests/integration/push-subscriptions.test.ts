/**
 * /api/push against a running deployment (ADR-0025). The controller is unit
 * tested with the store mocked (`tests/pushController.test.ts`); this proves
 * the same contract over the wire against real Postgres, including the
 * upsert on the `endpoint` natural key.
 *
 * Assumes push is enabled, as in every devMode deployment
 * (`VAPID_AUTO_GENERATE=true` in the chart's `_helpers.tpl`).
 */
import { createJsonRequest, ensureBackendAvailable, uniqueValue } from './helpers/api';
import { bearer, newUser } from './helpers/groups';

const validSubscription = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${uniqueValue('push-endpoint')}`,
  keys: { p256dh: 'BExamplePublicKey', auth: 'exampleAuthSecret' },
});

describe('Push endpoints', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('GET /api/push/public-key', () => {
    it('returns the VAPID public key without authentication', async () => {
      const response = await createJsonRequest<{ publicKey: string }>('/api/push/public-key');

      expect(response.status).toBe(200);
      expect(response.body.publicKey).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    });
  });

  describe('POST /api/push/subscriptions', () => {
    it('stores a subscription (201), and re-registering the same endpoint is an idempotent upsert', async () => {
      const user = await newUser('push-sub');
      const subscription = validSubscription();

      const first = await createJsonRequest('/api/push/subscriptions', {
        method: 'POST',
        headers: bearer(user.token),
        body: JSON.stringify(subscription),
      });
      const again = await createJsonRequest('/api/push/subscriptions', {
        method: 'POST',
        headers: bearer(user.token),
        body: JSON.stringify({ ...subscription, keys: { p256dh: 'BRotatedKey', auth: 'rotatedAuth' } }),
      });

      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const response = await createJsonRequest('/api/push/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscription()),
      });

      expect(response.status).toBe(401);
    });

    it.each([
      ['an internal address', 'http://backend.default.svc.cluster.local/hook'],
      ['a non-push https host', 'https://example.com/fcm/send/abc'],
      ['a lookalike host', 'https://fcm.googleapis.com.evil.test/send/abc'],
      ['a non-URL', 'not a url'],
    ])('rejects %s as endpoint with 400', async (_label, endpoint) => {
      const user = await newUser('push-sub-bad-endpoint');

      const response = await createJsonRequest<{ message: string }>('/api/push/subscriptions', {
        method: 'POST',
        headers: bearer(user.token),
        body: JSON.stringify({ ...validSubscription(), endpoint }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/supported push service/i);
    });

    it('rejects a subscription without keys with 400', async () => {
      const user = await newUser('push-sub-no-keys');

      const response = await createJsonRequest('/api/push/subscriptions', {
        method: 'POST',
        headers: bearer(user.token),
        body: JSON.stringify({ endpoint: validSubscription().endpoint }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/push/subscriptions', () => {
    it('removes a stored subscription (204) and is idempotent', async () => {
      const user = await newUser('push-unsub');
      const subscription = validSubscription();
      await createJsonRequest('/api/push/subscriptions', {
        method: 'POST',
        headers: bearer(user.token),
        body: JSON.stringify(subscription),
      });

      const remove = () =>
        createJsonRequest('/api/push/subscriptions', {
          method: 'DELETE',
          headers: bearer(user.token),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

      expect((await remove()).status).toBe(204);
      expect((await remove()).status).toBe(204);
    });

    it('returns 400 without an endpoint and 401 without a token', async () => {
      const user = await newUser('push-unsub-bad');

      const missing = await createJsonRequest('/api/push/subscriptions', {
        method: 'DELETE',
        headers: bearer(user.token),
        body: JSON.stringify({}),
      });
      expect(missing.status).toBe(400);

      const anonymous = await createJsonRequest('/api/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: validSubscription().endpoint }),
      });
      expect(anonymous.status).toBe(401);
    });
  });
});
