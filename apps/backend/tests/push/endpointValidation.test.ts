/**
 * Unit tests for `services/push/endpointValidation.ts` — the allowlist that
 * keeps a client-supplied `endpoint` from turning `sendToSubscription` into an
 * SSRF primitive (see the module comment there).
 */
import { describe, expect, it } from 'vitest';

import { validatePushEndpoint } from '../../src/services/push/endpointValidation';

describe('validatePushEndpoint', () => {
  describe('endpoints a real browser produces', () => {
    it.each([
      ['Chrome/Edge (FCM)', 'https://fcm.googleapis.com/fcm/send/abc123:XYZ'],
      ['legacy GCM', 'https://android.googleapis.com/gcm/send/abc123'],
      [
        'Firefox',
        'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABtoken',
      ],
      ['Safari / iOS', 'https://web.push.apple.com/QAbc123DEF'],
      ['WNS regional host', 'https://wns2-pn.notify.windows.com/w/?token=abc'],
      // The host a real Chrome actually minted while this allowlist was being
      // built — see DEFAULT_PUSH_HOST_PATTERNS.
      ['Chrome numbered GCM host', 'https://jmt17.google.com/fcm/send/ecPHl-TxqsY:APA91bER'],
      ['another host in the same GCM family', 'https://jmt42.google.com/fcm/send/abc'],
    ])('accepts %s', (_label, endpoint) => {
      const result = validatePushEndpoint(endpoint);

      expect(result).toEqual({ ok: true, endpoint });
    });

    it('trims surrounding whitespace and returns the cleaned value', () => {
      const result = validatePushEndpoint(
        '  https://fcm.googleapis.com/fcm/send/abc  ',
      );

      expect(result).toEqual({
        ok: true,
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      });
    });
  });

  describe('SSRF targets', () => {
    it.each([
      ['in-cluster Kubernetes API', 'https://kubernetes.default.svc/api/v1/namespaces'],
      ['in-cluster Postgres service', 'https://doschei-postgres.doschei.svc.cluster.local:5432/'],
      ['loopback', 'https://127.0.0.1:3000/api/groups'],
      ['loopback by name', 'https://localhost/api/groups'],
      ['link-local metadata address', 'https://169.254.169.254/latest/meta-data/'],
      ['private RFC1918 address', 'https://10.244.1.118:5432/'],
    ])('rejects %s', (_label, endpoint) => {
      expect(validatePushEndpoint(endpoint).ok).toBe(false);
    });

    it('rejects a lookalike host that merely contains an allowed one', () => {
      expect(
        validatePushEndpoint('https://fcm.googleapis.com.evil.test/fcm/send/x')
          .ok,
      ).toBe(false);
    });

    // The Chrome GCM family is matched as a whole hostname, not a suffix, so it
    // must not become a way in for the rest of the domain or for lookalikes.
    it.each([
      ['a non-push Google host', 'https://accounts.google.com/o/oauth2/token'],
      ['the bare domain', 'https://google.com/'],
      ['a lookalike of the GCM family', 'https://jmt17.google.com.evil.test/fcm/send/x'],
      ['a subdomain under the GCM family', 'https://evil.jmt17.google.com/fcm/send/x'],
      ['the family pattern without digits', 'https://jmt.google.com/fcm/send/x'],
    ])('rejects %s', (_label, endpoint) => {
      expect(validatePushEndpoint(endpoint).ok).toBe(false);
    });

    it('rejects an allowed host smuggled into the credentials section', () => {
      expect(
        validatePushEndpoint(
          'https://fcm.googleapis.com@169.254.169.254/latest/meta-data/',
        ).ok,
      ).toBe(false);
    });

    it('rejects a non-https scheme on an otherwise allowed host', () => {
      expect(
        validatePushEndpoint('http://fcm.googleapis.com/fcm/send/abc').ok,
      ).toBe(false);
    });

    it.each([
      ['file', 'file:///etc/passwd'],
      ['gopher', 'gopher://127.0.0.1:5432/_'],
    ])('rejects the %s scheme', (_label, endpoint) => {
      expect(validatePushEndpoint(endpoint).ok).toBe(false);
    });
  });

  describe('malformed input', () => {
    it.each([
      ['a non-string', 42],
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
      ['whitespace only', '   '],
    ])('rejects %s with the required-field message', (_label, raw) => {
      const result = validatePushEndpoint(raw);

      expect(result).toEqual({ ok: false, message: 'endpoint is required.' });
    });

    it('rejects an unparsable URL', () => {
      expect(validatePushEndpoint('not-a-url').ok).toBe(false);
    });

    it('rejects an endpoint past the length ceiling', () => {
      const tooLong = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(2048)}`;

      expect(validatePushEndpoint(tooLong).ok).toBe(false);
    });

    it('uses one message for every allowlist rejection, so it cannot be used to probe hosts', () => {
      const internal = validatePushEndpoint('https://kubernetes.default.svc/');
      const external = validatePushEndpoint('https://evil.test/');

      expect(internal.ok).toBe(false);
      expect(external.ok).toBe(false);
      expect(internal).toEqual(external);
    });
  });

  describe('operator-configured extra hosts', () => {
    it('accepts a host added through the extra suffixes', () => {
      const endpoint = 'https://push.self-hosted.test/wpush/v2/abc';

      expect(validatePushEndpoint(endpoint, ['push.self-hosted.test'])).toEqual({
        ok: true,
        endpoint,
      });
    });

    it('accepts a subdomain of an extra suffix', () => {
      expect(
        validatePushEndpoint('https://eu1.push.self-hosted.test/x', [
          'push.self-hosted.test',
        ]).ok,
      ).toBe(true);
    });

    it('still requires https on an extra host', () => {
      expect(
        validatePushEndpoint('http://push.self-hosted.test/x', [
          'push.self-hosted.test',
        ]).ok,
      ).toBe(false);
    });

    it('keeps the shipped defaults working alongside extras', () => {
      expect(
        validatePushEndpoint('https://fcm.googleapis.com/fcm/send/abc', [
          'push.self-hosted.test',
        ]).ok,
      ).toBe(true);
    });
  });
});
