/**
 * OAuth provider abstraction.
 *
 * Defines the contract every concrete IdP adapter (Google today, more later) must
 * satisfy. The contract is deliberately provider-agnostic and intentionally
 * narrow: a provider must know how to
 *
 *   1. perform one-time lazy discovery (`init`),
 *   2. build the URL we redirect the user-agent to for sign-in,
 *   3. exchange the authorization code for an access token (with PKCE +
 *      state verification), and
 *   4. fetch the end-user's identity claims from the IdP's UserInfo endpoint.
 *
 * Refresh tokens, offline access, and token storage are deliberately out of
 * scope — we only need the access token long enough to call the UserInfo
 * endpoint once during the auth callback.
 */
export type OAuthUserInfo = {
  provider: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
};

export interface OAuthProvider {
  /** Stable, lowercase provider key used as the UserIdentity.provider value. */
  readonly name: string;

  /**
   * One-time setup. Performs IdP discovery (or any equivalent config load) and
   * caches whatever is needed for the lifetime of the process. Must be
   * idempotent: a second call should be cheap and not refetch metadata.
   *
   * MUST NOT throw out of this method. A failed discovery is a soft failure:
   * the provider is left un-initialized and any later call must surface a
   * "provider unavailable" error so the controller can return 503.
   */
  init(): Promise<void>;

  /**
   * Build the authorization URL the browser should be redirected to. The
   * caller is responsible for generating `state` and `codeVerifier` (PKCE
   * code_verifier) per request and stashing them in a signed cookie so they
   * can be verified on callback.
   */
  getAuthorizationUrl(
    redirectUri: string,
    state: string,
    codeVerifier: string,
  ): Promise<string>;

  /**
   * Exchange the authorization code (and PKCE verifier / expected state) for
   * an access token. Takes the FULL callback URL — v6's
   * `authorizationCodeGrant` reads `code` and `state` from it directly.
   */
  exchangeCode(
    callbackUrl: string,
    codeVerifier: string,
    expectedState: string,
  ): Promise<{ accessToken: string }>;

  /** Fetch identity claims for the end-user identified by `accessToken`. */
  fetchUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}
