import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { env } from '../config/env.js';
import authPlugin from './auth.js';
import errorHandlerPlugin from './error-handler.js';

export async function registerPlugins(app) {
  await app.register(helmet, { global: true, contentSecurityPolicy: false });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(sensible);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
}
