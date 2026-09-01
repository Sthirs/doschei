import type { Request, Response } from 'express';

import { env } from '../config/env';
import {
  buildOAuthRedirectUri,
  OAuthNotConfiguredError,
  OAuthService,
  StateMismatchError,
  UnverifiedEmailError,
  UserNotRegisteredError,
} from '../services/oauthService';

const oauthService = new OAuthService();

type CookiesBag = Record<string, string | undefined>;

function readStateCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: CookiesBag }).cookies;
  return cookies?.['doschei.oauth.state'];
}

export const oauthConfig = (_req: Request, res: Response): void => {
  res.json({
    enabled: env.oauthEnabled,
    buttonText: env.OAUTH_CONFIG?.buttonText ?? 'Sign in with OAuth',
    autoLaunch: env.OAUTH_CONFIG?.autoLaunch ?? false,
  });
};

export const oauthInitiate = async (req: Request, res: Response): Promise<void> => {
  const provider = 'oauth';
  try {
    const { url, stateCookie } = await oauthService.initiate(provider);
    res.cookie('doschei.oauth.state', stateCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    res.redirect(url);
  } catch (error: unknown) {
    if (error instanceof OAuthNotConfiguredError) {
      res.status(503).json({ message: error.message });
    } else {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown OAuth provider.' });
    }
  }
};

export const oauthCallback = async (req: Request, res: Response): Promise<void> => {
  const provider = 'oauth';
  const queryState = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieJwt = readStateCookie(req);

  if (!cookieJwt) {
    res.status(400).json({ message: 'Missing OAuth state cookie.', code: 'missing_state' });
    return;
  }

  const loggedFrontendUrl = env.FRONTEND_URL;
  if (!loggedFrontendUrl) {
    res.status(503).json({ message: 'OAuth frontend URL not configured.' });
    return;
  }

  // Build the callback URL from the server-controlled redirect URI (same
  // source of truth as /authorize — see buildOAuthRedirectUri in
  // oauthService.ts) and append ONLY the request's query string. openid-client
  // v6 derives the token-exchange `redirect_uri` from this URL's origin+path
  // via `stripParams()` (see openid-client/build/index.js:974) — using
  // req.protocol / req.get('host') here would let a spoofed Host header or a
  // missing `trust proxy` produce a redirect_uri that does not match the one
  // Google saw at /authorize, triggering `redirect_uri_mismatch`.
  const questionMarkIdx = req.originalUrl.indexOf('?');
  const queryString = questionMarkIdx >= 0 ? req.originalUrl.slice(questionMarkIdx) : '';
  const callbackUrl = `${buildOAuthRedirectUri()}${queryString}`;

  try {
    // ADR-0018 D3: thread the browser's Accept-Language header so the
    // service can fall back to it when the IdP does not emit a `locale`
    // claim (first-user-creation branch only; returning / link-by-email
    // branches never overwrite the user's saved language).
    const acceptLanguage = req.headers['accept-language'];
    const { token } = await oauthService.handleCallback(
      provider,
      callbackUrl,
      queryState,
      cookieJwt,
      acceptLanguage,
    );
    res.clearCookie('doschei.oauth.state', { path: '/' });
    res.redirect(`${loggedFrontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (error: unknown) {
    res.clearCookie('doschei.oauth.state', { path: '/' });
    if (error instanceof StateMismatchError) {
      res.status(400).json({ message: error.message, code: 'state_mismatch' });
    } else if (error instanceof UnverifiedEmailError) {
      res.status(400).json({ message: error.message, code: 'email_not_verified' });
    } else if (error instanceof UserNotRegisteredError) {
      res.status(403).json({ message: error.message, code: 'user_not_registered' });
    } else if (error instanceof OAuthNotConfiguredError) {
      res.status(503).json({ message: error.message });
    } else {
      res.status(400).json({ message: error instanceof Error ? error.message : 'OAuth callback failed.' });
    }
  }
};
