/**
 * Unit tests for OAuthService. Mocks the openid-client v6 module
 * (randomPKCECodeVerifier, randomState) and the `providerRegistry`
 * module; replaces `AppDataSource` with an in-memory fake that stores
 * `User` and `UserIdentity` rows in plain arrays.
 *
 * Seven cases:
 *  1. First sign-in creates User (passwordHash: null) + UserIdentity,
 *     issues JWT with correct userId+email.
 *  2. Link to existing local user (Q1=a): only UserIdentity is created,
 *     passwordHash is not touched.
 *  3. Returning OAuth user: pre-seeded UserIdentity is reused, no new
 *     rows, displayName not overwritten.
 *  4. email_verified=false rejected (UnverifiedEmailError).
 *  5. State mismatch (cookieJwt has state='x' but queryState='y')
 *     rejected (StateMismatchError).
 *  6. initiate('oauth') builds a state cookie JWT that decodes to
 *     { state, code_verifier, provider }.
 *  7. autoRegister=false + first-time user → UserNotRegisteredError.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the env module so OAuthService sees a deterministic
// OAUTH_STATE_SECRET and oauthEnabled=true, without any real
// dotenv/zod parsing of the host process env. The mock provides the
// already-parsed OAUTH_CONFIG object (the Zod transform runs at module
// load time; the mock replaces the entire module so it supplies the
// post-transform value).
vi.mock('../../src/config/env', () => ({
  env: {
    OAUTH_STATE_SECRET: 'test-state-secret',
    JWT_SECRET: 'test-jwt-secret',
    FRONTEND_URL: 'http://127.0.0.1:3000',
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
}));

// Mock the openid-client module so randomPKCECodeVerifier / randomState
// return predictable values. The provider-level functions (discovery,
// buildAuthorizationUrl, etc.) are NOT used here — those belong to the
// OidcProvider tests; the service only uses the two random helpers.
vi.mock('openid-client', () => ({
  randomPKCECodeVerifier: vi.fn(() => 'mock-code-verifier'),
  randomState: vi.fn(() => 'mock-state'),
}));

// Build an in-memory repository type that quacks like a TypeORM
// Repository<User> / Repository<UserIdentity> for the limited surface the
// service uses (findOne, create, save).
type InMemoryUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  language: string;
};
type InMemoryIdentity = {
  id: string;
  userId: string;
  provider: string;
  subject: string;
  email: string;
};

type InMemoryRepo<T extends { id: string }> = {
  rows: T[];
  findOne: (opts: { where: Partial<T>; relations?: Record<string, boolean> }) => Promise<T | null>;
  create: (data: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
};

function makeRepo<T extends { id: string }>(initial: T[]): InMemoryRepo<T> {
  // Live reference (no spread) so the test pre-seeds are visible to
  // the repo. A shallow copy would silently break fixture assertions.
  const rows = initial;
  return {
    rows,
    async findOne({ where, relations }) {
      const match = rows.find((row) =>
        Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
      );
      if (!match) return null;
      if (relations?.user) {
        // Resolve the `user` relation by looking up the user with id
        // matching this identity's `userId`. The mock AppDataSource
        // passed at mock-construction time owns the user rows; the repo
        // here does not.
        const userRows = (
          globalThis as unknown as { __inMemoryUsers: InMemoryUser[] }
        ).__inMemoryUsers;
        const user = userRows.find((u) => u.id === (match as unknown as InMemoryIdentity).userId);
        if (user) (match as unknown as { user: InMemoryUser }).user = user;
      }
      return match;
    },
    create(data: Partial<T>) {
      return { ...(data as T), id: `id-${rows.length + 1}-${Date.now()}` } as T;
    },
    async save(entity: T) {
      const existingIdx = rows.findIndex((r) => r.id === entity.id);
      if (existingIdx >= 0) rows[existingIdx] = entity;
      else rows.push(entity);
      return entity;
    },
  };
}

// Mock providerRegistry so the service can resolve 'oauth' to a stub
// provider we control per-test.
const stubProvider = {
  name: 'oauth',
  init: vi.fn(async () => undefined),
  isInitialized: vi.fn(() => true),
  getAuthorizationUrl: vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?...'),
  exchangeCode: vi.fn(async () => ({ accessToken: 'mock-access-token' })),
  fetchUserInfo: vi.fn(),
};

vi.mock('../../src/services/oauth/providerRegistry', () => ({
  providerRegistry: {
    get: vi.fn((name: string) => (name === 'oauth' ? stubProvider : undefined)),
    register: vi.fn(),
    list: vi.fn(() => ['oauth']),
  },
}));

// Mock AppDataSource. The service calls
//   `await AppDataSource.transaction(async (manager) => { ... })`
// where `manager.getRepository(Entity)` returns a Repository. We
// dispatch to the per-Entity in-memory repos stored on globalThis so
// the same rows are visible across the transaction body.
const inMemoryUsers: InMemoryUser[] = [];
const inMemoryIdentities: InMemoryIdentity[] = [];
(globalThis as unknown as { __inMemoryUsers: InMemoryUser[] }).__inMemoryUsers =
  inMemoryUsers;

const userRepo = makeRepo<InMemoryUser>(inMemoryUsers);
const identityRepo = makeRepo<InMemoryIdentity>(inMemoryIdentities);

vi.mock('../../src/db/data-source', () => {
  const invitationRepo = {
    createQueryBuilder: () => ({
      update: () => ({
        set: () => ({
          where: () => ({
            andWhere: () => ({
              andWhere: () => ({
                execute: async () => ({ affected: 0 }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
  return {
    AppDataSource: {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
        cb({ getRepository: (entity: { name: string }) => {
          if (entity.name === 'UserIdentity') return identityRepo;
          if (entity.name === 'Invitation') return invitationRepo;
          return userRepo;
        } }),
      ),
      getRepository: (entity: { name: string }) => {
        if (entity.name === 'UserIdentity') return identityRepo;
        if (entity.name === 'Invitation') return invitationRepo;
        return userRepo;
      },
    },
    initializeDatabase: vi.fn(async () => undefined),
  };
});

// Imports go AFTER the mocks so the service receives the stubbed env,
// providerRegistry, and AppDataSource.
import {
  OAuthNotConfiguredError,
  OAuthService,
  StateMismatchError,
  UnverifiedEmailError,
  UserNotRegisteredError,
  buildStateCookie,
} from '../../src/services/oauthService';
import { env } from '../../src/config/env';
import { verifyAuthToken } from '../../src/utils/jwt';

const TEST_PROVIDER = 'oauth';
const TEST_SUBJECT = 'oauth-sub-1';
const TEST_EMAIL = 'user@doschei.local';
const TEST_DISPLAY_NAME = 'OAuth User';

function resetInMemory() {
  inMemoryUsers.length = 0;
  inMemoryIdentities.length = 0;
  vi.mocked(stubProvider.exchangeCode).mockResolvedValue({ accessToken: 'mock-access-token' });
  vi.mocked(stubProvider.fetchUserInfo).mockReset();
  vi.mocked(stubProvider.getAuthorizationUrl).mockReset();
  vi.mocked(stubProvider.getAuthorizationUrl).mockResolvedValue(
    'https://accounts.google.com/o/oauth2/v2/auth?...',
  );
}

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemory();
    service = new OAuthService();
  });

  describe('initiate', () => {
    it('returns a state cookie JWT that decodes to { state, code_verifier, provider }', async () => {
      const result = await service.initiate(TEST_PROVIDER);

      // The mock for `openid-client.randomState` returns 'mock-state'
      // and `randomPKCECodeVerifier` returns 'mock-code-verifier'.
      const decoded = jwt.verify(result.stateCookie, 'test-state-secret') as {
        state: string;
        code_verifier: string;
        provider: string;
      };
      expect(decoded).toMatchObject({
        state: 'mock-state',
        code_verifier: 'mock-code-verifier',
        provider: TEST_PROVIDER,
      });
      expect(result.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?...');
      // The redirect URI is derived from env.FRONTEND_URL — no
      // GOOGLE_REDIRECT_URI involved anymore.
      expect(stubProvider.getAuthorizationUrl).toHaveBeenCalledWith(
        `${env.FRONTEND_URL}/api/auth/oauth/callback`,
        'mock-state',
        'mock-code-verifier',
      );
    });

    it('throws OAuthNotConfiguredError when the provider is not in the registry', async () => {
      await expect(service.initiate('nope')).rejects.toBeInstanceOf(OAuthNotConfiguredError);
    });
  });

  describe('handleCallback', () => {
    function oauthInfo(overrides: Partial<{ emailVerified: boolean; email: string; displayName: string; subject: string; locale: string }> = {}) {
      return {
        provider: TEST_PROVIDER,
        subject: overrides.subject ?? TEST_SUBJECT,
        email: overrides.email ?? TEST_EMAIL,
        emailVerified: overrides.emailVerified ?? true,
        displayName: overrides.displayName ?? TEST_DISPLAY_NAME,
        locale: overrides.locale,
      };
    }

    it('first sign-in: creates User (passwordHash: null) + UserIdentity and issues JWT with { userId, email }', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo());
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
      );

      expect(result.user).toEqual({
        id: expect.any(String),
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        language: 'en',
      });

      // Verify the issued JWT decodes to { userId, email }.
      const payload = verifyAuthToken(result.token);
      expect(payload.userId).toBe(result.user.id);
      expect(payload.email).toBe(TEST_EMAIL);

      // Assert the underlying rows: ONE new user with passwordHash: null
      // (signals "OAuth-only", not local auth), ONE new identity.
      expect(inMemoryUsers).toHaveLength(1);
      expect(inMemoryUsers[0]!.passwordHash).toBeNull();
      expect(inMemoryUsers[0]!.language).toBe('en');
      expect(inMemoryIdentities).toHaveLength(1);
      expect(inMemoryIdentities[0]!.subject).toBe(TEST_SUBJECT);
    });

    it('first sign-in with IdP locale=it sets user.language=it (locale claim wins)', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo({ locale: 'it' }));
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
      );

      expect(result.user.language).toBe('it');
      expect(inMemoryUsers[0]!.language).toBe('it');
    });

    it('first sign-in with Accept-Language=it-IT,it;q=0.9 (no IdP locale) → language=it', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo());
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
        'it-IT,it;q=0.9',
      );

      expect(result.user.language).toBe('it');
      expect(inMemoryUsers[0]!.language).toBe('it');
    });

    it('first sign-in with locale=it-CH (region suffix) → language=it', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo({ locale: 'it-CH' }));
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
      );

      expect(result.user.language).toBe('it');
      expect(inMemoryUsers[0]!.language).toBe('it');
    });

    it('Q1=a link: existing local user with matching email → only UserIdentity is created, passwordHash untouched, no second User', async () => {
      // Pre-seed a local-auth user with a non-null passwordHash. The
      // email is the lowercased form of the OAuth claim.
      const existingUserId = 'pre-existing-user';
      inMemoryUsers.push({
        id: existingUserId,
        email: TEST_EMAIL,
        passwordHash: 'hashed-password-do-not-overwrite',
        displayName: 'Local Display',
        language: 'en',
      });

      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo());
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
      );

      // NO new User created — the existing one is reused.
      expect(inMemoryUsers).toHaveLength(1);
      expect(result.user.id).toBe(existingUserId);
      // passwordHash is the EXACT pre-seeded value — not touched.
      expect(inMemoryUsers[0]!.passwordHash).toBe('hashed-password-do-not-overwrite');
      // ONLY a new UserIdentity linking the two.
      expect(inMemoryIdentities).toHaveLength(1);
      expect(inMemoryIdentities[0]!.userId).toBe(existingUserId);
      expect(inMemoryIdentities[0]!.subject).toBe(TEST_SUBJECT);

      // Token userId matches the existing user.
      const payload = verifyAuthToken(result.token);
      expect(payload.userId).toBe(existingUserId);
    });

    it('returning OAuth user: pre-seeded UserIdentity reuses the User, no new rows, displayName preserved', async () => {
      // Pre-seed an OAuth user whose displayName differs from what the
      // fresh claim will supply. The service must NOT overwrite it.
      const existingUserId = 'returning-oauth-user';
      inMemoryUsers.push({
        id: existingUserId,
        email: TEST_EMAIL,
        passwordHash: null,
        displayName: 'Original Display Name',
        language: 'en',
      });
      inMemoryIdentities.push({
        id: 'identity-1',
        userId: existingUserId,
        provider: TEST_PROVIDER,
        subject: TEST_SUBJECT,
        email: TEST_EMAIL,
      });

      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(
        oauthInfo({ displayName: 'New Display Name From OAuth' }),
      );
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
      );

      expect(result.user.id).toBe(existingUserId);
      expect(result.user.displayName).toBe('Original Display Name');
      expect(inMemoryUsers).toHaveLength(1);
      expect(inMemoryIdentities).toHaveLength(1);
    });

    it('returning OAuth user: language is NOT overwritten even when IdP sends a new locale (ADR-0018 displayName-style preservation)', async () => {
      // Pre-seed an OAuth user whose language was set to 'it' on a prior
      // sign-in (e.g. via the Account-screen PATCH). The service must
      // NOT overwrite it on the next callback, even when the IdP now
      // sends locale='en'. Mirrors ADR-0013 displayName preservation.
      const existingUserId = 'returning-lang-user';
      inMemoryUsers.push({
        id: existingUserId,
        email: TEST_EMAIL,
        passwordHash: null,
        displayName: 'Original Display Name',
        language: 'it',
      });
      inMemoryIdentities.push({
        id: 'identity-lang-1',
        userId: existingUserId,
        provider: TEST_PROVIDER,
        subject: TEST_SUBJECT,
        email: TEST_EMAIL,
      });

      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(
        oauthInfo({ locale: 'en' }),
      );
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      const result = await service.handleCallback(
        TEST_PROVIDER,
        'https://app.test/callback?code=c&state=state-x',
        'state-x',
        cookie,
        'en-US,en;q=0.9',
      );

      expect(result.user.id).toBe(existingUserId);
      expect(result.user.language).toBe('it');
      expect(inMemoryUsers[0]!.language).toBe('it');
    });

    it('rejects email_verified=false with UnverifiedEmailError and creates no DB rows', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo({ emailVerified: false }));
      const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

      await expect(
        service.handleCallback(
          TEST_PROVIDER,
          'https://app.test/callback?code=c&state=state-x',
          'state-x',
          cookie,
        ),
      ).rejects.toBeInstanceOf(UnverifiedEmailError);

      expect(inMemoryUsers).toHaveLength(0);
      expect(inMemoryIdentities).toHaveLength(0);
    });

    it('rejects state mismatch (cookie state=x vs query state=y) with StateMismatchError and creates no DB rows', async () => {
      vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo());
      const cookie = buildStateCookie(TEST_PROVIDER, 'x', 'verifier-x');

      await expect(
        service.handleCallback(
          TEST_PROVIDER,
          'https://app.test/callback?code=c&state=y',
          'y',
          cookie,
        ),
      ).rejects.toBeInstanceOf(StateMismatchError);

      expect(inMemoryUsers).toHaveLength(0);
      expect(inMemoryIdentities).toHaveLength(0);
    });

    it('autoRegister=false + first-time user → UserNotRegisteredError and creates no DB rows', async () => {
      // Flip autoRegister off for this test only. The env mock object is
      // shared by reference, so mutating it here is visible to the
      // service's `env.OAUTH_CONFIG?.autoRegister` check.
      const original = env.OAUTH_CONFIG?.autoRegister;
      (env.OAUTH_CONFIG as { autoRegister: boolean }).autoRegister = false;
      try {
        vi.mocked(stubProvider.fetchUserInfo).mockResolvedValue(oauthInfo());
        const cookie = buildStateCookie(TEST_PROVIDER, 'state-x', 'verifier-x');

        await expect(
          service.handleCallback(
            TEST_PROVIDER,
            'https://app.test/callback?code=c&state=state-x',
            'state-x',
            cookie,
          ),
        ).rejects.toBeInstanceOf(UserNotRegisteredError);

        expect(inMemoryUsers).toHaveLength(0);
        expect(inMemoryIdentities).toHaveLength(0);
      } finally {
        (env.OAUTH_CONFIG as { autoRegister: boolean }).autoRegister = original ?? true;
      }
    });
  });
});
