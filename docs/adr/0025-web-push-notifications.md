# ADR-0025: Web Push notifications for ledger and invitation events

- **Status:** 🟡 proposed
- **Date:** 2026-09-11
- **Deciders:** Sthirs

## Context

`docs/specifications.md` §Features now requires that members involved in an expense
or settlement receive a device notification when another member creates, edits, or
deletes it, and that invitees receive one when invited to a group. §Product Decisions
requires the notification to be delivered by the operating system when the app is
installed as a PWA — not as an in-app banner — and to be enabled by default with no
in-app setting; the browser's own notification permission is the only control.

Today the app is entirely pull-based: nothing in the repo produces a notification of
any kind. There is no `web-push` dependency, no subscription storage, no custom
service worker, and no notification UI.

The only web-standard mechanism that can deliver an OS-level notification to an
installed PWA while the app is not in the foreground (and, on Android, while it isn't
even running) is the **Web Push API**: a service worker registers a
`PushSubscription` with the browser's push service, the server holds that
subscription and later sends an encrypted payload to it via VAPID (RFC 8292)
credentials, and the browser wakes the service worker to fire a `push` event even
when no tab is open. This works in installed PWAs on Chrome, Firefox, Edge, and
(from 16.4) Safari/iOS; it does not work in a bare Safari tab that hasn't been
"Added to Home Screen".

Three existing accepted decisions bear directly on the design:

- [ADR-0002](0002-frontend-stack.md) established `vite-plugin-pwa` but did not pick
  a build strategy explicitly; the project has been running on the plugin's default,
  `generateSW`, which auto-generates the service worker and offers no hook for
  custom `push` / `notificationclick` handlers.
- [ADR-0018](0018-internationalization-en-it.md) established that UI strings are
  localized in the frontend via `vue-i18n`, driven by the signed-in user's live
  locale state.
- [ADR-0020](0020-client-cache-lifecycle-on-deploy.md) established that on every
  detected deploy, the client unregisters **every** service worker and purges the
  Cache API to guarantee freshness. Unregistering a service worker destroys any push
  subscription registered under it — a direct interaction with this feature that has
  to be designed for, not discovered later.

## Decision

We will implement OS-level notifications using the **Web Push API with self-hosted
VAPID credentials** (the `web-push` npm package on the backend), and will switch
`vite-plugin-pwa` from `generateSW` to **`injectManifest`** so the service worker can
carry a hand-written `push` and `notificationclick` handler alongside Workbox
precaching. Notification text is composed and localized **server-side**, using the
recipient's saved `User.language`, and the client re-establishes its push
subscription at every app boot to absorb the subscription loss caused by
ADR-0020's unregister-on-deploy behaviour.

A client-supplied `PushSubscription.endpoint` is **validated against an allowlist
of push-service origins** before it is stored or sent to. Self-hosting the VAPID
keypair does not make this deployment the sender of last hop: under RFC 8030 the
endpoint is always minted by the browser vendor's push service, so a legitimate
value can only ever live on one of a small set of vendor origins. Since the
backend later POSTs to that URL verbatim, accepting an arbitrary one would let
any authenticated user aim a server-side request at a cluster-internal address
that the ingress does not expose. The allowlist is therefore enforcing an
invariant the protocol already guarantees, not narrowing what a browser can
produce. A deployment whose users run a browser with a push service outside the
shipped defaults can extend the list via `PUSH_ENDPOINT_ALLOWLIST`.

## Alternatives considered

- **Polling / periodic background sync** — the client would periodically ask the
  API for new events. Not chosen: it cannot deliver a notification while the app is
  fully closed (no open tab, no running service worker instance to poll from), which
  fails the "native OS notification, app not open" requirement outright, and it adds
  battery/network cost for no benefit over push.
- **Server-Sent Events / WebSockets** — real-time delivery, but only while a
  connection is open, i.e. only while a tab is in the foreground or a persistent
  background connection is kept alive. Neither is available to a backgrounded or
  killed PWA on Android; SSE/WS cannot wake a suspended service worker the way a
  push event can. Rejected for the same reason as polling.
- **A third-party push service (Firebase Cloud Messaging, OneSignal, etc.)** — these
  wrap Web Push (and native push on other platforms) behind a vendor SDK and
  account. Not chosen for a first iteration: they require a vendor account and
  external dependency for a PWA-only, browser-native use case that the standard Web
  Push API already covers unassisted; self-hosted VAPID keeps the whole feature
  inside the existing backend/Helm chart with no new external service, consistent
  with the project's "cloud native, self-contained Helm chart" posture
  (`docs/specifications.md` §Architecture, [ADR-0007](0007-kubernetes-helm-deployment.md)).
