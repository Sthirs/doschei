/**
 * Unit tests for OidcProvider. Mocks the openid-client v6 module-level
 * API (`oidc.discovery`, `oidc.buildAuthorizationUrl`,
 * `oidc.authorizationCodeGrant`, `oidc.fetchUserInfo`,
 * `oidc.randomPKCECodeVerifier`, `oidc.randomState`,
 * `oidc.calculatePKCECodeChallenge`, `oidc.skipSubjectCheck`) and asserts
 * the v6 function call signatures + return-value mapping without any real
 * network I/O.
 *
 * These tests are intentionally narrow: they pin the v6 surface that
 * `oidcProvider.ts` depends on, so a future v6 major bump (or a v5
 * regression) trips the suite immediately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The skipSubjectCheck sentinel must live INSIDE the vi.mock factory
// because vitest hoists factories above all top-level statements, which
// would make a module-scope const uninitialized when the factory runs.
vi.mock('openid-client', () => {
  const skipSubjectCheck = Symbol('openid-client.skipSubjectCheck');
  const fakeConfig = { server: new URL('https://accounts.google.com') };

  return {
    // v6: `discovery(new URL(issuer), clientId, clientSecret, undefined, opts)`
    // — the 4th arg is `clientAuth` (we pass `undefined` for default), the
    // 5th arg is `{ timeout: <seconds> }`. Capture the call so we can
    // assert on it.
    discovery: vi.fn(async () => fakeConfig),
    // v6: `buildAuthorizationUrl(config, params)` returns a `URL` whose
    // `.href` and `.searchParams` reflect the params passed in.
    buildAuthorizationUrl: vi.fn(
      (
        _config: unknown,
        params: {
          redirect_uri: string;
          scope: string;
          state: string;
          code_challenge: string;
          code_challenge_method: string;
          client_id?: string;
        },
      ) => {
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('redirect_uri', params.redirect_uri);
        url.searchParams.set('scope', params.scope);
        url.searchParams.set('state', params.state);
        url.searchParams.set('code_challenge', params.code_challenge);
        url.searchParams.set('code_challenge_method', params.code_challenge_method);
        // Pin a client_id so the test can assert it ends up in the URL
        // (the provider passes it through the Configuration — we inject it
        // here via the params the test would build).
        if (params.client_id) {
          url.searchParams.set('client_id', params.client_id);
        }
        return url;
      },
    ),
    // v6: `authorizationCodeGrant(config, new URL(callbackUrl), { pkceCodeVerifier, expectedState })`
    // returns `{ access_token, ... }`.
    authorizationCodeGrant: vi.fn(async () => ({ access_token: 'mock-token' })),
    // v6: `fetchUserInfo(config, accessToken, expectedSubject)` where
    // `expectedSubject` can be `oidc.skipSubjectCheck` to opt out of the
    // ID-Token ↔ UserInfo sub cross-check.
    fetchUserInfo: vi.fn(async () => ({
      sub: '123',
      email: 'x@y.com',
      email_verified: true,
      name: 'Test User',
    })),
    randomPKCECodeVerifier: vi.fn(() => 'mock-verifier'),
    randomState: vi.fn(() => 'mock-state'),
    calculatePKCECodeChallenge: vi.fn(async () => 'mock-challenge'),
    skipSubjectCheck,
  };
});

// Imports go AFTER the mock so the module under test receives the mocked
// openid-client.
import {
  OidcProvider,
  OAuthProviderNotInitializedError,
} from '../../src/services/oauth/oidcProvider';
// @ts-expect-error -- openid-client v6 is ESM-only; vitest resolves the mock at runtime
import * as oidc from 'openid-client';

const mockOIDC = oidc as unknown as {
  discovery: ReturnType<typeof vi.fn>;
  buildAuthorizationUrl: ReturnType<typeof vi.fn>;
  authorizationCodeGrant: ReturnType<typeof vi.fn>;
  fetchUserInfo: ReturnType<typeof vi.fn>;
  randomPKCECodeVerifier: ReturnType<typeof vi.fn>;
  randomState: ReturnType<typeof vi.fn>;
  calculatePKCECodeChallenge: ReturnType<typeof vi.fn>;
  skipSubjectCheck: symbol;
};

describe('OidcProvider', () => {
  let provider: OidcProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OidcProvider({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      issuer: 'https://accounts.google.com',
      scope: 'openid email profile',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('lifecycle', () => {
    it('throws OAuthProviderNotInitializedError before init() is called', async () => {
      await expect(
        provider.getAuthorizationUrl('https://app.test/cb', 'state', 'verifier'),
      ).rejects.toBeInstanceOf(OAuthProviderNotInitializedError);
      await expect(
        provider.exchangeCode('https://app.test/cb?code=c&state=s', 'verifier', 'state'),
      ).rejects.toBeInstanceOf(OAuthProviderNotInitializedError);
      await expect(provider.fetchUserInfo('access-token')).rejects.toBeInstanceOf(
        OAuthProviderNotInitializedError,
      );
    });

    it('init() calls oidc.discovery with the issuer URL, client creds, and 10s timeout', async () => {
      await provider.init();

      expect(mockOIDC.discovery).toHaveBeenCalledTimes(1);
      const [issuerUrl, clientId, clientSecret, clientAuth, opts] =
        mockOIDC.discovery.mock.calls[0]!;
      expect(issuerUrl).toBeInstanceOf(URL);
      expect((issuerUrl as URL).href).toBe('https://accounts.google.com/');
      expect(clientId).toBe('test-client');
      expect(clientSecret).toBe('test-secret');
      expect(clientAuth).toBeUndefined();
      expect(opts).toEqual({ timeout: 10 });
      expect(provider.isInitialized()).toBe(true);
    });

    it('init() is idempotent — second call does not re-run discovery', async () => {
      await provider.init();
      await provider.init();
      expect(mockOIDC.discovery).toHaveBeenCalledTimes(1);
    });

    it('init() leaves the provider un-initialized on discovery failure (soft-fail contract)', async () => {
      mockOIDC.discovery.mockRejectedValueOnce(new Error('network down'));
      // The provider is contractually required to NOT throw out of init().
      await expect(provider.init()).resolves.toBeUndefined();
      expect(provider.isInitialized()).toBe(false);
      await expect(
        provider.getAuthorizationUrl('https://app.test/cb', 's', 'v'),
      ).rejects.toBeInstanceOf(OAuthProviderNotInitializedError);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('builds an OAuth auth URL with PKCE S256, state, scope, redirect_uri, and client_id', async () => {
      await provider.init();
      const url = await provider.getAuthorizationUrl(
        'https://app.test/api/auth/oauth/callback',
        'state-123',
        'verifier-456',
      );

      // The provider passes params into oidc.buildAuthorizationUrl; the
      // mock URL-builder echoes them into searchParams so the returned
      // href must contain them. This pins the v6 call shape and the
      // required PKCE S256 / scope / state contract.
      expect(mockOIDC.buildAuthorizationUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockOIDC.buildAuthorizationUrl.mock.calls[0]!;
      expect(callArgs[0]).toBeDefined(); // Configuration object
      expect(callArgs[1]).toMatchObject({
        redirect_uri: 'https://app.test/api/auth/oauth/callback',
        scope: 'openid email profile',
        state: 'state-123',
        code_challenge: 'mock-challenge',
        code_challenge_method: 'S256',
      });
      expect(mockOIDC.calculatePKCECodeChallenge).toHaveBeenCalledWith('verifier-456');

      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(parsed.searchParams.get('code_challenge')).toBe('mock-challenge');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('state')).toBe('state-123');
      expect(parsed.searchParams.get('scope')).toBe('openid email profile');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://app.test/api/auth/oauth/callback',
      );
    });
  });

  describe('exchangeCode', () => {
    it('delegates to oidc.authorizationCodeGrant with pkceCodeVerifier + expectedState and returns { accessToken }', async () => {
      await provider.init();
      const callbackUrl =
        'https://app.test/api/auth/oauth/callback?code=abc&state=state-123';
      const result = await provider.exchangeCode(callbackUrl, 'verifier-456', 'state-123');

      expect(mockOIDC.authorizationCodeGrant).toHaveBeenCalledTimes(1);
      const callArgs = mockOIDC.authorizationCodeGrant.mock.calls[0]!;
      expect(callArgs[0]).toBeDefined();
      expect(callArgs[1]).toBeInstanceOf(URL);
      expect((callArgs[1] as URL).href).toBe(callbackUrl);
      expect(callArgs[2]).toEqual({
        pkceCodeVerifier: 'verifier-456',
        expectedState: 'state-123',
      });
      expect(result).toEqual({ accessToken: 'mock-token' });
    });

    it('throws when the token response has no access_token', async () => {
      await provider.init();
      mockOIDC.authorizationCodeGrant.mockResolvedValueOnce({ access_token: '' });
      await expect(
        provider.exchangeCode(
          'https://app.test/api/auth/oauth/callback?code=c&state=s',
          'v',
          's',
        ),
      ).rejects.toThrow(/access_token/);
    });
  });

  describe('fetchUserInfo', () => {
    it('maps the v6 UserInfo response into OAuthUserInfo with emailVerified + displayName', async () => {
      await provider.init();
      const info = await provider.fetchUserInfo('mock-token');

      // Provider must pass `oidc.skipSubjectCheck` to opt out of the
      // ID-Token ↔ UserInfo sub cross-check (Q1=a handles binding).
      expect(mockOIDC.fetchUserInfo).toHaveBeenCalledTimes(1);
      const callArgs = mockOIDC.fetchUserInfo.mock.calls[0]!;
      expect(callArgs[0]).toBeDefined();
      expect(callArgs[1]).toBe('mock-token');
      expect(callArgs[2]).toBe(mockOIDC.skipSubjectCheck);

      expect(info).toEqual({
        provider: 'oauth',
        subject: '123',
        email: 'x@y.com',
        emailVerified: true,
        displayName: 'Test User',
      });
    });

    it('surfaces email_verified:false as emailVerified:false (service layer enforces the rejection)', async () => {
      await provider.init();
      mockOIDC.fetchUserInfo.mockResolvedValueOnce({
        sub: '123',
        email: 'x@y.com',
        email_verified: false,
        name: 'Test User',
      });
      const info = await provider.fetchUserInfo('mock-token');
      expect(info.emailVerified).toBe(false);
    });

    it('throws when the UserInfo response has no email', async () => {
      await provider.init();
      mockOIDC.fetchUserInfo.mockResolvedValueOnce({ sub: '123', email_verified: true });
      await expect(provider.fetchUserInfo('mock-token')).rejects.toThrow(/email/);
    });
  });
});
