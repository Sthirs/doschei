/**
 * Contract test: drives the full OAuth flow end-to-end through the REAL
 * `openid-client` v6 library against an in-process `oauth2-mock-server`
 * IdP. The only mocked layers are the env stub and the DB — openid-client
 * itself runs untouched, so this proves discovery, PKCE S256, code
 * exchange, JWKS-backed ID-token signature verification, and the
 * UserInfo call all work together.
 *
 * Two cases:
 *  1. first sign-in: a new `User` (passwordHash: null) + `UserIdentity`
 *     are created and a JWT with `{ userId, email }` is issued.
 *  2. link (Q1=a): a pre-seeded local-auth user is reused — no new
 *     `User`, `passwordHash` is untouched, only a new `UserIdentity`
 *     links the OAuth subject to the existing local user, and the JWT
 *     carries the pre-seeded userId.
 *
 * `oauth2-mock-server` is the actual library used by T7's plan (installed
 * in T1, see `apps/backend/package.json:37`). The class is `OAuth2Server`
 * (v7 API; older docs may refer to `OAuth2Provider`). The userinfo hook
 * is the `beforeUserinfo` event on `server.service`, NOT `mockServer.on`.
 *
 * The OidcProvider is constructed directly (DI) with the mock issuer
 * URL — no env mutation. The provider is registered into the real
 * `providerRegistry` (not mocked) so the production `OAuthService`
 * resolves it unchanged.
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { OAuth2Server } from 'oauth2-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted: share state between the env / data-source mock factories
// (which vitest hoists above all top-level statements) and the test body.
// ---------------------------------------------------------------------------
const { envMock, inMemoryUsers, inMemoryIdentities } = vi.hoisted(() => {
  const inMemoryUsers: Array<{
    id: string;
    email: string;
    passwordHash: string | null;
    displayName: string;
  }> = [];
  const inMemoryIdentities: Array<{
    id: string;
    userId: string;
    provider: string;
    subject: string;
    email: string;
  }> = [];
  return {
    inMemoryUsers,
    inMemoryIdentities,
    envMock: {
      CORS_ORIGIN: 'http://127.0.0.1:3000',
      NODE_ENV: 'test',
      // Set in beforeAll once the in-process Express app's port is known.
      // The OAuthService derives the redirect URI as
      // `${env.FRONTEND_URL}/api/auth/oauth/callback`, so FRONTEND_URL
      // must point at the in-process app for the mock IdP's redirect
      // back to hit the app's callback route. Updated per-run in
      // beforeAll (the service reads it per-request, not at module
      // load, so the post-beforeAll value is picked up).
      FRONTEND_URL: '' as string,
      OAUTH_STATE_SECRET: 'test-state-secret',
      JWT_SECRET: 'test-jwt-secret',
      // Parsed OAUTH_CONFIG object (the Zod transform runs at module
      // load time; the mock replaces the entire env module so it
      // supplies the already-transformed value). `autoRegister: true`
      // so the first-sign-in path creates the User.
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
      oauthEnabled: true,
    },
  };
});

vi.mock('../../src/config/env', () => ({ env: envMock }));

// Stub the DB layer: in-memory `User` / `UserIdentity` repos that
// quack like a TypeORM `Repository` for the surface the service uses
// (`findOne`, `create`, `save`). The transaction callback receives a
// mock entityManager that dispatches to the right repo by entity name.
vi.mock('../../src/db/data-source', () => {
  function makeRepo<T extends { id: string }>(rows: T[]) {
    return {
      rows,
      async findOne({
        where,
        relations,
      }: {
        where: Partial<T>;
        relations?: Record<string, boolean>;
      }) {
        const match = rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        );
        if (!match) {
          return null;
        }
        if (relations?.user) {
          const user = inMemoryUsers.find(
            (u) => u.id === (match as unknown as { userId: string }).userId,
          );
          if (user) {
            (match as unknown as { user: typeof user }).user = user;
          }
        }
        return match;
      },
      create(data: Partial<T>) {
        return {
          ...(data as T),
          id: (data as { id?: string }).id ?? randomUUID(),
        };
      },
      async save(entity: T) {
        const existingIdx = rows.findIndex((r) => r.id === entity.id);
        if (existingIdx >= 0) {
          rows[existingIdx] = entity;
        } else {
          rows.push(entity);
        }
        return entity;
      },
    };
  }

  const userRepo = makeRepo(inMemoryUsers);
  const identityRepo = makeRepo(inMemoryIdentities);

  return {
    AppDataSource: {
      isInitialized: true,
      // `getRepository` is called eagerly by `AuthService`'s instance
      // initializer (authService.ts:23) when the authController imports
      // the service. It is also called by `OAuthService` indirectly via
      // `AppDataSource.transaction(...)` in handleCallback — both
      // resolve to the same per-Entity in-memory repos.
      getRepository: (entity: { name?: string }) => {
        if (entity.name === 'UserIdentity') {
          return identityRepo;
        }
        return userRepo;
      },
      transaction: vi.fn(
        async (cb: (manager: unknown) => Promise<unknown>) =>
          cb({
            getRepository: (entity: { name?: string }) => {
              if (entity.name === 'UserIdentity') {
                return identityRepo;
              }
              return userRepo;
            },
          }),
      ),
    },
    initializeDatabase: vi.fn(async () => undefined),
  };
});

// Stash the in-memory user rows on globalThis so the helper's relation
// join (used in oauth-service tests) can also resolve them. Not strictly
// required for THIS test (the service does not use `relations.user` on
// the first-sign-in / link paths), but mirrors T6's setup so the two
// repos are interchangeable.
(globalThis as unknown as { __inMemoryUsers: typeof inMemoryUsers }).__inMemoryUsers =
  inMemoryUsers;

// Imports go AFTER the vi.mock calls so the production code receives
// the stubbed env and AppDataSource.
import { createApp } from '../../src/app';
import { OidcProvider } from '../../src/services/oauth/oidcProvider';
import { providerRegistry } from '../../src/services/oauth/providerRegistry';
import { verifyAuthToken } from '../../src/utils/jwt';

const MOCK_SUBJECT = 'oauth-sub-1';
const MOCK_EMAIL = 'contract@doschei.local';
const MOCK_DISPLAY_NAME = 'Contract Tester';

let mockServer: OAuth2Server;
let appServer: Server;
let appPort: number;
// FRONTEND_URL is set in beforeAll to the in-process app's origin so
// both the OAuth redirect_uri and the final /auth/callback redirect
// point at the app's own port. Tests assert against this value.
let FRONTEND_URL: string;

beforeAll(async () => {
  // 1. Start the mock OIDC IdP on an ephemeral port. v7 API: the class
  // is `OAuth2Server` (NOT `OAuth2Provider` as older docs claim), and
  // `start()` resolves when the underlying http server emits 'listening'.
  mockServer = new OAuth2Server();
  // Generate an RSA signing key BEFORE start() so the IdP can sign ID
  // tokens; the default keystore is empty, and openid-client's ID-token
  // signature verification would otherwise fail at the token exchange.
  await mockServer.issuer.keys.generate('RS256');
  await mockServer.start();

  // 2. Configure the UserInfo response. The mock emits a
  // `beforeUserinfo` event with a MUTABLE response object; the handler
  // mutates `userInfoResponse.body`. v7 event name is `beforeUserinfo`
  // (not `userinfo`).
  mockServer.service.on('beforeUserinfo', (userInfoResponse) => {
    userInfoResponse.body = {
      sub: MOCK_SUBJECT,
      email: MOCK_EMAIL,
      email_verified: true,
      name: MOCK_DISPLAY_NAME,
    };
  });

  // 3. Construct an OidcProvider pointing at the MOCK issuer URL and
  // run REAL openid-client v6 discovery against it. No mocking of
  // openid-client — the whole point of this test is to exercise the
  // real library against a real OIDC endpoint (the mock one).
  // `allowInsecureRequests: true` opts the v6 client out of its
  // default "HTTPS-only issuer" policy so it accepts the mock IdP's
  // `http://localhost:<port>` URL. This is the ONLY way to drive the
  // real library against a localhost mock without self-signed certs.
  const oauthProvider = new OidcProvider({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    issuer: mockServer.issuer.url!,
    scope: 'openid email profile',
    allowInsecureRequests: true,
  });
  await oauthProvider.init();
  // Hard-fail the test if discovery did not succeed — without this the
  // service would return OAuthNotConfiguredError and the test would
  // diagnose the wrong layer.
  expect(oauthProvider.isInitialized()).toBe(true);

  // 4. Register the initialized provider into the module-singleton
  // registry. OAuthService reads from this registry at request time
  // (no caching), so the registration is live for the duration of the
  // test file.
  providerRegistry.register(oauthProvider);

  // 5. Start the Express app on an ephemeral port. `listen(0)` lets
  // the OS pick a free port; we read the assigned port back from
  // `server.address().port`.
  const app = createApp();
  appServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => {
    appServer.once('listening', () => resolve());
  });
  appPort = (appServer.address() as AddressInfo).port;
  FRONTEND_URL = `http://127.0.0.1:${appPort}`;

  // 6. Point FRONTEND_URL at the in-process app so the service-derived
  // redirect URI (`${env.FRONTEND_URL}/api/auth/oauth/callback`) hits
  // the app's own callback route. The service reads `env.FRONTEND_URL`
  // inside `initiate()` at request time, so updating the env mock here
  // is picked up by the test fetches that follow.
  envMock.FRONTEND_URL = FRONTEND_URL;
}, 30_000);

afterAll(async () => {
  // Stop the mock IdP first — if any test request is still in flight
  // it would hit a closed port. close() is a no-op on a stopped server.
  await mockServer?.stop().catch(() => undefined);
  await new Promise<void>((resolve) => {
    appServer?.close(() => resolve());
  });
});

/**
 * Extract the value of a named cookie from a `Set-Cookie` response
 * header. The first `;`-separated segment is `name=value`; the
 * remaining segments are attributes (HttpOnly, Path=, etc.).
 */
