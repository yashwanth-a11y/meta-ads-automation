import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
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

  // Global rate-limit infra. Disabled by default; individual routes opt in via
  // their `config: { rateLimit: { max, timeWindow } }`. Used today by /signup
  // (10/min) and /login (5/min) to make brute-force attacks expensive.
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true, // if the limiter store breaks, don't take down auth
  });

  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(diPlugin);
}
