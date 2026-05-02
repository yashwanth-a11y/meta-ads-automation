import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { resolveHeyGenConfig } from './services/heygenClient.js';
import { resolveKlingConfig } from './services/klingClient.js';
import { resolveModelsLabConfig } from './services/modelsLabClient.js';
import { resolveReplicateConfig } from './services/replicateVideoClient.js';

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

  const video = [];
  if (resolveModelsLabConfig()) video.push('ModelsLab');
  if (resolveHeyGenConfig()) video.push('HeyGen');
  if (resolveReplicateConfig()) video.push('Replicate');
  if (resolveKlingConfig()) video.push('Kling');
  app.log.info(
    {
      creativesVideoBackends: video,
      creativesVideoPriority:
        'ModelsLab if MODELS_LAB_API_KEY; else HeyGen if API key + avatar + voice; else Replicate; else Kling.',
    },
    'Creatives script→video: configured providers',
  );
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
