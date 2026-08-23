/**
 * OAuth orchestration layer. Owns the PKCE flow:
 *   1. `initiate(provider)`  — generate code_verifier + state, build the
 *                              redirect URL, return a signed state cookie.
 *   2. `handleCallback(...)` — verify state cookie, exchange code, fetch
 *                              UserInfo, gate on email_verified, upsert/link
 *                              the local User, issue JWT.
 *
 * No session/Redis: the `code_verifier` lives in a short-lived signed cookie.
 * Linking policy: Q1=a — existing local-auth user with matching email is
 * linked to the new IdP identity without a password check.
 */
import type * as OpenidClient from 'openid-client' with { 'resolution-mode': 'import' };

import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { UserIdentity } from '../entities/UserIdentity';
import { signAuthToken } from '../utils/jwt';
import { normalizeRequestedLanguage, sanitizeUser } from './authService';
import { invitationService } from './invitationService';
import { providerRegistry } from './oauth/providerRegistry';
import type { OAuthUserInfo } from './oauth/oauthProvider';

export class OAuthNotConfiguredError extends Error {
  constructor(provider?: string) {
    super(
      provider
        ? `OAuth provider "${provider}" is not configured`
        : 'OAuth is not configured',
    );
    this.name = 'OAuthNotConfiguredError';
  }
}

export class StateMismatchError extends Error {
  constructor() {
    super('OAuth state mismatch');
    this.name = 'StateMismatchError';
  }
}

export class UnverifiedEmailError extends Error {
  constructor(email: string) {
    super(`OAuth email "${email}" is not verified at the provider`);
    this.name = 'UnverifiedEmailError';
  }
}

export class UserNotRegisteredError extends Error {
  constructor(email: string) {
    super(
      `No account found for "${email}". Contact an administrator to register.`,
    );
    this.name = 'UserNotRegisteredError';
  }
}

type StateCookiePayload = {
  state: string;
  code_verifier: string;
  provider: string;
};

const STATE_COOKIE_TTL = '10m';

export function buildStateCookie(
  provider: string,
  state: string,
  codeVerifier: string,
): string {
  return jwt.sign(
    { state, code_verifier: codeVerifier, provider },
    env.OAUTH_STATE_SECRET!,
    { expiresIn: STATE_COOKIE_TTL },
  );
}

export function verifyStateCookie(cookieJwt: string): StateCookiePayload {
  return jwt.verify(cookieJwt, env.OAUTH_STATE_SECRET!) as StateCookiePayload;
}

// openid-client v6 is pure ESM; our backend is CJS (`module: Node16`) so
// static `import * as oidc` trips TS1479. The `import type` above is
// compiler-only; loadOpenidClient() does the runtime ESM load lazily and
// caches the module promise. Mirrors oidcProvider.ts.
let oidcModulePromise: Promise<typeof OpenidClient> | undefined;

function loadOpenidClient(): Promise<typeof OpenidClient> {
  if (!oidcModulePromise) {
    oidcModulePromise = import('openid-client');
  }
  return oidcModulePromise;
}

/** Local part of an email (substring before `@`); middle tier of the
 *  displayName fallback. Empty string if no `@`; caller falls through to
 *  `'User'`. */
function emailLocalPart(email: string): string {
  return email.split('@')[0] ?? '';
}

export type InitiateResult = {
  url: string;
  stateCookie: string;
};

export type CallbackResult = {
  token: string;
  user: ReturnType<typeof sanitizeUser>;
};

/**
 * SINGLE source of truth for the OAuth `redirect_uri`. Both /authorize
 * (initiate) and the token exchange (handleCallback) MUST send the exact
 * same string, or Google returns `redirect_uri_mismatch`. Deriving it from
 * `env.FRONTEND_URL` (server-controlled) instead of `req.get('host')`
 * (client-controlled Host header) eliminates a whole class of failure
 * modes and blocks Host-header manipulation from reaching openid-client.
 */
export function buildOAuthRedirectUri(): string {
  return `${env.FRONTEND_URL}/api/auth/oauth/callback`;
}

