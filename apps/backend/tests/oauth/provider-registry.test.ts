/**
 * Characterization tests for `providerRegistry.ts` — the module-singleton
 * registry and its `initOAuthProviders()` bootstrap entry point.
 *
 * Gap this file fills (see `.omo/plans/remove-ai-slop.md` todo 10): none of
 * the existing OAuth test files exercise `initOAuthProviders()` directly.
 * `oidc-provider.test.ts` already pins `OidcProvider.init()`'s own
 * discovery-failure soft-fail contract (does not throw, leaves
 * `isInitialized()` false). `oauth-service.test.ts` mocks `providerRegistry`
 * entirely (so it never touches the real Map-backed registry or
 * `initOAuthProviders()`), and `oauth-flow-contract.test.ts` calls
 * `providerRegistry.register()` directly, bypassing `initOAuthProviders()`
 * altogether. This file pins:
 *
 *  1. The registry's identity/keying contract: `register`/`get`/`list` are
 *     backed by a single Map keyed by `provider.name`; registering a second
 *     provider under the SAME name overwrites the first (last-write-wins);
 *     `get()` returns the EXACT same object reference that was registered
 *     (no cloning); the registry is a genuine module singleton (re-requiring
 *     the module from a different relative path resolves to the identical
 *     object).
 *  2. `initOAuthProviders()`'s graceful-degradation paths (the catch that
 *     todo 14 will narrow from `catch (error)` to a narrower type):
 *       - `oauthEnabled=false` → no-op, provider never constructed/registered.
 *       - `provider.init()` throws synchronously/asynchronously (the
 *         "belt-and-braces" case the source comment describes as
 *         contractually should-not-happen) → `initOAuthProviders()` still
 *         resolves (does NOT crash the process) and the provider is NOT
 *         registered.
 *       - `provider.init()` resolves but `isInitialized()` is false (mirrors
 *         `OidcProvider`'s own soft-fail contract on discovery failure) →
 *         `initOAuthProviders()` resolves, provider NOT registered — this is
 *         the "discovery failure degrades gracefully" pin required by the
 *         plan.
 *       - happy path: `init()` resolves and `isInitialized()` is true → the
 *         exact provider instance is registered and retrievable via `get()`.
 *
 * `OidcProvider` is mocked (not the real openid-client-backed class) so each
 * scenario can force a specific init()/isInitialized() outcome without any
 * network I/O — this is a unit test of the registry/bootstrap logic, not of
 * `OidcProvider` itself (that's `oidc-provider.test.ts`'s job).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: {
    oauthEnabled: true,
    OAUTH_CONFIG: {
      autoLaunch: false,
      autoRegister: true,
      buttonText: 'Sign in with OAuth',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      enabled: true,
      issuerUrl: 'https://accounts.google.com',
      scope: 'openid email profile',
    } as
      | {
          autoLaunch: boolean;
          autoRegister: boolean;
          buttonText: string;
          clientId: string;
          clientSecret: string;
          enabled: boolean;
          issuerUrl: string;
          scope: string;
        }
      | undefined,
  },
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));

// Replace OidcProvider entirely so each test controls init()/isInitialized()
// without touching openid-client or the network. The mocked constructor
// captures its config args so tests can assert what initOAuthProviders()
// passed through, and returns a distinct stub instance per call (so tests
// can assert the SAME reference ends up registered).
vi.mock('../../src/services/oauth/oidcProvider', () => ({
  OidcProvider: vi.fn(),
}));

import { OidcProvider } from '../../src/services/oauth/oidcProvider';
import {
  initOAuthProviders,
  providerRegistry,
} from '../../src/services/oauth/providerRegistry';
import type {
  OAuthProvider,
  OAuthUserInfo,
} from '../../src/services/oauth/oauthProvider';

const MockedOidcProvider = vi.mocked(OidcProvider);

/**
 * Minimal `OAuthProvider`-shaped stub whose init()/isInitialized() the test
 * controls per-scenario. `isInitialized` is NOT part of the `OAuthProvider`
 * interface (it's a concrete-`OidcProvider`-only method that
 * `initOAuthProviders()` calls on its own freshly-constructed instance,
 * before ever handing the provider to `providerRegistry`), so the stub's
 * return type intersects `OAuthProvider` with that one extra method.
 */
function makeStubProvider(
  name: string,
  overrides: Partial<{
    init: () => Promise<void>;
    isInitialized: () => boolean;
  }> = {},
): OAuthProvider & { isInitialized(): boolean } {
  return {
    name,
    init: overrides.init ?? vi.fn(async () => undefined),
    isInitialized: overrides.isInitialized ?? vi.fn(() => true),
    getAuthorizationUrl: vi.fn(async () => 'https://example.test/authorize'),
    exchangeCode: vi.fn(async () => ({ accessToken: 'token' })),
    fetchUserInfo: vi.fn(async (): Promise<OAuthUserInfo> => ({
      provider: name,
      subject: 'sub',
      email: 'x@y.com',
      emailVerified: true,
    })),
  };
}

