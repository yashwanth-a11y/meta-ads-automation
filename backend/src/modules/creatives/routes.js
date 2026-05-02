import { notImplemented } from '../../lib/errors.js';

// MS1 — creative bundle per top idea: hook, script, CTA, caption, hashtags,
// voiceover with markers, per-scene visual prompts. Reels rendered 1080×1920
// H.264/AAC, 15–45s, ≤90 MB. Scoring across 6 dimensions; <7 auto-discard,
// 7–8.5 manual approval, >8.5 auto-publish (if channel allows).
export default async function routes(app) {
  app.get('/', async () => {
    throw notImplemented('creatives.list');
  });

  app.get('/:creativeId', async () => {
    throw notImplemented('creatives.get');
  });

  // Generate a creative bundle from a candidate idea
  app.post('/generate', async () => {
    throw notImplemented('creatives.generate');
  });

  // Regenerate (e.g., after rejection with reason)
  app.post('/:creativeId/regenerate', async () => {
    throw notImplemented('creatives.regenerate');
  });

  // Render the video (kicks off render job)
  app.post('/:creativeId/render', async () => {
    throw notImplemented('creatives.render');
  });

  app.get('/:creativeId/render-status', async () => {
    throw notImplemented('creatives.renderStatus');
  });

  // Score (6 dimensions + composite)
  app.post('/:creativeId/score', async () => {
    throw notImplemented('creatives.score');
  });

  app.get('/:creativeId/score', async () => {
    throw notImplemented('creatives.scoreGet');
  });
}
