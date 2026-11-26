import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { seedDatabaseIfEmpty } from './services/seedService';

async function bootstrap() {
  await connectDB();
  await seedDatabaseIfEmpty();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[Server] FactoryFlow API running on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
