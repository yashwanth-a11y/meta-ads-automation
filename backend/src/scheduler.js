/**
 * GrowthOS Background Scheduler — DB-backed, restart-safe
 *
 * On startup:
 *   1. Checks when the last completed run was.
 *   2. If > CRON_INTERVAL_HOURS ago (or never ran), runs immediately.
 *   3. Then runs every CRON_INTERVAL_HOURS hours via setInterval.
 *
 * Each run:
 *   Ingest → Classify → Score → Generate bundles → Send approval emails
 */

import { desc, eq, isNull, lt, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db/index.js';
import { pipelineRuns, channels, trendCandidates, trendScores } from './db/schema.js';
import { trendIngestionService } from './services/TrendIngestionService.js';
import { contentIntelligenceService } from './services/ContentIntelligenceService.js';
import { scriptGeneratorService } from './services/ScriptGeneratorService.js';
import { approvalService } from './services/ApprovalService.js';
import { env } from './config/env.js';

const INTERVAL_MS = env.CRON_INTERVAL_HOURS * 60 * 60 * 1000;
const MIN_SCORE = env.MIN_BRAND_FIT_SCORE;

export function startScheduler(logger) {
  const log = logger ?? console;

  // Run immediately if overdue, then on interval
  _maybeRunNow(log);
  const timer = setInterval(() => _runPipeline(log), INTERVAL_MS);
  // Don't keep process alive just for the timer
  timer.unref?.();

  log.info(`[Scheduler] Started — interval: every ${env.CRON_INTERVAL_HOURS}h`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function _maybeRunNow(log) {
  try {
    const [lastRun] = await db
      .select({ completed_at: pipelineRuns.completed_at, status: pipelineRuns.status })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.status, 'done'))
      .orderBy(desc(pipelineRuns.completed_at))
      .limit(1);

    const lastDoneAt = lastRun?.completed_at ?? null;
    const overdue = !lastDoneAt || Date.now() - lastDoneAt.getTime() >= INTERVAL_MS;

    if (overdue) {
      log.info('[Scheduler] No recent completed run found — running immediately');
      await _runPipeline(log);
    } else {
      const nextMs = INTERVAL_MS - (Date.now() - lastDoneAt.getTime());
      log.info(`[Scheduler] Last run was ${Math.round((Date.now() - lastDoneAt.getTime()) / 60000)}m ago — next run in ${Math.round(nextMs / 60000)}m`);
    }
  } catch (err) {
    // If the pipeline_runs table doesn't exist yet (migration pending), run anyway
    // but don't crash — the run itself will try to insert and also fail gracefully.
    if (err?.code === '42P01') {
      log.warn('[Scheduler] pipeline_runs table not found — run `npm run db:push` to create it. Skipping initial run.');
      return; // Don't run pipeline if DB schema is incomplete
    }
    log.error({ err }, '[Scheduler] Startup check failed — will still run on schedule');
    await _runPipeline(log);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function _runPipeline(log) {
  const runId = uuidv4();
  const startedAt = new Date();
  log.info({ runId }, '[Scheduler] Pipeline run starting');

  // Create run record — silently skip if table doesn't exist yet
  let dbTracking = true;
  try {
    await db.insert(pipelineRuns).values({
      id: runId,
      status: 'running',
      started_at: startedAt,
    });
  } catch (err) {
    if (err?.code === '42P01') {
      log.warn('[Scheduler] pipeline_runs table missing — run `npm run db:push`. Run will proceed without DB tracking.');
      dbTracking = false;
    } else {
      throw err;
    }
  }

  const stats = {
    ingested: 0,
    skipped: 0,
    classified: 0,
    scored: 0,
    bundles_generated: 0,
    emails_sent: 0,
    errors: [],
  };

  try {
    // ── 1. Ingest from universal sources ───────────────────────────────────
    log.info({ runId }, '[Scheduler] Step 1: Ingesting trends');
    const ingestResult = await trendIngestionService.runAll();
    stats.ingested = ingestResult.ingested;
    stats.skipped = ingestResult.skipped;
    if (ingestResult.errors?.length) stats.errors.push(...ingestResult.errors);
    log.info({ runId, ...ingestResult }, '[Scheduler] Universal ingestion done');

    // ── 1b. Ingest Reddit + Google News per channel (brand-specific) ────────
    log.info({ runId }, '[Scheduler] Step 1b: Ingesting brand-specific Reddit + Google News per channel');
    const allChannelsForReddit = await db.select().from(channels).where(eq(channels.status, 'active'));
    await Promise.allSettled(
      allChannelsForReddit.map(async (ch) => {
        try {
          const sources = await trendIngestionService.getBrandSourcesForChannel(ch);
          const [reddit, news] = await Promise.allSettled([
            trendIngestionService.ingestReddit(sources.subreddits),
            trendIngestionService.ingestGoogleNews(sources.keywords),
          ]);
          if (reddit.status === 'fulfilled') {
            stats.ingested += reddit.value.ingested;
            stats.skipped += reddit.value.skipped;
          } else {
            stats.errors.push(`reddit channel ${ch.name}: ${reddit.reason?.message}`);
          }
          if (news.status === 'fulfilled') {
            stats.ingested += news.value.ingested;
            stats.skipped += news.value.skipped;
          } else {
            stats.errors.push(`google_news channel ${ch.name}: ${news.reason?.message}`);
          }
          log.info({ runId, channel: ch.name }, '[Scheduler] Reddit + Google News done for channel');
        } catch (err) {
          stats.errors.push(`channel sources ${ch.name}: ${err.message}`);
          log.error({ runId, err }, `[Scheduler] Brand ingestion failed for channel ${ch.name}`);
        }
      }),
    );

    // ── 2. Classify unprocessed candidates ─────────────────────────────────
    log.info({ runId }, '[Scheduler] Step 2: Classifying candidates');
    const classifyResult = await contentIntelligenceService.classifyPendingCandidates(50);
    stats.classified = classifyResult.classified;
    log.info({ runId, classified: stats.classified }, '[Scheduler] Classification done');

    // ── 3. Score against all active channels ────────────────────────────────
    log.info({ runId }, '[Scheduler] Step 3: Scoring for all channels');
    const scoreResult = await contentIntelligenceService.scoreCandidatesForAllChannels();
    stats.scored = scoreResult.totalScored;
    log.info({ runId, scored: stats.scored }, '[Scheduler] Scoring done');

    // ── 4. Send topic selection emails per active channel ───────────────────
    // User picks a topic → bundle is generated → content review email → video → publish
    // Exception: approval_mode='auto' skips the email and generates directly.
    log.info({ runId }, '[Scheduler] Step 4: Sending topic selection emails');

    const activeChannels = await db
      .select()
      .from(channels)
      .where(eq(channels.status, 'active'));

    for (const channel of activeChannels) {
      try {
        const topTrends = await contentIntelligenceService.getTopForChannel(
          channel.id,
          channel.organization_id,
          { limit: 5, minScore: MIN_SCORE },
        );

        if (!topTrends.length) {
          log.info({ runId, channel: channel.name }, '[Scheduler] No qualifying trends — skipping');
          continue;
        }

        if (channel.approval_mode === 'auto') {
          // Auto mode: pick top trend, generate bundle, publish if above threshold
          const trend = topTrends[0];
          try {
            const bundle = await scriptGeneratorService.generateBundle(channel, trend);
            await scriptGeneratorService.scoreBundle(bundle, channel);
            stats.bundles_generated++;

            const qualityScore = Number(bundle.score_composite ?? 0);
            if (qualityScore >= Number(channel.auto_publish_threshold ?? 8.5)) {
              log.info({ runId, bundleId: bundle.id, qualityScore }, '[Scheduler] Auto-publishing');
              const { publishingService } = await import('./services/PublishingService.js');
              await publishingService.publish(channel, bundle).catch((err) => {
                stats.errors.push(`Auto-publish ${bundle.id}: ${err.message}`);
              });
            } else {
              // Below threshold — send for manual review (content review stage)
              await approvalService.sendContentReviewEmail(channel, bundle, trend);
              stats.emails_sent++;
            }

            await contentIntelligenceService.markTopicUsed(
              channel.id, channel.organization_id, trend.title, channel.topic_cooldown_days,
            );
          } catch (err) {
            stats.errors.push(`auto-generate channel ${channel.name}: ${err.message}`);
            log.error({ runId, err }, '[Scheduler] Auto-generate failed');
          }
        } else {
          // Manual mode: send topic selection email — user picks which trend to use
          try {
            await approvalService.sendTopicSelectionEmail(channel, topTrends);
            stats.emails_sent++;
            log.info({ runId, channel: channel.name, trends: topTrends.length }, '[Scheduler] Topic selection email sent');
          } catch (err) {
            stats.errors.push(`topic email channel ${channel.name}: ${err.message}`);
            log.error({ runId, err }, '[Scheduler] Topic selection email failed');
          }
        }
      } catch (err) {
        stats.errors.push(`channel ${channel.name}: ${err.message}`);
        log.error({ runId, err }, `[Scheduler] Error for channel ${channel.name}`);
      }
    }

    // ── 5. Clean up stale unscored candidates (older than 7 days) ──────────
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staleIds = await db
        .select({ id: trendCandidates.id })
        .from(trendCandidates)
        .leftJoin(trendScores, eq(trendScores.trend_candidate_id, trendCandidates.id))
        .where(and(isNull(trendScores.id), lt(trendCandidates.ingested_at, cutoff)));

      if (staleIds.length) {
        await db.delete(trendCandidates).where(
          inArray(trendCandidates.id, staleIds.map((r) => r.id)),
        );
        log.info({ runId, deleted: staleIds.length }, '[Scheduler] Cleaned up stale unscored candidates');
      }
    } catch (err) {
      log.warn({ runId, err }, '[Scheduler] Cleanup failed — non-fatal');
    }

    // ── 6. Mark run as done ─────────────────────────────────────────────────
    if (dbTracking) {
      await db
        .update(pipelineRuns)
        .set({
          status: 'done',
          completed_at: new Date(),
          ingested: stats.ingested,
          skipped: stats.skipped,
          classified: stats.classified,
          scored: stats.scored,
          bundles_generated: stats.bundles_generated,
          emails_sent: stats.emails_sent,
          errors: stats.errors,
        })
        .where(eq(pipelineRuns.id, runId));
    }

    log.info({ runId, ...stats }, '[Scheduler] Pipeline run completed ✓');
  } catch (err) {
    stats.errors.push(err.message);
    log.error({ runId, err }, '[Scheduler] Pipeline run failed');

    if (dbTracking) {
      await db
        .update(pipelineRuns)
        .set({ status: 'failed', completed_at: new Date(), errors: stats.errors })
        .where(eq(pipelineRuns.id, runId))
        .catch(() => {});
    }
  }

  return stats;
}

// Expose for manual trigger (debug/admin endpoint)
export { _runPipeline as runPipeline };
