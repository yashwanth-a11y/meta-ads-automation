import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { approvals, creativeBundles, channels, users } from '../db/schema.js';
import { env } from '../config/env.js';
import { sendEmail } from '../lib/email.js';
import {
  createKlingClient,
  buildKlingPrompt,
  klingGenerateAndPoll,
  resolveKlingConfig,
  formatKlingRenderError,
} from './klingClient.js';

const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// ─── Stages ──────────────────────────────────────────────────────────────────
// topic_selection → user picks which trend to use
// content_review  → user reviews/approves hook + script + caption
// video_review    → user reviews/approves the rendered video

export class ApprovalService {
  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1 — Send top trends, let user pick one
  // ───────────────────────────────────────────────────────────────────────────
  async sendTopicSelectionEmail(channel, topTrends) {
    const userEmail = await this._getOrgEmail(channel.organization_id);
    if (!userEmail) {
      console.warn(`[Approvals] No email for org ${channel.organization_id} — skipping topic email`);
      return null;
    }

    const { token, tokenHash } = this._generateToken();
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS);
    const approvalId = uuidv4();

    await db.insert(approvals).values({
      id: approvalId,
      organization_id: channel.organization_id,
      creative_bundle_id: null,
      approver_email: userEmail,
      token_hash: tokenHash,
      stage: 'topic_selection',
      action: null,
      metadata: { trends: topTrends, channel_id: channel.id },
      expires_at: expiresAt,
      created_at: new Date(),
    });

    const baseUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;
    await this._sendEmail({
      to: userEmail,
      subject: `[PhotonX] 🔥 ${topTrends.length} trending topics for ${channel.brand_name} — pick one`,
      html: this._topicSelectionEmailHtml({ channel, topTrends, baseUrl }),
    });

    console.log(`[Approvals] Topic selection email sent to ${userEmail} for channel ${channel.id}`);
    return approvalId;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2 — Send generated content for review
  // ───────────────────────────────────────────────────────────────────────────
  async sendContentReviewEmail(channel, bundle, trend = null) {
    const userEmail = await this._getOrgEmail(channel.organization_id);
    if (!userEmail) {
      console.warn(`[Approvals] No email for org ${channel.organization_id} — skipping content email`);
      return null;
    }

    const { token, tokenHash } = this._generateToken();
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS);
    const approvalId = uuidv4();

    await db.insert(approvals).values({
      id: approvalId,
      organization_id: channel.organization_id,
      creative_bundle_id: bundle.id,
      approver_email: userEmail,
      token_hash: tokenHash,
      stage: 'content_review',
      action: null,
      metadata: { trend_title: trend?.title ?? null },
      expires_at: expiresAt,
      created_at: new Date(),
    });

    const baseUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;
    await this._sendEmail({
      to: userEmail,
      subject: `[PhotonX] Review content for ${channel.brand_name} — "${(bundle.hook ?? '').slice(0, 50)}"`,
      html: this._contentReviewEmailHtml({ channel, bundle, trend, baseUrl }),
    });

    console.log(`[Approvals] Content review email sent to ${userEmail} for bundle ${bundle.id}`);
    return approvalId;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 3 — Send video for final approval
  // ───────────────────────────────────────────────────────────────────────────
  async sendVideoReviewEmail(channel, bundle) {
    const userEmail = await this._getOrgEmail(channel.organization_id);
    if (!userEmail) return null;

    const { token, tokenHash } = this._generateToken();
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS);
    const approvalId = uuidv4();

    await db.insert(approvals).values({
      id: approvalId,
      organization_id: channel.organization_id,
      creative_bundle_id: bundle.id,
      approver_email: userEmail,
      token_hash: tokenHash,
      stage: 'video_review',
      action: null,
      metadata: {},
      expires_at: expiresAt,
      created_at: new Date(),
    });

    const baseUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;
    await this._sendEmail({
      to: userEmail,
      subject: `[PhotonX] 🎬 Your video is ready — ${channel.brand_name}`,
      html: this._videoReviewEmailHtml({ channel, bundle, baseUrl }),
    });

