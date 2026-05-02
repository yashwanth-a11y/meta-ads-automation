import { notImplemented } from '../../lib/errors.js';

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
}
