import { trendIngestionService } from '../../services/TrendIngestionService.js';
import { contentIntelligenceService } from '../../services/ContentIntelligenceService.js';
import { scriptGeneratorService } from '../../services/ScriptGeneratorService.js';
import { channelService } from '../../services/ChannelService.js';
import { approvalService } from '../../services/ApprovalService.js';
import { env } from '../../config/env.js';

// MS1 — trend pipeline: ingest → classify → score per channel → generate bundles
export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  // List ingested candidates with optional filters
  app.get('/candidates', async (req) => {
    const { classification, lifecycle_stage, limit } = req.query;
    return trendIngestionService.listCandidates({
      classification,
      lifecycle_stage,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  });

  app.get('/candidates/:candidateId', async (req) => {
    const { db } = await import('../../db/index.js');
    const { trendCandidates } = await import('../../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(trendCandidates)
      .where(eq(trendCandidates.id, req.params.candidateId));
    if (!row) throw app.httpErrors.notFound('Candidate not found');
    return row;
  });

  // Top scored trends for a specific channel
  app.get('/channels/:channelId/top', async (req) => {
    const { channelId } = req.params;
    const { min_score, limit } = req.query;
    return contentIntelligenceService.getTopForChannel(channelId, orgId(req), {
      minScore: min_score ? parseFloat(min_score) : 5,
      limit: limit ? parseInt(limit, 10) : 5,
    });
  });

  // Manual trigger: run full ingestion pipeline
  app.post('/ingest/run', async (_req, reply) => {
    // Run async, return immediately with job status
    const summary = await trendIngestionService.runAll();

    // Classify newly ingested candidates
    const { classified } = await contentIntelligenceService.classifyPendingCandidates();

    // Score for all active channels of this org
    const { totalScored } = await contentIntelligenceService.scoreCandidatesForAllChannels();

    return reply.code(200).send({ ...summary, classified, scored: totalScored });
  });

  // Refresh trends for a specific channel (includes brand keyword ingestion)
  app.post('/channels/:channelId/refresh', async (req, reply) => {
    const channel = await channelService.get(orgId(req), req.params.channelId);

    // Ingest brand-specific keywords via Tavily
    const brandResult = await trendIngestionService.ingestBrandKeywords(channel, env.TAVILY_API_KEY);

    // Classify + score
    await contentIntelligenceService.classifyPendingCandidates(20);
    const { scored } = await contentIntelligenceService.scoreCandidatesForChannel(channel);

    return reply.code(200).send({ ...brandResult, scored });
  });

  // Generate a creative bundle from a specific trend for a channel
  app.post('/channels/:channelId/generate', async (req, reply) => {
    const { trend_candidate_id } = req.body;
    if (!trend_candidate_id) throw app.httpErrors.badRequest('trend_candidate_id is required');

    const channel = await channelService.get(orgId(req), req.params.channelId);

    const { db } = await import('../../db/index.js');
    const { trendCandidates, trendScores } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');

    const [trendRow] = await db.select().from(trendCandidates).where(eq(trendCandidates.id, trend_candidate_id));
    if (!trendRow) throw app.httpErrors.notFound('Trend candidate not found');

    const [scoreRow] = await db
      .select()
      .from(trendScores)
      .where(and(eq(trendScores.trend_candidate_id, trend_candidate_id), eq(trendScores.channel_id, channel.id)));

    const trend = {
      ...trendRow,
      brand_fit: scoreRow
        ? {
            composite_score: Number(scoreRow.composite_score),
            adaptation_idea: scoreRow.adaptation_idea,
          }
        : null,
    };

    const bundle = await scriptGeneratorService.generateBundle(channel, trend);

    // Score the generated bundle
    const scores = await scriptGeneratorService.scoreBundle(bundle, channel);

    // Start topic cooldown
    await contentIntelligenceService.markTopicUsed(
      channel.id, orgId(req), trendRow.title, channel.topic_cooldown_days,
    );

    // Send content review email (fire-and-forget)
    approvalService.sendContentReviewEmail(channel, bundle, trendRow).catch((err) =>
      console.error('[Trends] sendContentReviewEmail failed:', err.message),
    );

    return reply.code(201).send({ ...bundle, quality_scores: scores });
  });

  // Verify an X / Twitter handle exists
  app.get('/verify-x-handle/:handle', async (req, reply) => {
    const { handle } = req.params;
    if (!env.X_BEARER_TOKEN) throw app.httpErrors.serviceUnavailable('X API not configured');
    const res = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`, {
      headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return reply.send({ valid: false });
    if (!res.ok) throw app.httpErrors.serviceUnavailable('X API error');
    const data = await res.json();
    return reply.send({ valid: true, name: data.data?.name, username: data.data?.username });
  });

  // Trend sources config (per channel toggle)
  app.get('/sources', async (req) => {
    const channels = await channelService.list(orgId(req));
    return channels.map((c) => ({ channel_id: c.id, channel_name: c.name, sources: c.trend_sources }));
  });

  app.post('/sources', async (req) => {
    const { channel_id, sources } = req.body;
    return channelService.update(orgId(req), channel_id, { trend_sources: sources });
  });

  app.patch('/sources/:sourceId', async (req) => {
    const { channel_id, enabled } = req.body;
    const channel = await channelService.get(orgId(req), channel_id);
    const updated = { ...(channel.trend_sources ?? {}), [req.params.sourceId]: enabled };
    return channelService.update(orgId(req), channel_id, { trend_sources: updated });
  });
}