function extractCookieValue(setCookieHeader: string, name: string): string {
  const firstSegment = setCookieHeader.split(';')[0]?.trim() ?? '';
  const eqIdx = firstSegment.indexOf('=');
  if (
    eqIdx <= 0 ||
    firstSegment.substring(0, eqIdx) !== name
  ) {
    throw new Error(
      `Cookie "${name}" not found in Set-Cookie header: ${setCookieHeader}`,
    );
  }
  return firstSegment.substring(eqIdx + 1);
}

/**
 * Drive the full PKCE redirect chain end-to-end with manual `fetch`
 * (no supertest, no automatic redirect-following across origins):
 *
 *   1. GET /api/auth/oauth                       → 302 (Location: mock /authorize)
 *   2. GET <mock /authorize>                    → 302 (Location: app /callback?code=&state=)
 *   3. GET <app /callback> with state cookie    → 302 (Location: FRONTEND_URL/auth/callback?token=)
 *
 * Returns the issued JWT and the final `Location` URL.
 */
async function runFullFlow(): Promise<{ token: string; finalUrl: string }> {
  // Step 1: initiate — hit the app's OAuth route, read the 302 Location
  // and capture the state cookie set on the response.
  const initRes = await fetch(
    `http://127.0.0.1:${appPort}/api/auth/oauth`,
    { redirect: 'manual' },
  );
  expect(initRes.status).toBe(302);
  const authUrl = initRes.headers.get('location');
  expect(authUrl).toBeTruthy();

  const setCookie = initRes.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  const stateCookie = extractCookieValue(setCookie!, 'doschei.oauth.state');
  expect(stateCookie.length).toBeGreaterThan(0);

  // Step 2: follow the redirect to the mock IdP's /authorize. The mock
  // auto-approves and 302s to the redirect_uri (the app callback) with
  // `code` + `state` query params. We do NOT send the state cookie here
  // — the mock IdP doesn't need it; only the app's callback uses it.
  const authRes = await fetch(authUrl!, { redirect: 'manual' });
  expect(authRes.status).toBe(302);
  const callbackUrl = authRes.headers.get('location');
  expect(callbackUrl).toBeTruthy();

  // Step 3: hit the app's callback URL with the state cookie from step 1.
  // The state cookie MUST be sent here — the controller verifies it
  // against the `state` query param before exchanging the code.
  const callbackRes = await fetch(callbackUrl!, {
    redirect: 'manual',
    headers: { Cookie: `doschei.oauth.state=${stateCookie}` },
  });
  expect(callbackRes.status).toBe(302);
  const finalUrl = callbackRes.headers.get('location');
  expect(finalUrl).toBeTruthy();

  // Step 4: extract the JWT from the final URL.
  const finalUrlObj = new URL(finalUrl!);
  const token = finalUrlObj.searchParams.get('token');
  expect(token).toBeTruthy();

  return { token: token!, finalUrl: finalUrl! };
}

