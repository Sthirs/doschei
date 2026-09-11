import webpush from 'web-push';

import { env } from '../../config/env';
import { validatePushEndpoint } from './endpointValidation';

if (env.pushEnabled) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string,
  );
}

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendResult = 'sent' | 'gone' | 'error';

/**
 * Sends one payload to one subscription. `'gone'` is the ONLY garbage
 * collection signal Web Push offers for a dead endpoint (ADR-0025 §5) — the
 * caller must delete the subscription row on that result, or the table
 * grows forever across every deploy (ADR-0020 unsubscribes everyone on
 * every deploy).
 */
export const sendToSubscription = async (
  subscription: PushSubscriptionKeys,
  payload: string,
): Promise<PushSendResult> => {
  // Re-checked here, not just at the API boundary, because this is the line
  // that actually dereferences the endpoint — and because rows written before
  // that validation existed are still in the table. Reporting `'gone'` makes
  // the caller prune them, so the table heals itself on the next dispatch.
  if (!validatePushEndpoint(subscription.endpoint, env.pushEndpointExtraHostSuffixes).ok) {
    return 'gone';
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
    );
    return 'sent';
  } catch (error: unknown) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 410 || statusCode === 404) {
      return 'gone';
    }
    return 'error';
  }
};
