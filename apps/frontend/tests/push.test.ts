import { afterEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

import {
  ensurePushSubscription,
  removePushSubscription,
  setupPushNotifications,
  urlBase64ToUint8Array,
} from '@/lib/push';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiDelete.mockReset();
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url-encoded VAPID key into raw bytes', () => {
    // "hello" base64url-encoded (no padding, matching a VAPID key's format)
    const result = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles the URL-safe -/_ substitutions', () => {
    // Bytes [0xfb, 0xff] standard-base64 as "-/8" for URL-safe; regular
    // base64 would use "+/8=". Round-tripping via atob confirms the swap.
    const decoded = urlBase64ToUint8Array('-_8');
    const standard = Uint8Array.from(atob('+/8='), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(standard));
  });
});

describe('ensurePushSubscription', () => {
  it('no-ops when the Push API is unsupported (no navigator.serviceWorker/PushManager)', async () => {
    await ensurePushSubscription();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('no-ops when notification permission is not granted', async () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    const notificationStub = { permission: 'default' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    await ensurePushSubscription();

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('subscribes and posts the subscription when none exists yet', async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example.com/x',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      }),
    });
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: subscribeMock,
      },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);
    mockApiGet.mockResolvedValue({ data: { publicKey: 'aGVsbG8' } });

    await ensurePushSubscription();

    expect(mockApiGet).toHaveBeenCalledWith('/push/public-key');
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(mockApiPost).toHaveBeenCalledWith('/push/subscriptions', {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });
  });

  it('reuses an existing subscription without fetching the public key again', async () => {
    const existingSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/existing',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    };
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existingSubscription),
        subscribe: vi.fn(),
      },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    await ensurePushSubscription();

    expect(mockApiGet).not.toHaveBeenCalled();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/push/subscriptions', {
      endpoint: 'https://push.example.com/existing',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('swallows a rejecting API call instead of throwing', async () => {
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn(),
      },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);
    mockApiGet.mockRejectedValue(new Error('network error'));

    await expect(ensurePushSubscription()).resolves.toBeUndefined();
  });
});

describe('removePushSubscription', () => {
  it('no-ops when the Push API is unsupported', async () => {
    await removePushSubscription();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active subscription', async () => {
    const registration = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    await removePushSubscription();

    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('DELETEs the subscription by endpoint when one exists', async () => {
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: 'https://push.example.com/x',
        }),
      },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    await removePushSubscription();

    expect(mockApiDelete).toHaveBeenCalledWith('/push/subscriptions', {
      data: { endpoint: 'https://push.example.com/x' },
    });
  });

  it('settles even when navigator.serviceWorker.ready never resolves', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: new Promise(() => {}),
        getRegistration: vi.fn().mockResolvedValue(undefined),
      },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    await expect(removePushSubscription()).resolves.toBeUndefined();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });
});

describe('setupPushNotifications', () => {
  it('no-ops when the Push API is unsupported', () => {
    setupPushNotifications();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('subscribes immediately when permission is already granted', async () => {
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: 'https://push.example.com/x',
          toJSON: () => ({
            endpoint: 'https://push.example.com/x',
            keys: { p256dh: 'p', auth: 'a' },
          }),
        }),
      },
    };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    const notificationStub = { permission: 'granted' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);

    setupPushNotifications();
    // ensurePushSubscription is fire-and-forget from setupPushNotifications
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApiPost).toHaveBeenCalledWith('/push/subscriptions', {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('does nothing beyond checking permission when it is denied', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    const notificationStub = { permission: 'denied' };
    vi.stubGlobal('window', { PushManager: class {}, Notification: notificationStub });
    vi.stubGlobal('Notification', notificationStub);
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    setupPushNotifications();

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'pointerdown',
      expect.anything(),
      expect.anything(),
    );
  });
});
