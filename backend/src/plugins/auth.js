import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

async function plugin(app) {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  app.decorate('requireAuth', async function (request) {
    try {
      await request.jwtVerify();
    } catch (_err) {
      throw unauthorized();
    }
  });

  app.decorateRequest('tenantId', null);

  app.addHook('preHandler', async (request) => {
    if (request.user && typeof request.user === 'object') {
      request.tenantId = request.user.tenantId ?? null;
    }
  });
}

export default fp(plugin, { name: 'auth', dependencies: [] });