describe('OAuth flow contract (real openid-client v6 ↔ oauth2-mock-server)', () => {
  beforeEach(() => {
    // The in-memory arrays persist across the test file's lifetime
    // (the vi.hoisted arrays are captured once at hoist time). Each
    // case needs a clean slate so the "no new User" / "1 new identity"
    // assertions are unambiguous.
    inMemoryUsers.length = 0;
    inMemoryIdentities.length = 0;
  });

  it('first sign-in: creates User (passwordHash: null) + UserIdentity and issues JWT with { userId, email }', async () => {
    const { token, finalUrl } = await runFullFlow();

    // Final URL must point at FRONTEND_URL/auth/callback with ?token=.
    const final = new URL(finalUrl);
    expect(final.origin).toBe(FRONTEND_URL);
    expect(final.pathname).toBe('/auth/callback');

    // Decode the JWT — verifyAuthToken uses the same JWT_SECRET that
    // the OAuthService signs with (both read from the env stub).
    const payload = verifyAuthToken(token);
    expect(payload.email).toBe(MOCK_EMAIL);
    expect(typeof payload.userId).toBe('string');
    expect(payload.userId.length).toBeGreaterThan(0);

    // In-memory DB: ONE new user with passwordHash: null (signals
    // "OAuth-only", not local auth) and displayName from the UserInfo
    // response, plus ONE new identity linking OAuth sub to that user.
    expect(inMemoryUsers).toHaveLength(1);
    expect(inMemoryUsers[0]).toMatchObject({
      email: MOCK_EMAIL,
      passwordHash: null,
      displayName: MOCK_DISPLAY_NAME,
    });
    expect(inMemoryUsers[0]!.id).toBe(payload.userId);

    expect(inMemoryIdentities).toHaveLength(1);
    expect(inMemoryIdentities[0]).toMatchObject({
      provider: 'oauth',
      subject: MOCK_SUBJECT,
      userId: payload.userId,
      email: MOCK_EMAIL,
    });
  });

  it('Q1=a link: pre-seeded local-auth user is reused — no new User, passwordHash untouched, only UserIdentity links to existing user', async () => {
    // Pre-seed a local-auth user with a non-null passwordHash. The
    // service MUST NOT touch the passwordHash (Q1=a — no password
    // re-check) and MUST NOT create a second User for the same email.
    const existingUserId = 'existing-local-user-id';
    inMemoryUsers.push({
      id: existingUserId,
      email: MOCK_EMAIL,
      passwordHash: 'hashed-password-do-not-overwrite',
      displayName: 'Local Contract',
    });

    const { token } = await runFullFlow();

    // NO new User created — the existing one is reused.
    expect(inMemoryUsers).toHaveLength(1);
    expect(inMemoryUsers[0]!.id).toBe(existingUserId);
    // passwordHash is the EXACT pre-seeded value — not touched.
    expect(inMemoryUsers[0]!.passwordHash).toBe('hashed-password-do-not-overwrite');
    // Pre-seeded displayName is preserved (link path never overwrites
    // the User.displayName on a returning-OAuth-style user).
    expect(inMemoryUsers[0]!.displayName).toBe('Local Contract');

    // ONLY a new UserIdentity linking the two.
    expect(inMemoryIdentities).toHaveLength(1);
    expect(inMemoryIdentities[0]).toMatchObject({
      provider: 'oauth',
      subject: MOCK_SUBJECT,
      userId: existingUserId,
      email: MOCK_EMAIL,
    });

    // Token userId matches the existing local user.
    const payload = verifyAuthToken(token);
    expect(payload.userId).toBe(existingUserId);
    expect(payload.email).toBe(MOCK_EMAIL);
  });
});
