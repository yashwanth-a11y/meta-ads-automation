import { trendIngestionService } from '../../services/TrendIngestionService.js';
import { contentIntelligenceService } from '../../services/ContentIntelligenceService.js';
import { scriptGeneratorService } from '../../services/ScriptGeneratorService.js';
import { channelService } from '../../services/ChannelService.js';
import { approvalService } from '../../services/ApprovalService.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { pipelineRuns } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { notificationService } from '../../services/NotificationService.js';

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

  // Manual trigger: fire-and-forget, returns runId immediately for status polling
  app.post('/ingest/run', async (req, reply) => {
    const runId = uuidv4();

    try {
      await db.insert(pipelineRuns).values({ id: runId, status: 'running', started_at: new Date() });
    } catch (err) {
      if (err?.code !== '42P01') throw err;
      // pipeline_runs table not migrated yet — proceed without DB tracking
    }

    const orgId = req.user.organization_id ?? req.user.id;

    setImmediate(async () => {
      const stats = { ingested: 0, skipped: 0, classified: 0, scored: 0, errors: [] };
      try {
        const ingestResult = await trendIngestionService.runAll();
        stats.ingested = ingestResult.ingested;
        stats.skipped = ingestResult.skipped;
        if (ingestResult.errors?.length) stats.errors.push(...ingestResult.errors);

        const { classified } = await contentIntelligenceService.classifyPendingCandidates();
        stats.classified = classified;

        const { totalScored } = await contentIntelligenceService.scoreCandidatesForAllChannels();
        stats.scored = totalScored;

        await db.update(pipelineRuns).set({
          status: 'done',
          completed_at: new Date(),
          ingested: stats.ingested,
          skipped: stats.skipped,
          classified: stats.classified,
          scored: stats.scored,
          errors: stats.errors,
        }).where(eq(pipelineRuns.id, runId));

        notificationService.notify(orgId, {
          type: 'pipeline_done',
          runId,
          ingested: stats.ingested,
          classified: stats.classified,
          scored: stats.scored,
        });

        console.info('[Trends] Manual pipeline complete —', stats);
      } catch (err) {
        stats.errors.push(err.message);
        console.error('[Trends] Manual pipeline failed:', err.message);
        try {
          await db.update(pipelineRuns).set({
            status: 'failed',
            completed_at: new Date(),
            errors: stats.errors,
          }).where(eq(pipelineRuns.id, runId));
        } catch (_) { /* ignore DB error on failure path */ }
        notificationService.notify(orgId, {
          type: 'pipeline_failed',
          runId,
          error: err.message,
        });
      }
    });

    return reply.code(202).send({ runId });
  });

  // Poll status of a manual pipeline run
  app.get('/ingest/status/:runId', async (req, reply) => {
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, req.params.runId));
    if (!run) throw app.httpErrors.notFound('Run not found');
    return reply.send(run);
  });

  // Update custom labels on a trend candidate
  app.patch('/candidates/:id/labels', async (req, reply) => {
    const { custom_labels } = req.body ?? {};
    if (!Array.isArray(custom_labels)) throw app.httpErrors.badRequest('custom_labels must be an array');
    const { db } = await import('../../db/index.js');
    const { trendCandidates } = await import('../../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [updated] = await db
      .update(trendCandidates)
      .set({ custom_labels })
      .where(eq(trendCandidates.id, req.params.id))
      .returning();
    if (!updated) throw app.httpErrors.notFound('Trend not found');
    return reply.send(updated);
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
