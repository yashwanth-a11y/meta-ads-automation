import Fastify from 'fastify';
import { env } from './config/env.js';
import { registerPlugins } from './plugins/index.js';
import { registerModules } from './modules/index.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: true,
    disableRequestLogging: false,
    ...opts,
  });

  await registerPlugins(app);
  await registerModules(app);

  return app;
}
