/**
 * Pure routing decision for sw.ts's `notificationclick` handler, pulled out
 * of the worker so it is unit-testable: Chrome only allows
 * `WindowClient.focus()`/`Clients.openWindow()` to run off a trusted,
 * user-activated event, so nothing that calls them can be exercised from an
 * automated test (see tests/e2e/push-notifications.spec.ts's comment on the
 * same restriction). This function carries no side effects, so it can be.
 */
export type ClientLike = { url: string };

export type NotificationClickAction<T extends ClientLike> =
  | { type: 'focus'; client: T }
  | { type: 'open'; url: string };

export function resolveNotificationClick<T extends ClientLike>(
  clientsList: readonly T[],
  targetUrl: string,
): NotificationClickAction<T> {
  const existing = clientsList.find((client) => {
    try {
      return new URL(client.url).pathname === targetUrl;
    } catch {
      return false;
    }
  });

  return existing ? { type: 'focus', client: existing } : { type: 'open', url: targetUrl };
}
