import { notImplemented } from '../../lib/errors.js';

// MS1 — JWT-signed approval links (single-use, 48h expiry). Routes here
// serve both the email-driven public action endpoints (no auth, token in
// query/path) and the dashboard-driven endpoints (auth required).
export default async function routes(app) {
  // Public — token-gated. Audited (IP + user-agent).
  app.get('/preview/:token', async () => {
    throw notImplemented('approvals.preview');
  });

  app.post('/approve/:token', async () => {
    throw notImplemented('approvals.approve');
  });

  app.post('/reject/:token', async () => {
    throw notImplemented('approvals.reject');
  });

  app.post('/regenerate/:token', async () => {
    throw notImplemented('approvals.regenerate');
  });

  // Authenticated — dashboard view of pending approvals
  app.get('/', { preHandler: app.requireAuth }, async () => {
    throw notImplemented('approvals.list');
  });

  app.get('/:approvalId', { preHandler: app.requireAuth }, async () => {
    throw notImplemented('approvals.get');
  });

  // Resend approval email
  app.post('/:approvalId/resend', { preHandler: app.requireAuth }, async () => {
    throw notImplemented('approvals.resend');
  });
}
