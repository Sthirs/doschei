/**
 * Generic OAuth2/OIDC provider backed by openid-client v6.
 *
 * v6 is a module-level API (no Issuer/Client class): each call is a free
 * function that takes a `Configuration` object. We cache the Configuration
 * returned by `discovery()` after the first `init()` and reuse it for the
 * lifetime of the process.
 *
 * The constructor takes the issuer URL as a parameter (instead of reading it
 * from `process.env`) so tests can inject a mock issuer without mutating
 * process globals.
 *
 * openid-client v6 is pure ESM and our backend is CJS (`module: Node16` in
 * tsconfig). Statically importing it as `import * as oidc from 'openid-client'`
 * trips `TS1479` (CJS cannot `require()` an ESM module). We work around it
 * with a one-time dynamic `import()` cached in a module-level variable: the
 * `import type` above is compiler-only (zero runtime cost), and the
 * `loadOpenidClient()` helper below does the actual ESM load lazily on the
 * first method call.
 */
import type * as OpenidClient from 'openid-client' with { 'resolution-mode': 'import' };

import type { OAuthProvider, OAuthUserInfo } from './oauthProvider';

export type OidcProviderConfig = {
  clientId: string;
  clientSecret: string;
  issuer: string;
  scope: string;
  /**
   * Opt-in flag for testing against an in-process IdP that serves HTTP
   * (e.g. oauth2-mock-server). openid-client v6 refuses non-HTTPS
   * issuer URLs by default; setting this to `true` registers the
   * `allowInsecureRequests` extension so discovery and subsequent
   * token / userinfo calls accept `http://` URLs.
   *
   * MUST stay `false` in production — the entire point of the v6
   * default is to refuse downgrades. Only flip on from a test that
   * has full control over the IdP (e.g. the T7 contract test).
   */
  allowInsecureRequests?: boolean;
};

/** Error thrown when a method is called before `init()` succeeded. */
export class OAuthProviderNotInitializedError extends Error {
  constructor(providerName: string) {
    super(`OAuth provider "${providerName}" is not initialized`);
    this.name = 'OAuthProviderNotInitializedError';
  }
}

// ESM-only runtime module, loaded lazily + cached. The `typeof import(...)`
// trick gives us the module's type without forcing tsc to emit a static
// `require()` call (which would be TS1479 in our Node16 CJS setup).
let oidcModulePromise: Promise<typeof OpenidClient> | undefined;

function loadOpenidClient(): Promise<typeof OpenidClient> {
  if (!oidcModulePromise) {
    oidcModulePromise = import('openid-client');
  }
  return oidcModulePromise;
}

export class OidcProvider implements OAuthProvider {
  readonly name = 'oauth';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly issuer: string;
  private readonly scope: string;
  private readonly allowInsecureRequests: boolean;
  private config?: OpenidClient.Configuration;

  constructor({
    clientId,
    clientSecret,
    issuer,
    scope,
    allowInsecureRequests = false,
  }: OidcProviderConfig) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.issuer = issuer;
    this.scope = scope;
    this.allowInsecureRequests = allowInsecureRequests;
  }

  async init(): Promise<void> {
    if (this.config !== undefined) {
      return;
    }
    try {
      const oidc = await loadOpenidClient();
      // v6: discovery returns a Configuration we cache for the rest of the
      // process. `clientSecret` is a string shorthand for the
      // ClientMetadata.client_secret field. The 5th-arg `timeout` is in
      // SECONDS, not milliseconds — bumped DOWN from the 30s default because
      // the bootstrap must fail fast on a misconfigured egress.
      const discoveryOptions: {
        timeout: number;
        execute?: Array<(c: OpenidClient.Configuration) => void>;
      } = { timeout: 10 };
      if (this.allowInsecureRequests) {
        // The openid-client v6 extension that opts out of the
        // protocol check (default is "https only"). Doubles as the
        // marker that the discovery call reads to skip the check
        // BEFORE the first HTTP request is made.
        discoveryOptions.execute = [oidc.allowInsecureRequests];
      }
      this.config = await oidc.discovery(
        new URL(this.issuer),
        this.clientId,
        this.clientSecret,
        undefined,
        discoveryOptions,
      );
    } catch (error) {
      // Soft failure: leave `config` undefined so the controller returns 503
      // for any subsequent OAuth attempt. Caller (initOAuthProviders) is
      // responsible for logging + skipping registration.
      console.warn(
        '[oauth] OAuth discovery failed; provider will be unavailable until restart.',
        { issuer: this.issuer, error },
      );
    }
  }

  async getAuthorizationUrl(
    redirectUri: string,
    state: string,
    codeVerifier: string,
  ): Promise<string> {
    this.assertInitialized();
    const oidc = await loadOpenidClient();
    // S256 is mandatory for OAuth. `calculatePKCECodeChallenge` is async.
    const url = oidc.buildAuthorizationUrl(this.config!, {
      redirect_uri: redirectUri,
      scope: this.scope,
      state,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return url.href;
  }

  async exchangeCode(
    callbackUrl: string,
    codeVerifier: string,
    expectedState: string,
  ): Promise<{ accessToken: string }> {
    this.assertInitialized();
    const oidc = await loadOpenidClient();
    // v6's authorizationCodeGrant extracts `code` + `state` from the URL
    // itself and verifies `state` against `expectedState`.
    const tokenSet = await oidc.authorizationCodeGrant(
      this.config!,
      new URL(callbackUrl),
      {
        pkceCodeVerifier: codeVerifier,
        expectedState,
      },
    );
    if (!tokenSet.access_token) {
      throw new Error('[oauth] OAuth token response missing access_token');
    }
    return { accessToken: tokenSet.access_token };
  }

  async fetchUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    this.assertInitialized();
    const oidc = await loadOpenidClient();
    // v6 requires an explicit `expectedSubject` value to bind the UserInfo
    // response's `sub` claim to the ID Token's `sub`. We use
    // `skipSubjectCheck` because we only need the email/displayName at this
    // layer; the link-by-email policy in T4 is what actually reconciles the
    // OAuth subject with the local user.
    const userInfo = await oidc.fetchUserInfo(
      this.config!,
      accessToken,
      oidc.skipSubjectCheck,
    );
    if (!userInfo.email) {
      throw new Error('[oauth] OAuth UserInfo response missing email');
    }
    return {
      provider: this.name,
      subject: String(userInfo.sub),
      email: String(userInfo.email),
      emailVerified: Boolean(userInfo.email_verified),
      displayName:
        typeof userInfo.name === 'string' ? userInfo.name : undefined,
    };
  }

  /** True once `init()` completed discovery successfully. */
  isInitialized(): boolean {
    return this.config !== undefined;
  }

  private assertInitialized(): void {
    if (this.config === undefined) {
      throw new OAuthProviderNotInitializedError(this.name);
    }
  }
}
