import { notImplemented } from '../../lib/errors.js';

// Live-fetch analytics endpoints. Each route hits Meta's Marketing API on
// every request — the service deliberately does NOT cache to DB. The legacy
// `/dashboard` endpoint was CTWA-only via the synced ctwa_insights_cache; we
// now serve org-wide insights for every campaign type from Meta directly,
// while still surfacing CTWA conversation-source breakdown from our DB
// (kept as a supplementary section when CTWA data exists).
export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  // Pulls `?date_preset=` and `?days=` from the query string. Both optional —
  // the service falls back to last_28d.
  const parseRangeQuery = (req) => ({
    date_preset: req.query?.date_preset ? String(req.query.date_preset) : undefined,
    days: req.query?.days != null ? Number(req.query.days) : undefined,
  });

  app.get('/dashboard', async (req) => {
    return app.analyticsService.getDashboard(orgId(req), parseRangeQuery(req));
  });

  app.get('/campaigns', async (req) => {
    return app.analyticsService.getCampaigns(orgId(req), parseRangeQuery(req));
  });

  app.get('/ads/top', async (req) => {
    const limitRaw = req.query?.limit;
    const limit = limitRaw != null ? Number(limitRaw) : undefined;
    return app.analyticsService.getTopAds(orgId(req), {
      ...parseRangeQuery(req),
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  });

  // Stubs kept for future expansion — explicitly 501 so callers know they
  // exist on the routing tree but aren't implemented.
  app.post('/query', async () => {
    throw notImplemented('analytics.query');
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
