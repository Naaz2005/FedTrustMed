import { seedDatabase } from './seedDatabase.js';

seedDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
