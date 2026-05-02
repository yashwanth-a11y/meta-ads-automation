import { notImplemented } from '../../lib/errors.js';

// MS2 — GenUI Ad Builder. Conversational input → draft (objective, audience,
// placements, budget, schedule, format, text/headline/description variants,
// CTA, creative brief, risk flag). Two-stage publish: PhotonX draft → user
// approve → push to Meta with idempotency key.
export default async function routes(app) {
  // Drafts
  app.get('/drafts', async () => {
    throw notImplemented('ads.drafts.list');
  });

  app.get('/drafts/:draftId', async () => {
    throw notImplemented('ads.drafts.get');
  });

  // GenUI conversational ad creation
  app.post('/generate', async () => {
    throw notImplemented('ads.generate');
  });

  app.post('/drafts/:draftId/refine', async () => {
    throw notImplemented('ads.drafts.refine');
  });

  // Approval + publish to Meta
  app.post('/drafts/:draftId/approve', async () => {
    throw notImplemented('ads.drafts.approve');
  });

  app.post('/drafts/:draftId/publish', async () => {
    throw notImplemented('ads.drafts.publish');
  });

  // Campaigns (mirrors Meta state)
  app.get('/campaigns', async () => {
    throw notImplemented('ads.campaigns.list');
  });

  app.get('/campaigns/:campaignId', async () => {
    throw notImplemented('ads.campaigns.get');
  });

  app.post('/campaigns/:campaignId/pause', async () => {
    throw notImplemented('ads.campaigns.pause');
  });

  app.post('/campaigns/:campaignId/archive', async () => {
    throw notImplemented('ads.campaigns.archive');
  });

  // Compliance pre-check (ad policy categories)
  app.post('/compliance-check', async () => {
    throw notImplemented('ads.complianceCheck');
  });
}
