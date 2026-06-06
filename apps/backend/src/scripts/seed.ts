import { initializeDatabase } from '../db/data-source';
import { seedDatabase } from '../services/seedService';

const run = async () => {
  await initializeDatabase();
  await seedDatabase();
  // eslint-disable-next-line no-console
  console.log('Seed completed.');
  process.exit(0);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed.', error);
  process.exit(1);
});
