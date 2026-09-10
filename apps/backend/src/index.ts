import { createApp } from './app';
import { env } from './config/env';
import { initializeDatabase } from './db/data-source';
import { initOAuthProviders } from './services/oauth/providerRegistry';
import { pruneExpiredRefreshTokens } from './services/refreshTokenService';
import { seedDatabase } from './services/seedService';

const bootstrap = async () => {
  await initializeDatabase();

  // OAuth discovery is lazy + non-fatal: a misconfigured or unreachable
  // OAuth IdP logs an error and leaves the provider un-registered; the
  // /api/auth/oauth/* routes will return 503 until restart. Defense-in-depth
  // .catch() — initOAuthProviders already swallows internally, but a stray
  // throw would otherwise become an unhandled promise rejection.
  await initOAuthProviders().catch((error: unknown) => {
    console.error('[oauth] Failed to initialize OAuth providers', error);
  });

  if (env.SEED_ON_STARTUP) {
    await seedDatabase();
  }

  // ADR-0023: a `secure` cookie is silently discarded by the browser over plain
  // HTTP, which would degrade every session to the access-token TTL with no
  // error anywhere. Warn rather than throw — a throw here would take down the
  // health probe and the whole deployment with it.
  if (env.NODE_ENV === 'production' && env.FRONTEND_URL.startsWith('http://')) {
    console.warn(
      '[auth] NODE_ENV=production with a plain-HTTP FRONTEND_URL: the refresh ' +
        'cookie is marked `secure` and browsers will drop it, so users will be ' +
        'signed out every ACCESS_TOKEN_TTL_SECONDS. Serve the app over HTTPS.',
    );
  }

  // Refresh-token retention (ADR-0023). Deliberately started here and NOT in
  // createApp(): the unit suites call createApp() in-process, and a live
  // interval there would keep Vitest from exiting. `.unref()` so the timer never
  // by itself holds the process open.
  await pruneExpiredRefreshTokens().catch((error: unknown) => {
    console.error('[auth] Failed to prune refresh tokens', error);
  });
  setInterval(
    () => {
      void pruneExpiredRefreshTokens().catch((error: unknown) => {
        console.error('[auth] Failed to prune refresh tokens', error);
      });
    },
    6 * 60 * 60 * 1000,
  ).unref();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
};

// Top-level boundary catch-all: intentionally broad — any unexpected
// startup failure (DB unreachable, port in use, etc.) must still log and
// exit non-zero rather than crash silently or leave a half-started
// process. Do not narrow this to a specific error type.
bootstrap().catch((error: unknown) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
