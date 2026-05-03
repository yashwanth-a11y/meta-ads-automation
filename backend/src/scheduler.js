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

import { desc, eq, isNull, lt, lte, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db/index.js';
import { pipelineRuns, channels, trendCandidates, trendScores, creativeBundles } from './db/schema.js';
import { trendIngestionService } from './services/TrendIngestionService.js';
import { contentIntelligenceService } from './services/ContentIntelligenceService.js';
import { scriptGeneratorService } from './services/ScriptGeneratorService.js';
import { approvalService } from './services/ApprovalService.js';
import { env } from './config/env.js';

const INTERVAL_MS = env.CRON_INTERVAL_HOURS * 60 * 60 * 1000;
const MIN_SCORE = env.MIN_BRAND_FIT_SCORE;

export function startScheduler(logger) {
  const log = logger ?? console;

  // Sync holidays in background on startup (non-blocking)
  _syncHolidaysIfNeeded(log);

  // Run immediately if overdue, then on interval
  _maybeRunNow(log);
  const timer = setInterval(() => _runPipeline(log), INTERVAL_MS);
  // Don't keep process alive just for the timer
  timer.unref?.();

  // WhatsApp 24h window expiration warnings (run every hour)
  const waTimer = setInterval(() => _checkWhatsAppExpirations(log), 60 * 60 * 1000);
  waTimer.unref?.();
  _checkWhatsAppExpirations(log);

  log.info(`[Scheduler] Started — interval: every ${env.CRON_INTERVAL_HOURS}h`);
}

async function _syncHolidaysIfNeeded(log) {
  try {
    const { holidayFetchService } = await import('./services/HolidayFetchService.js');
    const results = await holidayFetchService.ensurePopulated('IN');
    if (results.length > 0) {
      log.info({ results }, '[Scheduler] Holiday sync completed');
    }
  } catch (err) {
    log.warn({ err }, '[Scheduler] Holiday sync skipped (non-fatal)');
  }
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

    // ── 1b. Ingest brand-specific sources per channel ───────────────────────
    log.info({ runId }, '[Scheduler] Step 1b: Ingesting brand-specific sources per channel');
    const allChannelsForReddit = await db.select().from(channels).where(eq(channels.status, 'active'));
    await Promise.allSettled(
      allChannelsForReddit.map(async (ch) => {
        try {
          const sources = await trendIngestionService.getBrandSourcesForChannel(ch);
          const [reddit, news, twitter, websites] = await Promise.allSettled([
            trendIngestionService.ingestReddit(sources.subreddits),
            trendIngestionService.ingestGoogleNews(sources.keywords),
            trendIngestionService.ingestTwitterAccountsForChannel(ch),
            trendIngestionService.ingestWatchedWebsitesForChannel(ch),
          ]);
          for (const { label, result } of [
            { label: 'reddit', result: reddit },
            { label: 'google_news', result: news },
            { label: 'twitter', result: twitter },
            { label: 'website', result: websites },
          ]) {
            if (result.status === 'fulfilled') {
              stats.ingested += result.value.ingested;
              stats.skipped += result.value.skipped;
            } else {
              stats.errors.push(`${label} channel ${ch.name}: ${result.reason?.message}`);
            }
          }
          log.info({ runId, channel: ch.name }, '[Scheduler] Brand-specific ingestion done for channel');
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
          // Auto mode: pick top trend, pick content type from channel mix, generate bundle
          const trend = topTrends[0];
          try {
            const contentType = scriptGeneratorService.pickContentType(channel);
            log.info({ runId, channel: channel.name, contentType }, '[Scheduler] Auto-mode content type selected');

            let bundle;
            if (contentType === 'image_post') {
              bundle = await scriptGeneratorService.generateImageBundle(channel, trend);
            } else if (contentType === 'carousel') {
              bundle = await scriptGeneratorService.generateCarouselBundle(channel, trend);
            } else {
              bundle = await scriptGeneratorService.generateBundle(channel, trend);
            }

            await scriptGeneratorService.scoreBundle(bundle, channel);
            stats.bundles_generated++;

            const qualityScore = Number(bundle.score_composite ?? 0);
            if (qualityScore >= Number(channel.auto_publish_threshold ?? 8.5)) {
              // Schedule to next open slot if channel has a posting_schedule, else publish now
              const scheduledAt = _getNextScheduledSlot(channel);
              if (scheduledAt) {
                await db.update(creativeBundles)
                  .set({ status: 'approved', scheduled_publish_at: scheduledAt, updated_at: new Date() })
                  .where(eq(creativeBundles.id, bundle.id));
                log.info({ runId, bundleId: bundle.id, scheduledAt }, '[Scheduler] Bundle scheduled for later publish');
              } else {
                log.info({ runId, bundleId: bundle.id, qualityScore }, '[Scheduler] Auto-publishing now');
                const { publishingService } = await import('./services/PublishingService.js');
                await publishingService.publishBundle(channel, bundle).catch((err) => {
                  stats.errors.push(`Auto-publish ${bundle.id}: ${err.message}`);
                });
              }
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

    // ── 4b. Publish scheduled content (approved bundles with scheduled_publish_at <= now) ──
    log.info({ runId }, '[Scheduler] Step 4b: Publishing scheduled content');
    try {
      const due = await db
        .select()
        .from(creativeBundles)
        .where(
          and(
            eq(creativeBundles.status, 'approved'),
            lte(creativeBundles.scheduled_publish_at, new Date()),
          ),
        );

      if (due.length) {
        const { publishingService } = await import('./services/PublishingService.js');
        await Promise.allSettled(
          due.map(async (bundle) => {
            try {
              const [ch] = await db.select().from(channels).where(eq(channels.id, bundle.channel_id));
              if (!ch) return;
              await publishingService.publishBundle(ch, bundle);
              await db.update(creativeBundles)
                .set({ published_at: new Date(), updated_at: new Date() })
                .where(eq(creativeBundles.id, bundle.id));
              log.info({ runId, bundleId: bundle.id }, '[Scheduler] Scheduled bundle published');
            } catch (err) {
              stats.errors.push(`scheduled-publish ${bundle.id}: ${err.message}`);
              log.error({ runId, err }, `[Scheduler] Scheduled publish failed for bundle ${bundle.id}`);
            }
          }),
        );
      } else {
        log.info({ runId }, '[Scheduler] No scheduled bundles due');
      }
    } catch (err) {
      stats.errors.push(`scheduled-publish step: ${err.message}`);
      log.warn({ runId, err }, '[Scheduler] Scheduled publish step failed — non-fatal');
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

/**
 * Calculate the next available publish slot based on channel.posting_schedule.
 * Returns a Date for the next slot, or null to publish immediately.
 * Slots are spread evenly through the day (9am, 12pm, 3pm, 6pm by default).
 */
function _getNextScheduledSlot(channel) {
  const schedule = channel.posting_schedule;
  if (!schedule || schedule === 'immediate') return null;

  // Parse "Nx/week" or "daily" into posts-per-week count
  let postsPerWeek = 0;
  if (schedule === 'daily') postsPerWeek = 7;
  else {
    const m = /^(\d+)x/.exec(schedule);
    postsPerWeek = m ? parseInt(m[1], 10) : 0;
  }
  if (!postsPerWeek) return null;

  // Preferred posting hours (24h)
  const SLOT_HOURS = [9, 12, 15, 18];

  const now = new Date();
  // Find next slot after now, stepping through the week
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    for (const hour of SLOT_HOURS) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate > now) return candidate;
    }
  }
  return null;
}

async function _checkWhatsAppExpirations(log) {
  try {
    const { whatsappService } = await import('./services/whatsapp/WhatsAppService.js');
    if (!whatsappService.isConfigured) return;

    const { lt, gt, and, isNotNull } = await import('drizzle-orm');
    const { users } = await import('./db/schema.js');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);

    const expiringUsers = await db.select()
      .from(users)
      .where(
        and(
          isNotNull(users.last_whatsapp_interaction_at),
          gt(users.last_whatsapp_interaction_at, twentyFourHoursAgo),
          lt(users.last_whatsapp_interaction_at, twentyThreeHoursAgo)
        )
      );

    for (const user of expiringUsers) {
      if (user.phone) {
        log.info(`[Scheduler] Sending 23h WhatsApp expiration warning to ${user.phone}`);
        await whatsappService.sendMessage(user.phone, "⚠️ Your 24-hour chat window with GenUI is about to expire in 1 hour. Please reply to this message to keep the session active so you can continue receiving instant approval notifications.");
      }
    }
  } catch (err) {
    log.error({ err }, '[Scheduler] WhatsApp expiration check failed');
  }
}
