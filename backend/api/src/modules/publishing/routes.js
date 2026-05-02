import { notImplemented } from '../../lib/errors.js';

// MS1 — Instagram Content Publishing API: create container with caption +
// hosted video URL, poll until FINISHED, then publish. Music via Meta Sound
// Collection (only licensed source for Business accounts).
export default async function routes(app) {
  app.get('/jobs', async () => {
    throw notImplemented('publishing.jobs.list');
  });

  app.get('/jobs/:jobId', async () => {
    throw notImplemented('publishing.jobs.get');
  });

  // Manual publish (e.g., from dashboard)
  app.post('/creatives/:creativeId/publish', async () => {
    throw notImplemented('publishing.creatives.publish');
  });

  // Retry a failed publish job
  app.post('/jobs/:jobId/retry', async () => {
    throw notImplemented('publishing.jobs.retry');
  });
}