    console.log(`[Approvals] Video review email sent to ${userEmail} for bundle ${bundle.id}`);
    return approvalId;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /review/:token — return the right preview page for the stage
  // ───────────────────────────────────────────────────────────────────────────
  async getReviewPage(rawToken) {
    const record = await this.getByToken(rawToken);
    if (!record) return { type: 'error', message: 'This link is invalid or has already been used.' };
    if (record.approval.action) return { type: 'error', message: `This link has already been used (action: ${record.approval.action}).` };
    if (record.approval.expires_at < new Date()) return { type: 'error', message: 'This link has expired. Please ask for a new one.' };
    return { type: 'preview', record };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST topic selection — user clicked a trend in the email
  // ───────────────────────────────────────────────────────────────────────────
  async handleTopicSelect(rawToken, trendCandidateId, { ip, userAgent } = {}) {
    const { tokenHash } = this._hashOnly(rawToken);
    const [approval] = await db.select().from(approvals).where(eq(approvals.token_hash, tokenHash));

    if (!approval) return { ok: false, message: 'Invalid or expired link.' };
    if (approval.action) return { ok: false, message: 'You already selected a topic from this link.' };
    if (approval.expires_at < new Date()) return { ok: false, message: 'This link has expired.' };
    if (approval.stage !== 'topic_selection') return { ok: false, message: 'Unexpected stage.' };

    // Mark as actioned
    await db.update(approvals).set({
      action: 'select_topic',
      action_taken_at: new Date(),
      metadata: { ...(approval.metadata ?? {}), selected_trend_id: trendCandidateId },
      ip_address: ip ?? null,
      user_agent: userAgent ?? null,
    }).where(eq(approvals.id, approval.id));

    // Load channel + trend, generate bundle, send content review email
    const channelId = approval.metadata?.channel_id;
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return { ok: false, message: 'Channel not found.' };

    // Generate bundle async — return immediately so the HTML can confirm selection
    this._generateAndSendContentReview(channel, trendCandidateId).catch((err) =>
      console.error('[Approvals] generateAndSendContentReview failed:', err.message),
    );

    return {
      ok: true,
      message: `Great choice! Your content is being generated now. You'll get another email with the full script and hook in about 30 seconds.`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST content action — approve, reject, or regenerate with feedback
  // ───────────────────────────────────────────────────────────────────────────
  async handleContentAction(rawToken, action, { feedback, ip, userAgent } = {}) {
    const { tokenHash } = this._hashOnly(rawToken);
    const [approval] = await db.select().from(approvals).where(eq(approvals.token_hash, tokenHash));

    if (!approval) return { ok: false, message: 'Invalid or expired link.' };
    if (approval.action) return { ok: false, message: 'This link has already been used.' };
    if (approval.expires_at < new Date()) return { ok: false, message: 'This link has expired.' };
    if (approval.stage !== 'content_review') return { ok: false, message: 'Unexpected stage.' };

    await db.update(approvals).set({
      action,
      action_taken_at: new Date(),
      rejection_reason: feedback ?? null,
      metadata: { ...(approval.metadata ?? {}), user_feedback: feedback ?? null },
      ip_address: ip ?? null,
      user_agent: userAgent ?? null,
    }).where(eq(approvals.id, approval.id));

    const [bundle] = await db.select().from(creativeBundles).where(eq(creativeBundles.id, approval.creative_bundle_id));
    if (!bundle) return { ok: false, message: 'Content bundle not found.' };

    const [channel] = await db.select().from(channels).where(eq(channels.id, bundle.channel_id));
    if (!channel) return { ok: false, message: 'Channel not found.' };

    if (action === 'approve') {
      // Kick off video render, send video review email when done
      await db.update(creativeBundles).set({ status: 'rendering', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
      this._renderAndSendVideoReview(channel, bundle).catch((err) => {
        console.error(`[Approvals] Render failed for bundle ${bundle.id}:`, err.message);
        db.update(creativeBundles).set({ status: 'draft', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id)).catch(() => {});
      });
      return { ok: true, message: 'Content approved! Video generation has started. You\'ll get another email when it\'s ready.' };
    }

    if (action === 'regenerate') {
      const { scriptGeneratorService } = await import('./ScriptGeneratorService.js');
      const regenerated = await scriptGeneratorService.regenerateBundle(bundle.id, channel.organization_id, feedback ?? 'Make it more engaging and platform-native');
      await scriptGeneratorService.scoreBundle(regenerated, channel);
      const freshBundle = { ...bundle, ...regenerated, id: bundle.id };
      await this.sendContentReviewEmail(channel, freshBundle, null);
      return { ok: true, message: 'New version generated! Check your email for the updated content.' };
    }

    if (action === 'reject') {
      await db.update(creativeBundles).set({ status: 'rejected', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
      return { ok: true, message: 'Content rejected.' };
    }

    return { ok: false, message: `Unknown action: ${action}` };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST video action — approve (publish) or reject
  // ───────────────────────────────────────────────────────────────────────────
  async handleVideoAction(rawToken, action, { feedback, ip, userAgent } = {}) {
    const { tokenHash } = this._hashOnly(rawToken);
    const [approval] = await db.select().from(approvals).where(eq(approvals.token_hash, tokenHash));

    if (!approval) return { ok: false, message: 'Invalid or expired link.' };
    if (approval.action) return { ok: false, message: 'This link has already been used.' };
    if (approval.expires_at < new Date()) return { ok: false, message: 'This link has expired.' };
    if (approval.stage !== 'video_review') return { ok: false, message: 'Unexpected stage.' };

    await db.update(approvals).set({
      action,
      action_taken_at: new Date(),
      rejection_reason: feedback ?? null,
      metadata: { ...(approval.metadata ?? {}), user_feedback: feedback ?? null },
      ip_address: ip ?? null,
      user_agent: userAgent ?? null,
    }).where(eq(approvals.id, approval.id));

    const [bundle] = await db.select().from(creativeBundles).where(eq(creativeBundles.id, approval.creative_bundle_id));
    if (!bundle) return { ok: false, message: 'Bundle not found.' };

    const [channel] = await db.select().from(channels).where(eq(channels.id, bundle.channel_id));
    if (!channel) return { ok: false, message: 'Channel not found.' };

    if (action === 'approve') {
      const { publishingService } = await import('./PublishingService.js');
      const result = await publishingService.publish(channel, bundle);
      return {
        ok: true,
        message: result.published ? 'Published to Instagram! 🎉' : `Publish queued (${result.reason})`,
      };
    }

    if (action === 'regenerate') {
      // Re-render video with feedback as additional prompt context
      await db.update(creativeBundles).set({ status: 'rendering', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
      this._renderAndSendVideoReview(channel, { ...bundle, _feedback: feedback }).catch((err) => {
        console.error(`[Approvals] Re-render failed:`, err.message);
        db.update(creativeBundles).set({ status: 'ready', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id)).catch(() => {});
      });
      return { ok: true, message: 'Regenerating video with your feedback. Another email is on its way!' };
    }

    if (action === 'reject') {
      await db.update(creativeBundles).set({ status: 'rejected', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
      return { ok: true, message: 'Video rejected.' };
    }

    return { ok: false, message: `Unknown action: ${action}` };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Get approval record by raw token
  // ───────────────────────────────────────────────────────────────────────────
  async getByToken(rawToken) {
    const { tokenHash } = this._hashOnly(rawToken);
    const [approval] = await db.select().from(approvals).where(eq(approvals.token_hash, tokenHash));
    if (!approval) return null;

    let bundle = null;
    if (approval.creative_bundle_id) {
      [bundle] = await db.select().from(creativeBundles).where(eq(creativeBundles.id, approval.creative_bundle_id));
    }

    return { approval, bundle: bundle ?? null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // List all approvals for an org (dashboard)
  // ───────────────────────────────────────────────────────────────────────────
  async listPending(organizationId, { limit = 50 } = {}) {
    const { desc } = await import('drizzle-orm');
    const rows = await db
      .select({ approval: approvals, bundle: creativeBundles, channel: channels })
      .from(approvals)
      .leftJoin(creativeBundles, eq(approvals.creative_bundle_id, creativeBundles.id))
      .leftJoin(
        channels,
        eq(channels.id,
          // topic_selection stores channel_id in metadata — use bundle.channel_id for other stages
          creativeBundles.channel_id,
        ),
      )
      .where(eq(approvals.organization_id, organizationId))
      .orderBy(desc(approvals.created_at))
      .limit(limit);

    return rows.map(({ approval, bundle, channel }) => ({
      ...approval,
      channel_name: channel?.name ?? null,
      brand_name: channel?.brand_name ?? null,
      bundle: bundle ? {
        id: bundle.id,
        channel_id: bundle.channel_id,
        hook: bundle.hook,
        script: bundle.script,
        caption: bundle.caption,
        hashtags: bundle.hashtags,
        status: bundle.status,
        video_url: bundle.video_url,
        score_composite: bundle.score_composite,
      } : null,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Resend an approval email
  // ───────────────────────────────────────────────────────────────────────────
  async resend(approvalId, organizationId) {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId));
    if (!approval || approval.organization_id !== organizationId) throw new Error('Approval not found');
    if (approval.action) throw new Error('Already actioned — cannot resend');

    const { token, tokenHash } = this._generateToken();
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS);
    await db.update(approvals).set({ token_hash: tokenHash, expires_at: expiresAt, reminder_sent_at: new Date() }).where(eq(approvals.id, approvalId));

    const baseUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;
    let bundle = null;
    if (approval.creative_bundle_id) {
      [bundle] = await db.select().from(creativeBundles).where(eq(creativeBundles.id, approval.creative_bundle_id));
    }
    const [channel] = await db.select().from(channels).where(eq(channels.id, bundle?.channel_id ?? approval.metadata?.channel_id));

    if (approval.stage === 'topic_selection') {
      const topTrends = approval.metadata?.trends ?? [];
      await this._sendEmail({
        to: approval.approver_email,
        subject: `[PhotonX] Reminder: Pick a topic for ${channel?.brand_name}`,
        html: this._topicSelectionEmailHtml({ channel, topTrends, baseUrl }),
      });
    } else if (approval.stage === 'video_review' && bundle) {
      await this._sendEmail({
        to: approval.approver_email,
        subject: `[PhotonX] Reminder: Your video is ready — ${channel?.brand_name}`,
        html: this._videoReviewEmailHtml({ channel, bundle, baseUrl }),
      });
    } else if (bundle) {
      await this._sendEmail({
        to: approval.approver_email,
        subject: `[PhotonX] Reminder: Review content for ${channel?.brand_name}`,
        html: this._contentReviewEmailHtml({ channel, bundle, trend: null, baseUrl }),
      });
    }

    return { resent: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal: generate bundle from selected trend, then send content review email
  // ───────────────────────────────────────────────────────────────────────────
  async _generateAndSendContentReview(channel, trendCandidateId) {
    const { trendCandidates, trendScores } = await import('../db/schema.js');
    const { and } = await import('drizzle-orm');

    const [trendRow] = await db.select().from(trendCandidates).where(eq(trendCandidates.id, trendCandidateId));
    if (!trendRow) throw new Error(`Trend ${trendCandidateId} not found`);

    const [scoreRow] = await db.select().from(trendScores).where(
      and(eq(trendScores.trend_candidate_id, trendCandidateId), eq(trendScores.channel_id, channel.id)),
    );

    const trend = {
      ...trendRow,
      brand_fit: scoreRow ? {
        composite_score: Number(scoreRow.composite_score),
        adaptation_idea: scoreRow.adaptation_idea,
      } : null,
    };

    const { scriptGeneratorService } = await import('./ScriptGeneratorService.js');
    const bundle = await scriptGeneratorService.generateBundle(channel, trend);
    await scriptGeneratorService.scoreBundle(bundle, channel);

    // Start topic cooldown
    const { contentIntelligenceService } = await import('./ContentIntelligenceService.js');
    await contentIntelligenceService.markTopicUsed(channel.id, channel.organization_id, trendRow.title, channel.topic_cooldown_days);

    await this.sendContentReviewEmail(channel, bundle, trendRow);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal: render video, then send video review email
  // ───────────────────────────────────────────────────────────────────────────
  async _renderAndSendVideoReview(channel, bundle) {
    const cfg = resolveKlingConfig();

    if (!cfg) {
      console.warn('[Approvals] No video renderer configured — marking bundle as ready without video.');
      await db.update(creativeBundles).set({ status: 'ready', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
      await this.sendVideoReviewEmail(channel, { ...bundle, video_url: null, status: 'ready' });
      return;
    }

    // Generate scene prompts now — only after content is approved, not at bundle creation
    const { scriptGeneratorService } = await import('./ScriptGeneratorService.js');
    const scenePrompts = await scriptGeneratorService.generateScenePrompts(bundle, channel);
    const bundleWithScenes = { ...bundle, scene_prompts: scenePrompts };

    const api = createKlingClient(cfg);
    const feedbackHint = bundle._feedback ? ` Additional direction: ${bundle._feedback}` : '';
    const prompt = buildKlingPrompt((bundleWithScenes.script ?? bundleWithScenes.hook ?? '') + feedbackHint);

    let videoUrl;
    try {
      videoUrl = await klingGenerateAndPoll(
        api, prompt, cfg,
        { isCancelled: () => false, onProgress: (n) => console.log(`[Render] bundle ${bundle.id}: ${n}%`) },
        { external_task_id: `approval_${bundle.id}` },
      );
    } catch (err) {
      throw new Error(`Render error: ${formatKlingRenderError(err)}`);
    }

    await db.update(creativeBundles).set({ video_url: videoUrl, status: 'ready', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
    await this.sendVideoReviewEmail(channel, { ...bundle, video_url: videoUrl, status: 'ready' });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Dashboard: take action by approval ID (no email token needed)
  // ───────────────────────────────────────────────────────────────────────────
  async takeActionById(approvalId, organizationId, action, { feedback } = {}) {
    const { and } = await import('drizzle-orm');
    const [approval] = await db.select().from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.organization_id, organizationId)));

    if (!approval) return { ok: false, message: 'Approval not found.' };
    if (approval.action) return { ok: false, message: 'This approval has already been actioned.' };
    if (approval.stage === 'topic_selection') return { ok: false, message: 'Use select-topic for this stage.' };

    await db.update(approvals).set({
      action,
      action_taken_at: new Date(),
      rejection_reason: feedback ?? null,
      metadata: { ...(approval.metadata ?? {}), user_feedback: feedback ?? null },
    }).where(eq(approvals.id, approval.id));

    const [bundle] = await db.select().from(creativeBundles)
      .where(eq(creativeBundles.id, approval.creative_bundle_id));
    if (!bundle) return { ok: false, message: 'Content bundle not found.' };

    const [channel] = await db.select().from(channels).where(eq(channels.id, bundle.channel_id));
    if (!channel) return { ok: false, message: 'Channel not found.' };

    if (approval.stage === 'content_review') {
      if (action === 'approve') {
        await db.update(creativeBundles).set({ status: 'rendering', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
        this._renderAndSendVideoReview(channel, bundle).catch((err) =>
          console.error(`[Approvals] Render failed for bundle ${bundle.id}:`, err.message),
        );
        return { ok: true, message: 'Content approved — video generation started.' };
      }
      if (action === 'regenerate') {
        const { scriptGeneratorService } = await import('./ScriptGeneratorService.js');
        const regenerated = await scriptGeneratorService.regenerateBundle(bundle.id, channel.organization_id, feedback ?? 'Make it more engaging and platform-native');
        await scriptGeneratorService.scoreBundle(regenerated, channel);
        return { ok: true, message: 'New version generated.' };
      }
      if (action === 'reject') {
        await db.update(creativeBundles).set({ status: 'rejected', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
        return { ok: true, message: 'Content rejected.' };
      }
    }

    if (approval.stage === 'video_review') {
      if (action === 'approve') {
        const { publishingService } = await import('./PublishingService.js');
        const result = await publishingService.publish(channel, bundle);
        return { ok: true, message: 'Published to Instagram.', result };
      }
      if (action === 'regenerate') {
        await db.update(creativeBundles).set({ status: 'rendering', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
        this._renderAndSendVideoReview(channel, bundle).catch((err) =>
          console.error(`[Approvals] Re-render failed for bundle ${bundle.id}:`, err.message),
        );
        return { ok: true, message: 'Video re-render started.' };
      }
      if (action === 'reject') {
        await db.update(creativeBundles).set({ status: 'rejected', updated_at: new Date() }).where(eq(creativeBundles.id, bundle.id));
        return { ok: true, message: 'Video rejected.' };
      }
    }

    return { ok: false, message: `Unknown action: ${action}` };
  }

  // Dashboard: select a topic by approval ID (no email token needed)
  async selectTopicById(approvalId, organizationId, trendCandidateId) {
    const { and } = await import('drizzle-orm');
    const [approval] = await db.select().from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.organization_id, organizationId)));

    if (!approval) return { ok: false, message: 'Approval not found.' };
    if (approval.action) return { ok: false, message: 'A topic has already been selected.' };
    if (approval.stage !== 'topic_selection') return { ok: false, message: 'Unexpected stage.' };

    await db.update(approvals).set({
      action: 'select_topic',
      action_taken_at: new Date(),
      metadata: { ...(approval.metadata ?? {}), selected_trend_id: trendCandidateId },
    }).where(eq(approvals.id, approval.id));

    const channelId = approval.metadata?.channel_id;
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return { ok: false, message: 'Channel not found.' };

    this._generateAndSendContentReview(channel, trendCandidateId).catch((err) =>
      console.error('[Approvals] generateAndSendContentReview failed:', err.message),
    );

    return { ok: true, message: 'Topic selected — content generation started.' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────────
  async _getOrgEmail(organizationId) {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, organizationId));
    return user?.email ?? null;
  }

  _generateToken() {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return { token, tokenHash };
  }

  _hashOnly(rawToken) {
    return { tokenHash: createHash('sha256').update(rawToken).digest('hex') };
  }

  async _sendEmail({ to, subject, html }) {
    return sendEmail({ to, subject, html });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Email HTML templates
  // ───────────────────────────────────────────────────────────────────────────

  _shell(title, body) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — PhotonX GrowthOS</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .wrap{max-width:600px;width:100%}
  .card{background:#12122a;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);margin-bottom:16px}
  .hdr{background:linear-gradient(135deg,#22D3EE,#6c63ff);padding:32px;text-align:center}
  .hdr h1{margin:0;font-size:22px;color:#fff;font-weight:800}
  .hdr p{margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px}
  .body{padding:32px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#22D3EE;font-weight:700;margin:0 0 6px}
  .val{background:#0a0a1e;border-radius:8px;padding:13px 15px;margin-bottom:18px;font-size:13px;line-height:1.6;color:#c0c0e0}
  .val.hook{border-left:3px solid #22D3EE;font-size:15px;font-style:italic;color:#e0e0f0}
  .trend-card{background:#0a0a1e;border-radius:12px;padding:18px;margin-bottom:12px;border:1px solid #1e1e3e;transition:border-color .2s}
  .trend-score{display:inline-block;background:#22D3EE;color:#0a0a14;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:800;margin-bottom:8px}
  .trend-title{font-size:15px;font-weight:700;color:#e0e0f0;margin:0 0 6px}
  .trend-idea{font-size:13px;color:#8080c0;margin:0 0 12px;line-height:1.5}
  .btn{display:block;padding:13px 20px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;border:none;text-decoration:none;text-align:center;margin-bottom:8px}
  .btn-primary{background:linear-gradient(135deg,#22D3EE,#6c63ff);color:#fff}
  .btn-secondary{background:#1e1e3e;color:#b0b0d0;border:1px solid #3a3a5a}
  .btn-danger{background:transparent;color:#ff6b6b;border:1px solid #ff6b6b}
  .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
  .actions .btn{flex:1;min-width:120px}
  textarea{width:100%;background:#0a0a1e;border:1px solid #3a3a5a;border-radius:8px;padding:12px;color:#e0e0f0;font-size:13px;line-height:1.5;resize:vertical;min-height:80px;font-family:inherit;margin-bottom:8px}
  textarea:focus{outline:none;border-color:#22D3EE}
  .footer{padding:16px 32px;border-top:1px solid #1e1e3e;font-size:12px;color:#555;text-align:center}
  .hashtag{display:inline-block;background:#1e1e3e;color:#8080c0;border-radius:20px;padding:3px 10px;font-size:12px;margin:2px}
  .badge{display:inline-block;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:6px}
  .badge-topic{background:rgba(34,211,238,.15);color:#22D3EE;border:1px solid rgba(34,211,238,.3)}
  .badge-lifecycle{background:rgba(108,99,255,.15);color:#a89cff;border:1px solid rgba(108,99,255,.3)}
</style></head><body><div class="wrap">${body}</div></body></html>`;
  }

  _topicSelectionEmailHtml({ channel, topTrends, baseUrl }) {
    const trendCards = topTrends.map((t) => {
      const score = t.brand_fit?.composite_score ?? 0;
      const idea = t.brand_fit?.adaptation_idea ?? '';
      const lifecycle = t.lifecycle_stage ?? 'sprout';
      const classification = t.classification ?? 'topic';
      return `
      <div class="trend-card">
        <div>
          <span class="trend-score">${score.toFixed(1)} fit</span>
          <span class="badge badge-topic">${classification}</span>
          <span class="badge badge-lifecycle">${lifecycle}</span>
        </div>
        <p class="trend-title">${t.title}</p>
        ${idea ? `<p class="trend-idea">💡 ${idea}</p>` : ''}
        <a href="${baseUrl}/select/${t.id}" class="btn btn-primary">Use this topic →</a>
      </div>`;
    }).join('');

    return this._shell('Pick a topic', `
      <div class="card">
        <div class="hdr">
          <h1>🔥 Your trending topics are ready</h1>
          <p>${channel.brand_name} · Pick one to generate your content</p>
        </div>
        <div class="body">
          <p style="color:#8080c0;font-size:14px;margin:0 0 24px;">These trends are scored for brand fit with <strong style="color:#e0e0f0">${channel.brand_name}</strong>. Click the one you want to turn into a Reel.</p>
          ${trendCards}
        </div>
        <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
      </div>`);
  }

  _contentReviewEmailHtml({ channel, bundle, trend, baseUrl }) {
    const hashtags = (bundle.hashtags ?? []).map((h) => `<span class="hashtag">#${h}</span>`).join('');
    const trendBadge = trend ? `<p style="color:#8080c0;font-size:13px;margin:0 0 20px;">📈 Trend: <strong style="color:#b0b0e0">${(trend.title ?? '').slice(0, 80)}</strong></p>` : '';

    return this._shell('Review Content', `
      <div class="card">
        <div class="hdr">
          <h1>✍️ Your content is ready to review</h1>
          <p>${channel.brand_name} · Stage 2 of 3</p>
        </div>
        <div class="body">
          ${trendBadge}
          <div class="label">Hook — First 3 seconds</div>
          <div class="val hook">${bundle.hook ?? '—'}</div>
          <div class="label">Script</div>
          <div class="val">${bundle.script ?? '—'}</div>
          <div class="label">Instagram Caption</div>
          <div class="val">${(bundle.caption ?? '—').slice(0, 400)}${(bundle.caption?.length ?? 0) > 400 ? '…' : ''}</div>
          ${hashtags ? `<div class="label">Hashtags</div><div style="margin-bottom:18px">${hashtags}</div>` : ''}

          <div class="label" style="margin-top:8px">Looks good? Approve to generate the video →</div>
          <a href="${baseUrl}/content/approve" class="btn btn-primary">✅ Approve &amp; Generate Video</a>

          <div class="label" style="margin-top:20px">Want changes? Describe them below and regenerate</div>
          <form action="${baseUrl}/content/regenerate" method="POST" style="margin:0">
            <textarea name="feedback" placeholder="e.g. Make the hook punchier, focus more on time-saving benefits, use a question format..."></textarea>
            <button type="submit" class="btn btn-secondary">✏️ Regenerate with feedback</button>
          </form>

          <a href="${baseUrl}/content/reject" class="btn btn-danger" style="margin-top:8px">❌ Reject</a>
        </div>
        <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
      </div>`);
  }

  _videoReviewEmailHtml({ channel, bundle, baseUrl }) {
    const videoBlock = bundle.video_url
      ? `<div style="text-align:center;margin-bottom:24px">
          <a href="${bundle.video_url}" style="display:inline-block;background:#0a0a1e;border:2px dashed #22D3EE;border-radius:16px;padding:28px 40px;text-decoration:none;color:#22D3EE;font-size:17px;font-weight:700;">▶ Watch Video Preview</a>
        </div>`
      : `<div style="text-align:center;margin-bottom:24px;background:#0a0a1e;border-radius:16px;padding:24px;color:#555">Video rendering… check back soon.</div>`;

    return this._shell('Video Ready', `
      <div class="card">
        <div class="hdr">
          <h1>🎬 Your video is ready</h1>
          <p>${channel.brand_name} · Stage 3 of 3 — Final approval</p>
        </div>
        <div class="body">
          ${videoBlock}
          <div class="label">Hook</div>
          <div class="val hook">${bundle.hook ?? '—'}</div>
          <div class="label">Caption Preview</div>
          <div class="val">${(bundle.caption ?? '—').slice(0, 300)}${(bundle.caption?.length ?? 0) > 300 ? '…' : ''}</div>

          <a href="${baseUrl}/video/approve" class="btn btn-primary" style="margin-top:8px">✅ Approve &amp; Publish to Instagram</a>

          <div class="label" style="margin-top:20px">Want a different video? Describe what to change</div>
          <form action="${baseUrl}/video/regenerate" method="POST" style="margin:0">
            <textarea name="feedback" placeholder="e.g. More dynamic cuts, different visual style, show product in use..."></textarea>
            <button type="submit" class="btn btn-secondary">🔄 Regenerate Video</button>
          </form>

          <a href="${baseUrl}/video/reject" class="btn btn-danger" style="margin-top:8px">❌ Reject</a>
        </div>
        <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
      </div>`);
  }
}

export const approvalService = new ApprovalService();
