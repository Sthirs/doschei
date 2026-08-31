import { initializeDatabase } from '../db/data-source';
import { seedDatabase } from '../services/seedService';

const run = async () => {
  await initializeDatabase();
  await seedDatabase();
  console.log('Seed completed.');
  process.exit(0);
};

run().catch((error: unknown) => {
  console.error('Seed failed.', error);
  process.exit(1);
});
