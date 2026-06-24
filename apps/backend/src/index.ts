import { createApp } from './app';
import { env } from './config/env';
import { initializeDatabase } from './db/data-source';
import { seedDatabase } from './services/seedService';

const bootstrap = async () => {
  await initializeDatabase();

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
