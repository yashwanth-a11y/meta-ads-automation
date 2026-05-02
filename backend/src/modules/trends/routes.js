import { notImplemented } from '../../lib/errors.js';

// MS1 — Twitter/X is primary signal. Sources also include Google Trends,
// Product Hunt, RSS bundle, AI directories, custom URLs. Pipeline: ingest
// → dedupe (cosine > 0.88) → freshness gate (≤48h) → verify → cluster.
export default async function routes(app) {
  // Sources (per channel toggles + global handles/keywords/hashtags)
  app.get('/sources', async () => {
    throw notImplemented('trends.sources.list');
  });

  app.post('/sources', async () => {
    throw notImplemented('trends.sources.create');
  });

  app.patch('/sources/:sourceId', async () => {
    throw notImplemented('trends.sources.update');
  });

  // Candidates (ingested items, pre-ranking)
  app.get('/candidates', async () => {
    throw notImplemented('trends.candidates.list');
  });

  app.get('/candidates/:candidateId', async () => {
    throw notImplemented('trends.candidates.get');
  });

  // Ranked top-N for a channel
  app.get('/channels/:channelId/top', async () => {
    throw notImplemented('trends.channels.top');
  });

  // Manual triggers (testing / on-demand)
  app.post('/ingest/run', async () => {
    throw notImplemented('trends.ingest.run');
  });

  app.post('/channels/:channelId/refresh', async () => {
    throw notImplemented('trends.channels.refresh');
  });
}
