import { publishingService } from '../../services/PublishingService.js';
import { channelService } from '../../services/ChannelService.js';

export default async function routes(app) {
  const orgId = (req) => req.user.sub;

  // List all creative bundles (acts as publish job list)
  app.get('/jobs', { preHandler: app.requireAuth }, async (req) => {
    return publishingService.listJobs(orgId(req));
  });

  // Get a specific bundle / publish job
  app.get('/jobs/:jobId', { preHandler: app.requireAuth }, async (req) => {
    const job = await publishingService.getJob(req.params.jobId, orgId(req));
    if (!job) throw app.httpErrors.notFound('Job not found');
    return job;
  });

  // Manual publish from dashboard (bypasses approval email flow)
  app.post('/creatives/:creativeId/publish', { preHandler: app.requireAuth }, async (req, reply) => {
    const job = await publishingService.getJob(req.params.creativeId, orgId(req));
    if (!job) throw app.httpErrors.notFound('Creative not found');
    if (!['ready', 'approved'].includes(job.status)) {
      throw app.httpErrors.badRequest(`Cannot publish creative with status '${job.status}' — must be 'ready' or 'approved'`);
    }

    const channel = await channelService.get(orgId(req), job.channel_id);
    const result = await publishingService.publish(channel, job);
    return reply.code(200).send(result);
  });

  // Retry a failed publish job
  app.post('/jobs/:jobId/retry', { preHandler: app.requireAuth }, async (req, reply) => {
    const job = await publishingService.getJob(req.params.jobId, orgId(req));
    if (!job) throw app.httpErrors.notFound('Job not found');

    const channel = await channelService.get(orgId(req), job.channel_id);
    const result = await publishingService.publish(channel, job);
    return reply.code(200).send(result);
  });
}
