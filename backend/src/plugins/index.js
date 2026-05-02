import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { env } from '../config/env.js';
import authPlugin from './auth.js';
import errorHandlerPlugin from './error-handler.js';
import diPlugin from './di.js';

export async function registerPlugins(app) {
  await app.register(helmet, { global: true, contentSecurityPolicy: false });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(sensible);

  // File-upload support (used by /api/v1/ads/upload-image-file).
  await app.register(multipart, {
    limits: {
      fileSize: 30 * 1024 * 1024, // 30 MB matches Meta's adimages limit
      files: 1,
    },
  });

  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(diPlugin);
}
