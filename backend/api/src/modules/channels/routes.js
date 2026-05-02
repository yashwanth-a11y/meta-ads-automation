import { notImplemented } from '../../lib/errors.js';

// MS1 — channel definition (name, niche, audience, tone, language, schedule),
// brand assets, approval mode, few-shot library, cooldowns, negative-topic filters,
// trend-source toggles. Connected Instagram Business account.
export default async function routes(app) {
  app.get('/', async () => {
    throw notImplemented('channels.list');
  });

  app.post('/', async () => {
    throw notImplemented('channels.create');
  });

  app.get('/:channelId', async () => {
    throw notImplemented('channels.get');
  });

  app.patch('/:channelId', async () => {
    throw notImplemented('channels.update');
  });

  app.delete('/:channelId', async () => {
    throw notImplemented('channels.delete');
  });

  // Brand assets
  app.get('/:channelId/brand-assets', async () => {
    throw notImplemented('channels.brandAssets.list');
  });

  app.post('/:channelId/brand-assets', async () => {
    throw notImplemented('channels.brandAssets.upload');
  });

  // Few-shot examples
  app.get('/:channelId/examples', async () => {
    throw notImplemented('channels.examples.list');
  });

  app.post('/:channelId/examples', async () => {
    throw notImplemented('channels.examples.add');
  });

  // Approver list
  app.get('/:channelId/approvers', async () => {
    throw notImplemented('channels.approvers.list');
  });

  app.post('/:channelId/approvers', async () => {
    throw notImplemented('channels.approvers.add');
  });
}
