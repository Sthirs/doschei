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

/**
 * ADR-0030: the group a push payload is about, so the page can mark that
 * group's cached data stale. Push URLs are `/groups/:id` (backend
 * `notifyLedgerChange` / `notifyInvitation`). Anything else yields `null`.
 */
export function groupIdFromPushUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null;
  let pathname: string;
  try {
    pathname = new URL(url, 'https://app.invalid').pathname;
  } catch {
    return null;
  }
  const match = /^\/groups\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
