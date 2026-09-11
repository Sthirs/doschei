import { api } from '@/lib/api';

/**
 * Web Push wiring (ADR-0025). No settings UI exists for this feature — it is
 * enabled by default, and the browser's own notification permission is the
 * only control (docs/specifications.md §Product Decisions). Every side
 * effect here is guarded and every failure swallowed: a user on a browser
 * without Push support, or one who has denied permission, must see nothing
 * different at all.
 */

/** Pure — VAPID public keys arrive base64url-encoded; PushManager wants raw bytes. */
// TS 5.7+'s DOM lib parameterizes TypedArrays by their backing buffer
// (`Uint8Array<ArrayBuffer>` vs the wider `Uint8Array<ArrayBufferLike>`, which
// also covers SharedArrayBuffer); PushManager.subscribe's
// `applicationServerKey: BufferSource` only accepts the former, so the return
// type has to say so explicitly — a bare `Uint8Array` annotation widens back
// to `ArrayBufferLike` regardless of what the implementation constructs.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const isPushSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

const subscriptionBody = (subscription: PushSubscription) => {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  };
};

/**
 * Subscribes the current registration to push (if not already subscribed)
 * and upserts it server-side. Called at boot when permission is already
 * `granted`, and again after a first-gesture permission grant — this is
 * also the mechanism that re-establishes a subscription lost to
 * ADR-0020's unregister-all-service-workers-on-deploy behaviour, since the
 * boot path runs again after that reload.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { data } = await api.get<{ publicKey?: string }>('/push/public-key');
      if (!data.publicKey) return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    await api.post('/push/subscriptions', subscriptionBody(subscription));
  } catch {
    // Best-effort: a user with push disabled at the OS level, or a
    // transient network failure, must not affect anything else at boot.
  }
}

/** DELETEs the current subscription server-side. Called on logout. */
export async function removePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await api.delete('/push/subscriptions', {
      data: { endpoint: subscription.endpoint },
    });
  } catch {
    // Best-effort — logout must proceed either way.
  }
}

/**
 * One-shot request for notification permission, fired from the first
 * `pointerdown` after sign-in. Firefox and Safari reject a bare
 * `requestPermission()` call made without a user gesture; Chrome allows it
 * but penalizes it with the quiet-permission-UI heuristic. Riding the
 * user's first tap avoids both.
 */
async function requestPermissionAndSubscribe(): Promise<void> {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await ensurePushSubscription();
    }
  } catch {
    // Best-effort.
  }
}

// Guards against attaching more than one listener across repeated
// `setupPushNotifications()` calls (it is called on every access-token
// renewal, not just once at boot — see main.ts).
let gestureListenerAttached = false;

/**
 * Wires push notifications into the authenticated session, with no settings
 * UI: already-granted permission subscribes immediately, `default`
 * permission is requested on the user's next gesture, and `denied`
 * permission is never asked again. Safe to call repeatedly.
 */
export function setupPushNotifications(): void {
  if (!isPushSupported()) return;

  if (Notification.permission === 'granted') {
    void ensurePushSubscription();
    return;
  }

  if (Notification.permission === 'default' && !gestureListenerAttached) {
    gestureListenerAttached = true;
    const handler = () => {
      document.removeEventListener('pointerdown', handler);
      gestureListenerAttached = false;
      void requestPermissionAndSubscribe();
    };
    document.addEventListener('pointerdown', handler, { once: true });
  }
}
