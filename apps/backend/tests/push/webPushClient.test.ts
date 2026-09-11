/**
 * Unit tests for `sendToSubscription`'s endpoint guard.
 *
 * `createSubscription` allowlists the endpoint at the API boundary, but rows
 * written before that validation existed are still in `push_subscriptions` —
 * and this function is what actually dereferences the URL. So it re-checks,
 * and reports `'gone'` on a rejected endpoint so `dispatchNotification` prunes
 * the row instead of retrying it on every future notification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: {
    // Push disabled keeps `webpush.setVapidDetails` from running at import
    // time; it does not gate `sendToSubscription` itself.
    pushEnabled: false,
    pushEndpointExtraHostSuffixes: [] as string[],
  },
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));

const { sendNotificationMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(async () => undefined),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: sendNotificationMock,
  },
}));

import { sendToSubscription } from '../../src/services/push/webPushClient';

const keys = { p256dh: 'p', auth: 'a' };

describe('sendToSubscription', () => {
  beforeEach(() => {
    envMock.pushEndpointExtraHostSuffixes = [];
    sendNotificationMock.mockClear();
    sendNotificationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends to a legitimate push-service endpoint', async () => {
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', ...keys },
      '{}',
    );

    expect(result).toBe('sent');
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the in-cluster Kubernetes API', 'https://kubernetes.default.svc/api/v1/namespaces'],
    ['loopback', 'https://127.0.0.1:3000/api/groups'],
    ['the link-local metadata address', 'https://169.254.169.254/latest/meta-data/'],
    ['plaintext http', 'http://fcm.googleapis.com/fcm/send/abc123'],
  ])(
    'never dereferences a stored endpoint pointing at %s, and reports it prunable',
    async (_label, endpoint) => {
      const result = await sendToSubscription({ endpoint, ...keys }, '{}');

      expect(result).toBe('gone');
      expect(sendNotificationMock).not.toHaveBeenCalled();
    },
  );

  it('honours an operator-configured extra host', async () => {
    envMock.pushEndpointExtraHostSuffixes = ['push.self-hosted.test'];

    const result = await sendToSubscription(
      { endpoint: 'https://push.self-hosted.test/wpush/v2/abc', ...keys },
      '{}',
    );

    expect(result).toBe('sent');
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['410 Gone', 410],
    ['404 Not Found', 404],
  ])('maps a %s from the push service to a prunable result', async (_label, statusCode) => {
    sendNotificationMock.mockRejectedValue({ statusCode });

    const result = await sendToSubscription(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', ...keys },
      '{}',
    );

    expect(result).toBe('gone');
  });

  it('maps any other transport failure to an error without throwing', async () => {
    sendNotificationMock.mockRejectedValue({ statusCode: 500 });

    const result = await sendToSubscription(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', ...keys },
      '{}',
    );

    expect(result).toBe('error');
  });
});
