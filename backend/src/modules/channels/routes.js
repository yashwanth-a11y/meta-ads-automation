import { channelService } from '../../services/ChannelService.js';

// MS1 — channel definition: name, niche, audience, tone, language, schedule,
// brand assets, approval mode, few-shot library, cooldowns, negative-topic filters,
// trend-source toggles. Connected Instagram Business account.
export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  app.get('/', async (req) => {
    return channelService.list(orgId(req));
  });

  app.post('/', async (req, reply) => {
    const channel = await channelService.create(orgId(req), req.body);
    return reply.code(201).send(channel);
  });

  app.get('/:channelId', async (req) => {
    return channelService.get(orgId(req), req.params.channelId);
  });

  app.patch('/:channelId', async (req) => {
    return channelService.update(orgId(req), req.params.channelId, req.body);
  });

  app.delete('/:channelId', async (req, reply) => {
    await channelService.delete(orgId(req), req.params.channelId);
    return reply.code(204).send();
  });

  // Brand assets — stored inside channel.brand_assets jsonb for now
  app.get('/:channelId/brand-assets', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    return ch.brand_assets ?? {};
  });

  app.post('/:channelId/brand-assets', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    const merged = { ...(ch.brand_assets ?? {}), ...req.body };
    return channelService.update(orgId(req), req.params.channelId, { brand_assets: merged });
  });

  // Few-shot examples — stored as array in channel.brand_assets.examples
  app.get('/:channelId/examples', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    return ch.brand_assets?.examples ?? [];
  });

  app.post('/:channelId/examples', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    const examples = [...(ch.brand_assets?.examples ?? []), req.body];
    const assets = { ...(ch.brand_assets ?? {}), examples };
    return channelService.update(orgId(req), req.params.channelId, { brand_assets: assets });
  });

  // Generate AI labels from channel profile
  app.post('/:channelId/generate-labels', async (req, reply) => {
    const labels = await channelService.generateLabels(orgId(req), req.params.channelId);
    return reply.send({ labels });
  });

  // Approvers — stored as array in channel.brand_assets.approvers
  app.get('/:channelId/approvers', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    return ch.brand_assets?.approvers ?? [];
  });

  app.post('/:channelId/approvers', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    const approvers = [...(ch.brand_assets?.approvers ?? []), req.body];
    const assets = { ...(ch.brand_assets ?? {}), approvers };
    return channelService.update(orgId(req), req.params.channelId, { brand_assets: assets });
  });

  // Generate AI event relevance profile for calendar personalisation
  app.post('/:channelId/generate-event-profile', async (req, reply) => {
    const profile = await channelService.generateEventProfile(orgId(req), req.params.channelId);
    return reply.send({ event_relevance_profile: profile });
  });

  // Get current event relevance profile
  app.get('/:channelId/event-profile', async (req) => {
    const ch = await channelService.get(orgId(req), req.params.channelId);
    return { event_relevance_profile: ch.brand_assets?.event_relevance_profile ?? null };
  });
}
