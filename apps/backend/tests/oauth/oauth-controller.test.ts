/**
 * Unit tests for the OAuth controller (oauthController.ts) using supertest
 * against `createApp()`. The OAuthService is stubbed via
 * `vi.spyOn(OAuthService.prototype, ...)` so we exercise the controller's
 * request/response handling without hitting the real PKCE flow, the real
 * OAuth IdP, or any DB.
 *
 * Cases:
 *  1. `GET /api/auth/oauth` → 302 + Set-Cookie HttpOnly.
 *  2. `GET /api/auth/oauth/callback` with matching state cookie
 *     and stubbed handleCallback → 302 to `${FRONTEND_URL}/auth/callback?token=T`
 *     and the state cookie is cleared.
 *  3. State mismatch (stubbed handleCallback throws StateMismatchError) → 400.
 *  4. Missing config (stubbed initiate throws OAuthNotConfiguredError) → 503.
 *  5. FRONTEND_URL unset + OAuth configured → callback 503.
 *  6. Missing state cookie on callback → 400 with code: missing_state.
 *  7. UnverifiedEmailError → 400 with code: email_not_verified.
 *  8. UserNotRegisteredError → 403 with code: user_not_registered.
 *  9. `GET /api/auth/oauth/config` → 200 with { enabled, buttonText, autoLaunch }.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// vi.hoisted is required because vi.mock factories are hoisted above
// all top-level statements — they cannot reference a const declared at
// module scope. hoisted() lifts the env reference so both the factory
// and the test body share the same object (which the body mutates
// per-test to flip FRONTEND_URL to undefined, etc).
const { envMock } = vi.hoisted(() => ({
  envMock: {
    CORS_ORIGIN: 'http://doschei.test',
    NODE_ENV: 'test',
    FRONTEND_URL: 'https://app.doschei.test' as string | undefined,
    oauthEnabled: true,
    OAUTH_STATE_SECRET: 'test-state-secret',
    JWT_SECRET: 'test-jwt-secret',
    OAUTH_CONFIG: {
      autoLaunch: false,
      autoRegister: true,
      buttonText: 'Sign in with OAuth',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      enabled: true,
      issuerUrl: 'https://accounts.google.com',
      scope: 'openid email profile',
    },
  },
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));

// Mock the data-source module so createApp() (and any controller-side
// path that hits the DB) doesn't try to talk to Postgres. The OAuth
// flow's DB write is exercised in oauth-service.test.ts; here we stub
// the service directly.
vi.mock('../../src/db/data-source', () => ({
  AppDataSource: {
    transaction: vi.fn(),
    getRepository: vi.fn(),
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

import { createApp } from '../../src/app';
import {
  OAuthNotConfiguredError,
  OAuthService,
  StateMismatchError,
  UnverifiedEmailError,
  UserNotRegisteredError,
} from '../../src/services/oauthService';

const FRONTEND_URL = 'https://app.doschei.test';
const STATE_COOKIE_SECRET = 'test-state-secret';

function signedStateCookie(provider: string, state: string): string {
  return jwt.sign({ state, code_verifier: 'verifier', provider }, STATE_COOKIE_SECRET, {
    expiresIn: '10m',
  });
}

describe('oauthController', () => {
  let initiateSpy: ReturnType<typeof vi.spyOn>;
  let callbackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    initiateSpy = vi.spyOn(OAuthService.prototype, 'initiate');
    callbackSpy = vi.spyOn(OAuthService.prototype, 'handleCallback');
    envMock.FRONTEND_URL = 'https://app.doschei.test';
  });

  afterEach(() => {
    initiateSpy.mockRestore();
    callbackSpy.mockRestore();
  });

  it('GET /api/auth/oauth → 302 + Set-Cookie with HttpOnly state cookie', async () => {
    initiateSpy.mockResolvedValue({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&...',
      stateCookie: signedStateCookie('oauth', 'state-1'),
    });

    const app = createApp();
    const response = await request(app).get('/api/auth/oauth');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&...',
    );
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie!];
    const stateCookie = cookies.find((c) => c.startsWith('doschei.oauth.state='));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toMatch(/HttpOnly/i);
    expect(stateCookie).toMatch(/Path=\//);
    // SameSite defaults vary; the controller sets it to 'lax' explicitly.
    expect(stateCookie).toMatch(/SameSite=Lax/i);
  });

  it('GET /api/auth/oauth/callback with matching state cookie → 302 to FRONTEND_URL/auth/callback?token= and clears state cookie', async () => {
    const state = 'state-callback-1';
    const cookieJwt = signedStateCookie('oauth', state);
    callbackSpy.mockResolvedValue({
      token: 'T',
      user: { id: 'u1', email: 'u@doschei.local', displayName: 'U' },
    });

    const app = createApp();
    const response = await request(app)
      .get(`/api/auth/oauth/callback?code=abc&state=${state}`)
      .set('Cookie', `doschei.oauth.state=${cookieJwt}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent('T')}`,
    );
    // The controller MUST clear the state cookie on success.
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie!];
    const cleared = cookies.find((c) => c.startsWith('doschei.oauth.state='));
    expect(cleared).toBeDefined();
    // Express's clearCookie uses a past Expires= and an empty value.
    expect(cleared).toMatch(/doschei\.oauth\.state=/);
    // The clear directive (Max-Age=0 OR Expires= in the past) — accept
    // either, since the exact directive depends on the Express version.
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('State mismatch (handleCallback throws StateMismatchError) → 400 { message, code: state_mismatch }', async () => {
    const state = 'state-mismatch';
    callbackSpy.mockRejectedValue(new StateMismatchError());

    const app = createApp();
    const response = await request(app)
      .get(`/api/auth/oauth/callback?code=c&state=${state}`)
      .set('Cookie', `doschei.oauth.state=${signedStateCookie('oauth', state)}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      message: expect.any(String),
      code: 'state_mismatch',
    });
  });

  it('Missing config (initiate throws OAuthNotConfiguredError) → 503', async () => {
    initiateSpy.mockRejectedValue(new OAuthNotConfiguredError('oauth'));

    const app = createApp();
    const response = await request(app).get('/api/auth/oauth');

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/oauth/);
  });

  it('FRONTEND_URL unset + OAuth configured → callback 503', async () => {
    // Simulate the env where FRONTEND_URL is missing. The controller's
    // early-out `if (!loggedFrontendUrl) return 503` fires before any
    // service call. handleCallback must NOT be called.
    envMock.FRONTEND_URL = undefined;
    callbackSpy.mockResolvedValue({
      token: 'T',
      user: { id: 'u1', email: 'u@doschei.local', displayName: 'U' },
    });

    const app = createApp();
    const state = 'state-fu-1';
    const response = await request(app)
      .get(`/api/auth/oauth/callback?code=c&state=${state}`)
      .set('Cookie', `doschei.oauth.state=${signedStateCookie('oauth', state)}`);

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/frontend URL/i);
    expect(callbackSpy).not.toHaveBeenCalled();
  });

  // Defensive extra: ensure the controller surfaces a missing state
  // cookie as a 400 with code: missing_state (not a 500 from
  // jwt.verify on undefined). The missing-cookie path is a real client
  // error that must not crash.
  it('Missing state cookie on callback → 400 with code: missing_state', async () => {
    callbackSpy.mockResolvedValue({
      token: 'T',
      user: { id: 'u1', email: 'u@doschei.local', displayName: 'U' },
    });

    const app = createApp();
    const response = await request(app).get(
      '/api/auth/oauth/callback?code=c&state=any',
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('missing_state');
  });

  // Defensive extra: UnverifiedEmailError → 400 + code: email_not_verified.
  it('handleCallback throws UnverifiedEmailError → 400 with code: email_not_verified', async () => {
    const state = 'state-unverified';
    callbackSpy.mockRejectedValue(new UnverifiedEmailError('x@y.com'));

    const app = createApp();
    const response = await request(app)
      .get(`/api/auth/oauth/callback?code=c&state=${state}`)
      .set('Cookie', `doschei.oauth.state=${signedStateCookie('oauth', state)}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('email_not_verified');
  });

  // UserNotRegisteredError (autoRegister=false + first-time user) → 403
  // with code: user_not_registered.
  it('handleCallback throws UserNotRegisteredError → 403 with code: user_not_registered', async () => {
    const state = 'state-not-registered';
    callbackSpy.mockRejectedValue(new UserNotRegisteredError('nobody@doschei.local'));

    const app = createApp();
    const response = await request(app)
      .get(`/api/auth/oauth/callback?code=c&state=${state}`)
      .set('Cookie', `doschei.oauth.state=${signedStateCookie('oauth', state)}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('user_not_registered');
    expect(response.body.message).toMatch(/No account found/);
  });

  // The oauthConfig endpoint surfaces the configured { enabled,
  // buttonText, autoLaunch } triple to the frontend so it can render
  // the right login button without any out-of-band config.
  it('GET /api/auth/oauth/config → 200 with { enabled, buttonText, autoLaunch }', async () => {
    const app = createApp();
    const response = await request(app).get('/api/auth/oauth/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      buttonText: 'Sign in with OAuth',
      autoLaunch: false,
    });
  });
});
