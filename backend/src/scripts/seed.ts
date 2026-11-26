import { connectDB, disconnectDB } from '../config/db';
import { resetAndReseedDatabase } from '../services/seedService';

async function main() {
  await connectDB();
  const res = await resetAndReseedDatabase();
  console.log('Seed completed:', res);
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