describe('providerRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.oauthEnabled = true;
    envMock.OAUTH_CONFIG = {
      autoLaunch: false,
      autoRegister: true,
      buttonText: 'Sign in with OAuth',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      enabled: true,
      issuerUrl: 'https://accounts.google.com',
      scope: 'openid email profile',
    };
  });

  describe('register/get/list — identity and keying contract', () => {
    it('get() returns the EXACT object reference passed to register() (no cloning)', () => {
      const stub = makeStubProvider('registry-identity-test');
      providerRegistry.register(stub);
      expect(providerRegistry.get('registry-identity-test')).toBe(stub);
    });

    it('get() on an unregistered name returns undefined', () => {
      expect(providerRegistry.get('never-registered-name')).toBeUndefined();
    });

    it('keys the registry by provider.name — registering a second provider under the SAME name overwrites the first (last-write-wins)', () => {
      const first = makeStubProvider('registry-overwrite-test');
      const second = makeStubProvider('registry-overwrite-test');
      providerRegistry.register(first);
      providerRegistry.register(second);

      const resolved = providerRegistry.get('registry-overwrite-test');
      expect(resolved).toBe(second);
      expect(resolved).not.toBe(first);
    });

    it('list() reflects every distinct name registered so far, and distinguishes providers by name', () => {
      const a = makeStubProvider('registry-list-test-a');
      const b = makeStubProvider('registry-list-test-b');
      providerRegistry.register(a);
      providerRegistry.register(b);

      const names = providerRegistry.list();
      expect(names).toContain('registry-list-test-a');
      expect(names).toContain('registry-list-test-b');
    });

    it('is a genuine module singleton: re-importing the module from a different relative path resolves to the SAME registry object', async () => {
      // Register through the path already imported at the top of this file.
      const marker = makeStubProvider('registry-singleton-marker');
      providerRegistry.register(marker);

      // Re-import via a different (but equivalent) relative specifier.
      // Node/vitest's module cache resolves both to the same module record,
      // so this MUST be the identical object — if the "module singleton"
      // architectural pattern (ADR-0005) were ever broken by turning this
      // into a factory/class that callers instantiate themselves, this
      // assertion would fail.
      const reImported =
        await import('../../src/services/oauth/providerRegistry.js');
      expect(reImported.providerRegistry).toBe(providerRegistry);
      expect(reImported.providerRegistry.get('registry-singleton-marker')).toBe(
        marker,
      );
    });
  });

  describe('initOAuthProviders() — graceful-degradation paths', () => {
    it('oauthEnabled=false: does not construct or register a provider', async () => {
      envMock.oauthEnabled = false;
      await initOAuthProviders();
      expect(MockedOidcProvider).not.toHaveBeenCalled();
    });

    it('discovery failure degrades GRACEFULLY: init() resolves but isInitialized() stays false → resolves without throwing, provider is NOT registered', async () => {
      const stub = makeStubProvider('oauth', {
        init: vi.fn(async () => undefined),
        isInitialized: vi.fn(() => false),
      });
      MockedOidcProvider.mockImplementation(function () {
        return stub as never;
      } as never);

      await expect(initOAuthProviders()).resolves.toBeUndefined();
      expect(providerRegistry.get('oauth')).toBeUndefined();
    });

    it('belt-and-braces: init() itself throws (contractually should not happen) → initOAuthProviders() still resolves (does not crash), provider NOT registered', async () => {
      const stub = makeStubProvider('oauth', {
        init: vi.fn(async () => {
          throw new Error('unexpected programming error inside init()');
        }),
      });
      MockedOidcProvider.mockImplementation(function () {
        return stub as never;
      } as never);

      await expect(initOAuthProviders()).resolves.toBeUndefined();
      expect(providerRegistry.get('oauth')).toBeUndefined();
    });

    it('happy path: init() resolves and isInitialized() is true → the exact provider instance is registered and retrievable', async () => {
      const stub = makeStubProvider('oauth', {
        init: vi.fn(async () => undefined),
        isInitialized: vi.fn(() => true),
      });
      MockedOidcProvider.mockImplementation(function () {
        return stub as never;
      } as never);

      await initOAuthProviders();
      expect(providerRegistry.get('oauth')).toBe(stub);
    });

    it('passes the parsed OAUTH_CONFIG fields through to the OidcProvider constructor, deriving allowInsecureRequests from an http:// issuer', async () => {
      envMock.OAUTH_CONFIG = {
        autoLaunch: false,
        autoRegister: true,
        buttonText: 'Sign in with OAuth',
        clientId: 'ctor-client',
        clientSecret: 'ctor-secret',
        enabled: true,
        issuerUrl: 'http://localhost:9999',
        scope: 'openid email profile',
      };
      const stub = makeStubProvider('oauth');
      MockedOidcProvider.mockImplementation(function () {
        return stub as never;
      } as never);

      await initOAuthProviders();

      expect(MockedOidcProvider).toHaveBeenCalledWith({
        clientId: 'ctor-client',
        clientSecret: 'ctor-secret',
        issuer: 'http://localhost:9999',
        scope: 'openid email profile',
        allowInsecureRequests: true,
      });
    });
  });
});
