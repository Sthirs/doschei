import { createApp } from './app';
import { env } from './config/env';
import { initializeDatabase } from './db/data-source';
import { initOAuthProviders } from './services/oauth/providerRegistry';
import { seedDatabase } from './services/seedService';

const bootstrap = async () => {
  await initializeDatabase();

  // OAuth discovery is lazy + non-fatal: a misconfigured or unreachable
  // OAuth IdP logs an error and leaves the provider un-registered; the
  // /api/auth/oauth/* routes will return 503 until restart. Defense-in-depth
  // .catch() — initOAuthProviders already swallows internally, but a stray
  // throw would otherwise become an unhandled promise rejection.
  await initOAuthProviders().catch((error) => {
    console.error('[oauth] Failed to initialize OAuth providers', error);
  });

  if (env.SEED_ON_STARTUP) {
    await seedDatabase();
  }

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
