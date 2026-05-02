import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env.js';
import authPlugin from './auth.js';
import diPlugin from './di.js';
import errorHandlerPlugin from './error-handler.js';

export async function registerPlugins(app) {
  // Swagger must be registered before routes
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'PhotonX GrowthOS API',
        description: 'AI marketing automation — trends → content → ads → leads',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'health', description: 'Health checks' },
        { name: 'auth', description: 'Authentication' },
        { name: 'tenants', description: 'Tenant management' },
        { name: 'channels', description: 'MS1 — Channel configuration' },
        { name: 'trends', description: 'MS1 — Trend ingestion & ranking' },
        { name: 'creatives', description: 'MS1 — Creative generation & scoring' },
        { name: 'approvals', description: 'MS1 — Approval flow' },
        { name: 'publishing', description: 'MS1 — Instagram publishing' },
        { name: 'meta', description: 'MS2 — Meta OAuth & sync' },
        { name: 'ads', description: 'MS2 — Ad generation & campaigns' },
        { name: 'leads', description: 'MS2 — CRM & lead management' },
        { name: 'analytics', description: 'MS2 — GenUI analytics & summaries' },
        { name: 'webhooks', description: 'Inbound webhooks (Meta, email)' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: false,
  });

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
    skipOnError: true,
  });

  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(diPlugin);
}
