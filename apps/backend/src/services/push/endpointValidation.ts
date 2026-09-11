/**
 * Allowlist validation for `PushSubscription.endpoint`.
 *
 * A legitimate endpoint is minted by the **browser vendor's** push service
 * during `pushManager.subscribe()` (RFC 8030) — the app never chooses it, and
 * it can therefore only ever live on one of a small set of vendor origins.
 * Self-hosting the VAPID keypair (ADR-0025) does not change that: the last hop
 * to a sleeping browser is always relayed by the vendor's push service, so
 * this backend cannot be the one delivering it.
 *
 * That matters for more than correctness. `webPushClient.sendToSubscription`
 * POSTs to this URL verbatim, so an unvalidated `endpoint` is a server-side
 * request forgery primitive: any authenticated user could register an internal
 * address and have the backend dereference it on the next notification
 * dispatch (`pushDispatch.ts`), reaching cluster-internal services that are
 * not exposed through the ingress. Constraining the origin enforces the
 * protocol invariant that already holds for every real subscription rather
 * than restricting anything a browser can legitimately produce.
 */

/**
 * Host suffixes of the push services shipped browsers actually use. A
 * candidate host matches when it equals an entry or is a subdomain of one
 * (WNS, for instance, hands out per-region hosts like
 * `wns2-pn.notify.windows.com`).
 */
export const DEFAULT_PUSH_HOST_SUFFIXES: readonly string[] = [
  'fcm.googleapis.com', // Chrome, Edge, and every other Chromium browser
  'android.googleapis.com', // legacy GCM endpoints still held by old clients
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari / iOS 16.4+
  'notify.windows.com', // WNS, used by pre-Chromium Edge
];

/**
 * Whole-host patterns, for a vendor that spreads its push service across a
 * family of hosts rather than one subdomain.
 *
 * Chrome does not always hand out an `fcm.googleapis.com` endpoint: it also
 * uses numbered GCM hosts, and the browser driven by
 * `tests/e2e/push-notifications.spec.ts` mints
 * `https://jmt17.google.com/fcm/send/…`. The pattern admits that family and
 * nothing else — `accounts.google.com` and a lookalike like
 * `jmt17.google.com.evil.test` both stay rejected, because these are matched
 * against the whole hostname rather than as a suffix.
 */
export const DEFAULT_PUSH_HOST_PATTERNS: readonly RegExp[] = [
  /^jmt\d+\.google\.com$/,
];

/**
 * Endpoints are opaque vendor URLs, but they are not unbounded — this is a
 * sanity ceiling so a malicious client cannot use the column as free storage.
 */
const MAX_ENDPOINT_LENGTH = 2048;

const REJECTION_MESSAGE =
  'endpoint must be a URL issued by a supported push service.';

export type EndpointValidation =
  | { ok: true; endpoint: string }
  | { ok: false; message: string };

const hostIsAllowed = (
  hostname: string,
  allowedHostSuffixes: readonly string[],
): boolean =>
  allowedHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  ) || DEFAULT_PUSH_HOST_PATTERNS.some((pattern) => pattern.test(hostname));

/**
 * Validates a client-supplied `endpoint`, returning the trimmed value on
 * success. `extraHostSuffixes` widens the shipped defaults for a deployment
 * whose users are on a browser with a push service not listed above; it is
 * never a way to point notifications at the deployment itself.
 *
 * Every rejection shares one message: the endpoint is not user-authored data,
 * so a client that sends a bad one has a bug rather than a typo to correct, and
 * a uniform reply keeps this from doubling as a probe for which internal hosts
 * resolve.
 */
export const validatePushEndpoint = (
  raw: unknown,
  extraHostSuffixes: readonly string[] = [],
): EndpointValidation => {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'endpoint is required.' };
  }

  const endpoint = raw.trim();
  if (endpoint.length === 0) {
    return { ok: false, message: 'endpoint is required.' };
  }
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, message: REJECTION_MESSAGE };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, message: REJECTION_MESSAGE };
  }

  // `web-push` always speaks TLS, and no push service publishes a plaintext
  // endpoint — so anything else is either a mistake or an attempt to reach
  // something that is not a push service.
  if (parsed.protocol !== 'https:') {
    return { ok: false, message: REJECTION_MESSAGE };
  }

  // Embedded credentials never appear in a real endpoint and are a classic way
  // to make a URL's authority read differently to a human than to a parser.
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { ok: false, message: REJECTION_MESSAGE };
  }

  if (
    !hostIsAllowed(parsed.hostname, [
      ...DEFAULT_PUSH_HOST_SUFFIXES,
      ...extraHostSuffixes,
    ])
  ) {
    return { ok: false, message: REJECTION_MESSAGE };
  }

  return { ok: true, endpoint };
};
