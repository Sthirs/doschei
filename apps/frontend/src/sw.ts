/// <reference lib="webworker" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

import { resolveNotificationClick } from './lib/notificationRouting';

declare const self: ServiceWorkerGlobalScope;

// ADR-0025: this file replaces vite-plugin-pwa's generated `generateSW`
// worker so it can carry a push/notificationclick handler. Everything below
// the manifest injection re-implements what the generated worker used to do
// automatically — precaching, update takeover, and (critically) the
// `/api/` navigation denylist — because none of that comes for free under
// `injectManifest`.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Without this denylist, Workbox's NavigationRoute would serve the cached
// index.html for every top-level navigation, including GET /api/auth/oauth
// — which must reach the backend to issue the OAuth redirect to the IdP.
// This mirrors the `workbox.navigateFallbackDenylist` option that only
// applies under the `generateSW` strategy (see vite.config.ts).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

// Matches the previous `registerType: 'autoUpdate'` behaviour: take over
// immediately instead of waiting for all tabs to close.
self.skipWaiting();

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: 'Do Schèi', body: '' };
  try {
    if (event.data) {
      payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) };
    }
  } catch {
    // Non-JSON payload — fall back to the default title/body above.
  }

  const url = payload.url ?? '/';

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: url,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const action = resolveNotificationClick(clientsList, url);

      if (action.type === 'focus' && 'focus' in action.client) {
        await (action.client as WindowClient).focus();
        return;
      }

      await self.clients.openWindow(action.type === 'open' ? action.url : url);
    })(),
  );
});
