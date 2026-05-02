import { notImplemented } from '../../lib/errors.js';

// MS2 — Meta OAuth + ingestion. Scopes: ads_management, ads_read,
// leads_retrieval, pages_show_list, pages_read_engagement,
// pages_manage_metadata, business_management, instagram_content_publish.
// Selection UI: Business → Ad Account → Page → Instagram Account.
// Tokens encrypted at rest (per-tenant DEK).
export default async function routes(app) {
  // OAuth
  app.get('/oauth/start', async () => {
    throw notImplemented('meta.oauth.start');
  });

  app.get('/oauth/callback', async () => {
    throw notImplemented('meta.oauth.callback');
  });

  // Connection lifecycle
  app.get('/connections', async () => {
    throw notImplemented('meta.connections.list');
  });

  app.delete('/connections/:connectionId', async () => {
    throw notImplemented('meta.connections.disconnect');
  });

  // Asset selection (Business / Ad Account / Page / IG)
  app.get('/connections/:connectionId/businesses', async () => {
    throw notImplemented('meta.connections.businesses');
  });

  app.get('/connections/:connectionId/ad-accounts', async () => {
    throw notImplemented('meta.connections.adAccounts');
  });

  app.get('/connections/:connectionId/pages', async () => {
    throw notImplemented('meta.connections.pages');
  });

  app.get('/connections/:connectionId/instagram-accounts', async () => {
    throw notImplemented('meta.connections.igAccounts');
  });

  app.post('/connections/:connectionId/select', async () => {
    throw notImplemented('meta.connections.select');
  });

  // Sync (90d backfill on connect; hourly active / 6h paused)
  app.post('/connections/:connectionId/sync/backfill', async () => {
    throw notImplemented('meta.sync.backfill');
  });

  app.post('/connections/:connectionId/sync/incremental', async () => {
    throw notImplemented('meta.sync.incremental');
  });

  app.get('/connections/:connectionId/sync/status', async () => {
    throw notImplemented('meta.sync.status');
  });
}