export class OAuthService {
  async initiate(provider: string): Promise<InitiateResult> {
    const p = providerRegistry.get(provider);
    if (!env.oauthEnabled || !p) {
      throw new OAuthNotConfiguredError(provider);
    }

    const oidc = await loadOpenidClient();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();

    const redirectUri = buildOAuthRedirectUri();
    const url = await p.getAuthorizationUrl(
      redirectUri,
      state,
      codeVerifier,
    );
    const stateCookie = buildStateCookie(provider, state, codeVerifier);

    return { url, stateCookie };
  }

  async handleCallback(
    provider: string,
    callbackUrl: string,
    queryState: string,
    cookieJwt: string,
    acceptLanguage?: string | string[] | undefined,
  ): Promise<CallbackResult> {
    const payload = verifyStateCookie(cookieJwt);

    // Defense-in-depth: v6's authorizationCodeGrant also validates state,
    // but checking here first yields a precise error and avoids a network
    // round-trip on a tampered callback.
    if (payload.provider !== provider || payload.state !== queryState) {
      throw new StateMismatchError();
    }

    const p = providerRegistry.get(provider);
    if (!p) {
      throw new OAuthNotConfiguredError(provider);
    }

    const tokenSet = await p.exchangeCode(
      callbackUrl,
      payload.code_verifier,
      payload.state,
    );
    const info: OAuthUserInfo = await p.fetchUserInfo(tokenSet.accessToken);

    if (!info.emailVerified) {
      throw new UnverifiedEmailError(info.email);
    }

    // Lowercase to match the email stored by local auth (authService.ts:33
    // and :42 both lowercase), so the email-based link below finds existing
    // users.
    const email = info.email.toLowerCase();

    const { user } = await AppDataSource.transaction(async (manager) => {
      const identityRepo = manager.getRepository(UserIdentity);
      const userRepo = manager.getRepository(User);

      // (a) Returning user: identity exists — preserve displayName.
      const existingIdentity = await identityRepo.findOne({
        where: { provider: info.provider, subject: info.subject },
        relations: { user: true },
      });
      if (existingIdentity) {
        return { user: existingIdentity.user, isNew: false };
      }

      // (b) Existing local-auth user with matching email → LINK
      // (Q1=a; no password check).
      let user = await userRepo.findOne({ where: { email } });
      if (user) {
        const identity = identityRepo.create({
          userId: user.id,
          user,
          provider: info.provider,
          subject: info.subject,
          email,
        });
        await identityRepo.save(identity);
        return { user, isNew: false };
      }

      // (c) New user. Three-tier fallback keeps User.displayName
      // (varchar NOT NULL) always populated.
      if (!env.OAUTH_CONFIG?.autoRegister) {
        throw new UserNotRegisteredError(email);
      }
      const displayName = info.displayName ?? emailLocalPart(email) ?? 'User';
      // ADR-0018 D3: device-language capture on FIRST sign-in only.
      // Preference order: IdP `locale` claim → browser Accept-Language
      // header → 'en'. Returning-OAuth and link-by-email branches above
      // never touch user.language (mirror of ADR-0013 displayName
      // preservation — the user owns their preference via Account).
      const language = normalizeRequestedLanguage(info.locale ?? acceptLanguage);
      user = userRepo.create({ email, displayName, passwordHash: null, language });
      user = await userRepo.save(user);
      // ADR-0014 §42: any new user-creation path MUST also call invitationService.attachPendingInvitationsForEmail(newUser) at this point.
      await invitationService.attachPendingInvitationsForEmail(user, manager);
      const identity = identityRepo.create({
        userId: user.id,
        user,
        provider: info.provider,
        subject: info.subject,
        email,
      });
      await identityRepo.save(identity);
      return { user, isNew: true };
    });

    // Reuse the existing app JWT contract ({userId, email}, 7d) — never
    // include the IdP access token or any extra claims.
    const token = signAuthToken({ userId: user.id, email: user.email });
    return { token, user: sanitizeUser(user) };
  }
}