- **Keeping `generateSW` and layering push on top via `additionalManifestEntries` /
  plugin hooks** — `generateSW` has no supported extension point for custom
  `push`/`notificationclick` listeners; only `injectManifest` (a hand-written worker
  source file with Workbox precaching injected into it) exposes the raw service
  worker to add them. This is a `vite-plugin-pwa` documented limitation, not a
  workaround-able one.
- **Client-side notification text using `vue-i18n`** — the app's existing
  internationalization pattern. Not usable for push: the recipient's browser/device
  is not connected when the server composes and sends the payload (that is the whole
  point of push — it wakes a sleeping client), so there is no live `vue-i18n` locale
  to render against. The server must render finished text.

## Sources / Prior art

- `docs/specifications.md` §Features, §Product Decisions, §Architecture — the
  notification requirement and the recipient/localization/best-effort rules this ADR
  implements.
- [ADR-0002](0002-frontend-stack.md) — frontend/PWA stack; this ADR supersedes only
  its implicit `generateSW` posture, nothing else in it.
- [ADR-0018](0018-internationalization-en-it.md) — internationalization pattern;
  this ADR carves out a scoped, push-payload-only exception to it.
- [ADR-0020](0020-client-cache-lifecycle-on-deploy.md) — the deploy-time
  unregister-all-service-workers behaviour this feature must coexist with.
- [ADR-0021](0021-module-size-ceiling-and-split-convention.md) — governs how the new
  backend `services/push/` module is split into files.
- MDN, *Push API* and *Using the Notifications API* — event/permission model.
- [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030) *Generic Event Delivery Using
  HTTP Push* — establishes that the push service (and therefore the endpoint
  origin) belongs to the user agent's vendor, which is what makes an origin
  allowlist on `endpoint` sound.
- [web-push-libs/web-push](https://github.com/web-push-libs/web-push) (npm
  `web-push`) — the Node.js library used for VAPID signing and payload encryption.
- [vite-plugin-pwa docs, "Service Worker strategies: generateSW vs injectManifest"](https://vite-pwa-org.netlify.app/guide/) —
  confirms `generateSW` has no custom-event extension point and `injectManifest` is
  the documented way to add one.

## Consequences

- Positive: members get real OS notification-shade entries for the ledger changes
  and invitations that affect them, on an installed PWA, without any third-party
  push vendor or account.
- Positive: the VAPID keypair is a self-hosted secret managed the same way as every
  other backend secret ([ADR-0007](0007-kubernetes-helm-deployment.md)'s
  secrets-by-reference pattern), so no new operational dependency is introduced.
- Positive: because the whole feature degrades to a no-op when VAPID keys are
  absent from the environment, it ships without breaking any deployment, test run,
  or environment that hasn't provisioned keys yet.
- Negative / trade-off: switching to `injectManifest` moves precaching and
  navigation-fallback configuration (notably the `/api/` navigation denylist that
  keeps `GET /api/auth/oauth` reaching the backend instead of being served cached
  `index.html`) from plugin configuration into hand-written worker code, which is
  easier to regress silently; it needs its own regression test.
- Negative / trade-off: server-side notification text is a scoped exception to
  ADR-0018's frontend-localization pattern. It only applies to push payloads; it
  does not change where any other user-facing string lives.
- Negative / trade-off: ADR-0020's unregister-all-service-workers-on-deploy
  behaviour destroys every user's push subscription on every deploy. This is
  mitigated, not eliminated, by re-subscribing at boot and by pruning subscriptions
  server-side on a `410 Gone`/`404` response from the push service — but a user who
  does not reopen the app after a deploy will not receive notifications again until
  they do. This trade-off is accepted rather than re-designing ADR-0020, since
  weakening the freshness guarantee it provides would reintroduce the white-screen
  problem it was written to solve.
- Negative / trade-off: the endpoint allowlist is a list of third-party hostnames
  living in this repo, so a vendor introducing a new push-service origin needs a
  code change (or an operator's `PUSH_ENDPOINT_ALLOWLIST` entry) before those
  users can subscribe. Accepted: the alternative is dereferencing an
  attacker-chosen URL from inside the cluster, and the list changes very rarely.
  This is not a theoretical cost — Chrome turned out to also mint endpoints on
  numbered GCM hosts (`jmt17.google.com`), which the first draft of the list
  rejected outright; that family is now matched by whole-hostname pattern rather
  than by widening the allowlist to all of `google.com`. A vendor host that goes
  unnoticed fails closed and silently: the subscribe POST 400s and that user
  simply never receives notifications, so `tests/e2e/push-notifications.spec.ts`
  asserts the **response** to the real browser's subscribe call, not just that
  the call was made.
- Follow-ups: notification copy (EN/IT) for each event kind is drafted as part of
  the implementation and should get a product-text review pass rather than being
  treated as final on first merge.
- Follow-ups: if a native (non-PWA) mobile wrapper is ever built, this ADR's choice
  of Web Push alone (no FCM/APNs) will need revisiting, since native push channels
  are not reachable from Web Push.
