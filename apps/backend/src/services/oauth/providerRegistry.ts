/**
 * Module-singleton registry of initialized OAuth providers, keyed by
 * `OAuthProvider.name` (e.g. `"oauth"`).
 *
 * Kept as a plain object literal over a Map+class so callers can import a
 * single symbol and tests can replace the registry module by
 * `vi.mock('./providerRegistry', ...)`. The internal Map is closed over and
 * not exported.
 */
import { env } from '../../config/env';
import { OidcProvider } from './oidcProvider';
import type { OAuthProvider } from './oauthProvider';

const registry = new Map<string, OAuthProvider>();

export const providerRegistry = {
  register(provider: OAuthProvider): void {
    registry.set(provider.name, provider);
  },
  get(name: string): OAuthProvider | undefined {
    return registry.get(name);
  },
  /**
   * Test/debug helper. Returns the names of providers that successfully
   * completed discovery. Not used in production code paths.
   */
  list(): string[] {
    return Array.from(registry.keys());
  },
};

/**
 * Bootstrap entry point wired into `index.ts` after the database is ready.
 *
 * Idempotent: a second call is a no-op (registry is in-memory per process).
 * Always resolves — never throws — so a misconfigured or unreachable OAuth
 * IdP doesn't take down the whole backend.
 */
export async function initOAuthProviders(): Promise<void> {
  if (!env.oauthEnabled) {
    console.log('[oauth] Not configured — OAuth sign-in disabled.');
    return;
  }

  // oauthEnabled guarantees OAUTH_CONFIG + OAUTH_STATE_SECRET are present.
  const provider = new OidcProvider({
    clientId: env.OAUTH_CONFIG!.clientId,
    clientSecret: env.OAUTH_CONFIG!.clientSecret,
    issuer: env.OAUTH_CONFIG!.issuerUrl,
    scope: env.OAUTH_CONFIG!.scope,
    allowInsecureRequests: env.OAUTH_CONFIG!.issuerUrl.startsWith('http://'),
  });

  try {
    await provider.init();
  } catch (error) {
    // OidcProvider.init() is contractually not supposed to throw — it
    // catches its own discovery errors and logs a warning. This catch is
    // belt-and-braces: if a future change ever lets init throw (e.g. a
    // programming error in the provider), we still don't want to crash the
    // server.
    console.error('[oauth] OAuth provider init threw unexpectedly', error);
    return;
  }

  if (provider.isInitialized()) {
    providerRegistry.register(provider);
    console.log(
      `[oauth] OAuth provider initialized (${env.OAUTH_CONFIG!.issuerUrl}).`,
    );
  } else {
    console.error(
      '[oauth] OAuth provider not registered — discovery failed; OAuth routes will return 503 until restart.',
    );
  }
}
