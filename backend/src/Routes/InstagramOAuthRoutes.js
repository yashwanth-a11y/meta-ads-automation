/**
 * Instagram OAuth and account-management routes.
 *
 * Mounts under /api/v1/instagram (set in modules/index.js).
 *
 * Every route is auth-protected via the `requireAuth` decorator (set up in
 * plugins/auth.js). The JWT carries the org_id we attach the new IG account
 * to on the exchange step.
 */
export async function instagramOAuthRoutes(fastify) {
  const controller = fastify.instagramOAuthController;
  const auth = fastify.requireAuth;

  fastify.get('/oauth/url', { preHandler: auth }, (req, reply) =>
    controller.getAuthUrl(req, reply),
  );

  fastify.post(
    '/oauth/exchange',
    {
      preHandler: auth,
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string' },
            redirect_uri: { type: 'string' },
          },
        },
      },
    },
    (req, reply) => controller.exchangeToken(req, reply),
  );

  fastify.get('/accounts', { preHandler: auth }, (req, reply) =>
    controller.getAccounts(req, reply),
  );

  fastify.get('/accounts/:accountId', { preHandler: auth }, (req, reply) =>
    controller.getAccount(req, reply),
  );

  fastify.delete('/accounts/:accountId', { preHandler: auth }, (req, reply) =>
    controller.disconnectAccount(req, reply),
  );

  fastify.post('/accounts/:accountId/refresh', { preHandler: auth }, (req, reply) =>
    controller.refreshAccount(req, reply),
  );

  fastify.get('/accounts/:accountId/media', { preHandler: auth }, (req, reply) =>
    controller.getMedia(req, reply),
  );

  fastify.post(
    '/accounts/:accountId/links',
    {
      preHandler: auth,
      schema: {
        body: {
          type: 'object',
          required: ['channel_id'],
          properties: { channel_id: { type: 'string' } },
        },
      },
    },
    (req, reply) => controller.linkChannel(req, reply),
  );

  fastify.delete(
    '/accounts/:accountId/links/:channelId',
    { preHandler: auth },
    (req, reply) => controller.unlinkChannel(req, reply),
  );
}
