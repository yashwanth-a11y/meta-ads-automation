import { notImplemented, forbidden } from '../../lib/errors.js';
import { env } from '../../config/env.js';

export default async function routes(app) {
  app.post('/login', async () => {
    throw notImplemented('auth.login');
  });

  app.post('/refresh', async () => {
    throw notImplemented('auth.refresh');
  });

  app.post('/logout', async () => {
    throw notImplemented('auth.logout');
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request) => ({
    user: request.user ?? null,
  }));

  // --- Dev-only: mint a JWT bound to a test user + organization. Useful for
  // hitting protected routes from curl/Postman before real auth is wired. ---
  app.post(
    '/dev-token',
    {
      schema: {
        description:
          'Mint a JWT for local development. 403 in non-dev environments. ' +
          'Body: { organization_id?: string, user_id?: string, email?: string, expires_in?: string }',
        body: {
          type: 'object',
          properties: {
            organization_id: { type: 'string' },
            user_id: { type: 'string' },
            email: { type: 'string' },
            expires_in: { type: 'string' }, // e.g., "7d", "1h"
          },
        },
      },
    },
    async (request) => {
      if (env.NODE_ENV !== 'development') {
        throw forbidden('dev-token endpoint disabled outside development');
      }
      const body = request.body ?? {};
      const organization_id = body.organization_id || 'org_dev_local';
      const id = body.user_id || 'usr_dev_local';
      const email = body.email || 'dev@growthos.local';
      const payload = { id, organization_id, tenantId: organization_id, email };
      const token = await app.jwt.sign(payload, body.expires_in ? { expiresIn: body.expires_in } : undefined);
      return { token, payload, hint: "Send as 'Authorization: Bearer <token>'" };
    },
  );
}
