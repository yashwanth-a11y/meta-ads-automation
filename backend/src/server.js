import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { startScheduler } from './scheduler.js';

const app = await buildApp();

const shutdown = async (signal) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'unhandled promise rejection');
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  // Start scheduler only after server is bound and healthy
  startScheduler(app.log);
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}

