import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

async function plugin(app) {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  // Verify JWT and reject the request if invalid. Used as `preHandler` or
  // `onRequest` hook on protected routes. Two names for the same thing —
  // `requireAuth` matches our internal style, `authenticate` matches the
  // imported Meta Ads route file. Keep both so neither side has to change.
  const authenticate = async function (request) {
    try {
      await request.jwtVerify();
    } catch (_err) {
      throw unauthorized();
    }
  };

  app.decorate('requireAuth', authenticate);
  app.decorate('authenticate', authenticate);

  app.decorateRequest('tenantId', null);

  app.addHook('preHandler', async (request) => {
    if (request.user && typeof request.user === 'object') {
      request.tenantId = request.user.tenantId ?? request.user.organization_id ?? null;
    }
  });
}

export default fp(plugin, { name: 'auth', dependencies: [] });
