import { notImplemented } from '../../lib/errors.js';

// MS2 — GenUI analytics. Tool-calling over typed analytics functions
// (list_campaigns, get_campaign_performance, top_creatives_by_metric,
// lead_funnel_breakdown, anomaly_detect). LLM never sees raw SQL.
// Responses pair text with chart components and suggested next prompts.
// Action prompts surface as buttons going through normal approval flow.
export default async function routes(app) {
  // Conversational query endpoint
  app.post('/query', async () => {
    throw notImplemented('analytics.query');
  });

  // Direct, typed analytics functions (also exposed for the LLM tools layer)
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

  // AI summaries (daily/weekly) — generated and stored by a worker;
  // these endpoints serve them to the UI and email.
  app.get('/summaries/daily', async () => {
    throw notImplemented('analytics.summaries.daily');
  });

  app.get('/summaries/weekly', async () => {
    throw notImplemented('analytics.summaries.weekly');
  });
}
