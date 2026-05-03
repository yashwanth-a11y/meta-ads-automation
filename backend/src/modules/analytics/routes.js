import { notImplemented } from '../../lib/errors.js';

// MS2 — GenUI analytics. Dashboard pulls real CTWA insights + conversation attribution.
export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  app.get('/dashboard', async (req) => {
    const raw = req.query?.days;
    const days = raw !== undefined ? parseInt(String(raw), 10) : 28;
    return app.adsService.getDashboardAnalytics(orgId(req), {
      days: Number.isFinite(days) && days > 0 && days <= 366 ? days : 28,
    });
  });

  // Conversational query endpoint
  app.post('/query', async () => {
    throw notImplemented('analytics.query');
  });

  app.get('/campaigns', async () => {
    throw notImplemented('analytics.campaigns');
  });

  app.get('/campaigns/:campaignId/performance', async () => {
    throw notImplemented('analytics.campaign.performance');
  });

  app.get('/creatives/top', async () => {
    throw notImplemented('analytics.creatives.top');
  });

  app.get('/leads/funnel', async () => {
    throw notImplemented('analytics.leads.funnel');
  });

  app.get('/anomalies', async () => {
    throw notImplemented('analytics.anomalies');
  });

  app.get('/summaries/daily', async () => {
    throw notImplemented('analytics.summaries.daily');
  });

  app.get('/summaries/weekly', async () => {
    throw notImplemented('analytics.summaries.weekly');
  });
}
