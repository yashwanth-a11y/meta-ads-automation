import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../db/index.js';
import { approvals, creativeBundles, channels, users } from '../db/schema.js';
import { env } from '../config/env.js';
import {
  createKlingClient,
  buildKlingPrompt,
  klingGenerateAndPoll,
  resolveKlingConfig,
  formatKlingRenderError,
} from './klingClient.js';

const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export class ApprovalService {
  // -------------------------------------------------------------------------
  // Stage 1 — send content approval email (hook / script / caption / hashtags)
  // -------------------------------------------------------------------------
  async sendContentApproval(channel, bundle, trend = null) {
    const userEmail = await this._getOrgEmail(channel.organization_id);
    if (!userEmail) {
      console.warn(`[Approvals] No user email found for org ${channel.organization_id} — skipping`);
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
      action: null,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    const reviewUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;

    await this._sendEmail({
      to: userEmail,
      subject: `[GrowthOS] Review content for ${channel.brand_name} — ${(bundle.hook ?? '').slice(0, 55)}`,
      html: this._contentEmailHtml({ channel, bundle, trend, reviewUrl }),
    });

    console.log(`[Approvals] Content approval sent to ${userEmail} for bundle ${bundle.id}`);
    return approvalId;
  }

  // -------------------------------------------------------------------------
  // Stage 2 — send video approval email (video preview + publish button)
  // -------------------------------------------------------------------------
  async sendVideoApproval(channel, bundle) {
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
      action: null,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    const reviewUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;

    await this._sendEmail({
      to: userEmail,
      subject: `[GrowthOS] 🎬 Your video is ready — ${channel.brand_name}`,
      html: this._videoEmailHtml({ channel, bundle, reviewUrl }),
    });

    console.log(`[Approvals] Video approval sent to ${userEmail} for bundle ${bundle.id}`);
    return approvalId;
  }

  // -------------------------------------------------------------------------
  // Handle approve / reject / regenerate from review page
  // -------------------------------------------------------------------------
  async handleAction(rawToken, action, { reason, ip, userAgent } = {}) {
    const { tokenHash } = this._hashOnly(rawToken);

    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.token_hash, tokenHash));

    if (!approval) return { ok: false, message: 'Invalid or expired link.' };
    if (approval.action) return { ok: false, message: 'This link has already been used.' };
    if (approval.expires_at < new Date()) return { ok: false, message: 'This link has expired.' };

    // Mark as actioned immediately (single-use)
    await db
      .update(approvals)
      .set({
        action,
        action_taken_at: new Date(),
        rejection_reason: reason ?? null,
        ip_address: ip ?? null,
        user_agent: userAgent ?? null,
      })
      .where(eq(approvals.id, approval.id));

    // Load bundle + channel
    const [bundle] = await db
      .select()
      .from(creativeBundles)
      .where(eq(creativeBundles.id, approval.creative_bundle_id));

    if (!bundle) return { ok: false, message: 'Content bundle not found.' };

    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, bundle.channel_id));

    if (!channel) return { ok: false, message: 'Channel not found.' };

    // --- Route by action ---
    if (action === 'approve') {
      if (bundle.status === 'draft') {
        // Content approved → start video render (fire-and-forget)
        await db
          .update(creativeBundles)
          .set({ status: 'rendering', updated_at: new Date() })
          .where(eq(creativeBundles.id, bundle.id));

        this._renderAndNotify(channel, bundle).catch((err) => {
          console.error(`[Approvals] Render failed for bundle ${bundle.id}:`, err.message);
          // Reset to draft so it can be retried
          db.update(creativeBundles)
            .set({ status: 'draft', updated_at: new Date() })
            .where(eq(creativeBundles.id, bundle.id))
            .catch(() => {});
        });

        return {
          ok: true,
          stage: 'content',
          message: 'Content approved! Video generation has started. You\'ll get another email when it\'s ready.',
        };
      }

      if (bundle.status === 'ready') {
        // Video approved → publish to Instagram
        const { publishingService } = await import('./PublishingService.js');
        const result = await publishingService.publish(channel, bundle);
        return {
          ok: true,
          stage: 'video',
          message: result.published
            ? 'Published to Instagram successfully! 🎉'
            : `Publish queued (${result.reason})`,
        };
      }

      return { ok: false, message: `Bundle in unexpected status: ${bundle.status}` };
    }

    if (action === 'reject') {
      await db
        .update(creativeBundles)
        .set({ status: 'rejected', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));
      return { ok: true, stage: bundle.status, message: 'Content rejected.' };
    }

    if (action === 'regenerate') {
      const { scriptGeneratorService } = await import('./ScriptGeneratorService.js');
      const newBundle = await scriptGeneratorService.regenerateBundle(
        bundle.id,
        channel.organization_id,
        reason ?? 'Improve the content significantly',
      );
      // Score the new bundle
      await scriptGeneratorService.scoreBundle(newBundle, channel);
      // Send fresh content approval
      await this.sendContentApproval(channel, { ...bundle, ...newBundle, id: bundle.id }, null);
      return { ok: true, stage: 'content', message: 'New version generated. Check your email.' };
    }

    return { ok: false, message: `Unknown action: ${action}` };
  }

  // -------------------------------------------------------------------------
  // Get approval record by token (for the review preview page)
  // -------------------------------------------------------------------------
  async getByToken(rawToken) {
    const { tokenHash } = this._hashOnly(rawToken);
    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.token_hash, tokenHash));
    if (!approval) return null;

    const [bundle] = await db
      .select()
      .from(creativeBundles)
      .where(eq(creativeBundles.id, approval.creative_bundle_id));

    return { approval, bundle: bundle ?? null };
  }

  // -------------------------------------------------------------------------
  // List pending approvals for an org (dashboard view)
  // -------------------------------------------------------------------------
  async listPending(organizationId, { limit = 20 } = {}) {
    const rows = await db
      .select({ approval: approvals, bundle: creativeBundles })
      .from(approvals)
      .innerJoin(creativeBundles, eq(approvals.creative_bundle_id, creativeBundles.id))
      .where(eq(approvals.organization_id, organizationId))
      .orderBy(approvals.created_at)
      .limit(limit);

    return rows.map(({ approval, bundle }) => ({
      ...approval,
      bundle: { id: bundle.id, hook: bundle.hook, status: bundle.status, video_url: bundle.video_url },
    }));
  }

  // -------------------------------------------------------------------------
  // Resend an approval email
  // -------------------------------------------------------------------------
  async resend(approvalId, organizationId) {
    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId));

    if (!approval || approval.organization_id !== organizationId) {
      throw new Error('Approval not found');
    }
    if (approval.action) throw new Error('Already actioned — cannot resend');

    // Invalidate old token, generate new one
    const { token, tokenHash } = this._generateToken();
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS);

    await db
      .update(approvals)
      .set({ token_hash: tokenHash, expires_at: expiresAt, reminder_sent_at: new Date() })
      .where(eq(approvals.id, approvalId));

    const [bundle] = await db
      .select()
      .from(creativeBundles)
      .where(eq(creativeBundles.id, approval.creative_bundle_id));

    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, bundle?.channel_id));

    const reviewUrl = `${env.FRONTEND_URL}/api/v1/approvals/review/${token}`;

    if (bundle?.status === 'ready') {
      await this._sendEmail({
        to: approval.approver_email,
        subject: `[GrowthOS] 🎬 Reminder: Your video is ready — ${channel?.brand_name}`,
        html: this._videoEmailHtml({ channel, bundle, reviewUrl }),
      });
    } else {
      await this._sendEmail({
        to: approval.approver_email,
        subject: `[GrowthOS] Reminder: Review content for ${channel?.brand_name}`,
        html: this._contentEmailHtml({ channel, bundle, trend: null, reviewUrl }),
      });
    }

    return { resent: true };
  }

  // -------------------------------------------------------------------------
  // Internal: Kling render → then send video approval email
  // -------------------------------------------------------------------------
  async _renderAndNotify(channel, bundle) {
    const cfg = resolveKlingConfig();

    if (!cfg) {
      // No Kling config — mark as ready with a placeholder so flow continues
      console.warn('[Approvals] Kling not configured. Marking bundle as ready with no video.');
      await db
        .update(creativeBundles)
        .set({ status: 'ready', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));
      await this.sendVideoApproval(channel, { ...bundle, video_url: null, status: 'ready' });
      return;
    }

    const api = createKlingClient(cfg);
    const prompt = buildKlingPrompt(bundle.script ?? bundle.hook ?? '');

    let videoUrl;
    try {
      videoUrl = await klingGenerateAndPoll(
        api,
        prompt,
        cfg,
        {
          isCancelled: () => false,
          onProgress: (n) => console.log(`[Render] bundle ${bundle.id}: ${n}%`),
        },
        { external_task_id: `approval_${bundle.id}` },
      );
    } catch (err) {
      throw new Error(`Kling render error: ${formatKlingRenderError(err)}`);
    }

    await db
      .update(creativeBundles)
      .set({ video_url: videoUrl, status: 'ready', updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    await this.sendVideoApproval(channel, { ...bundle, video_url: videoUrl, status: 'ready' });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------
  async _getOrgEmail(organizationId) {
    // organization_id == users.id in this schema
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, organizationId));
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
    if (!env.RESEND_API_KEY) {
      console.log(`[Email] No RESEND_API_KEY — would send to ${to}\n  Subject: ${subject}`);
      return;
    }
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: env.EMAIL_FROM ?? 'GrowthOS <noreply@photonx.io>',
        to,
        subject,
        html,
      },
      {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 12000,
      },
    );
  }

  // -------------------------------------------------------------------------
  // Email HTML templates
  // -------------------------------------------------------------------------
  _contentEmailHtml({ channel, bundle, trend, reviewUrl }) {
    const scoreChip = trend?.brand_fit?.composite_score
      ? `<span style="background:#6c63ff;color:#fff;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;">Brand Fit ${Number(trend.brand_fit.composite_score).toFixed(1)}/10</span>`
      : '';
    const trendBadge = trend
      ? `<p style="color:#888;font-size:13px;margin:0 0 24px;">📈 Trend: <strong style="color:#b0b0e0;">${(trend.title ?? '').slice(0, 80)}</strong> ${scoreChip}</p>`
      : '';
    const hashtags = (bundle.hashtags ?? []).map((h) => `#${h}`).join(' ');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review Content — GrowthOS</title></head>
<body style="margin:0;padding:20px;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#12122a;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#6c63ff 0%,#3ecfcf 100%);padding:36px 32px;text-align:center;">
    <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:13px;text-transform:uppercase;letter-spacing:2px;">GrowthOS · Trend Intelligence</p>
    <h1 style="margin:0;font-size:26px;color:#fff;font-weight:800;">🔥 New Content Idea Ready</h1>
    <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">${channel.brand_name}</p>
  </div>

  <!-- Body -->
  <div style="padding:32px;">
    ${trendBadge}

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6c63ff;font-weight:700;margin:0 0 8px;">Hook — First 3 Seconds</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:16px;margin-bottom:22px;font-size:15px;line-height:1.6;color:#e0e0f0;border-left:3px solid #6c63ff;">${bundle.hook ?? '—'}</div>

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6c63ff;font-weight:700;margin:0 0 8px;">Script</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:16px;margin-bottom:22px;font-size:14px;line-height:1.7;color:#c0c0e0;">${bundle.script ?? '—'}</div>

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6c63ff;font-weight:700;margin:0 0 8px;">Instagram Caption</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:16px;margin-bottom:22px;font-size:13px;line-height:1.7;color:#c0c0e0;">${(bundle.caption ?? '—').slice(0, 500)}${(bundle.caption?.length ?? 0) > 500 ? '…' : ''}</div>

    ${hashtags ? `<p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6c63ff;font-weight:700;margin:0 0 8px;">Hashtags</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:14px 16px;margin-bottom:28px;font-size:13px;color:#8080c0;">${hashtags}</div>` : ''}

    <!-- Action buttons -->
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr>
        <td style="padding:4px 8px 4px 0;">
          <a href="${reviewUrl}?action=approve" style="display:block;background:linear-gradient(135deg,#6c63ff,#3ecfcf);color:#fff;text-align:center;padding:15px 20px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;">✅ Approve &amp; Generate Video</a>
        </td>
        <td style="padding:4px 4px;">
          <a href="${reviewUrl}?action=regenerate" style="display:block;background:#1e1e3e;color:#b0b0d0;text-align:center;padding:15px 20px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #3a3a5a;">✏️ Regenerate</a>
        </td>
        <td style="padding:4px 0 4px 4px;">
          <a href="${reviewUrl}?action=reject" style="display:block;background:transparent;color:#ff6b6b;text-align:center;padding:15px 20px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #ff6b6b;">❌ Reject</a>
        </td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:18px 32px;border-top:1px solid #1e1e3e;font-size:12px;color:#555;text-align:center;">
    Link expires in 48 hours · GrowthOS for ${channel.brand_name}
  </div>
</div>
</body></html>`;
  }

  _videoEmailHtml({ channel, bundle, reviewUrl }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video Ready — GrowthOS</title></head>
<body style="margin:0;padding:20px;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#12122a;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#3ecfcf 0%,#6c63ff 100%);padding:36px 32px;text-align:center;">
    <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:13px;text-transform:uppercase;letter-spacing:2px;">GrowthOS · Video Ready</p>
    <h1 style="margin:0;font-size:26px;color:#fff;font-weight:800;">🎬 Your Video is Ready</h1>
    <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">${channel.brand_name}</p>
  </div>

  <!-- Body -->
  <div style="padding:32px;">
    ${bundle.video_url
      ? `<div style="text-align:center;margin-bottom:28px;">
          <a href="${bundle.video_url}" style="display:inline-block;background:#0a0a1e;border:2px dashed #3ecfcf;border-radius:16px;padding:28px 40px;text-decoration:none;color:#3ecfcf;font-size:17px;font-weight:700;">
            ▶ Watch Video Preview
          </a>
        </div>`
      : `<div style="text-align:center;margin-bottom:28px;background:#0a0a1e;border-radius:16px;padding:28px;color:#666;">Video URL not available yet — please check back.</div>`}

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#3ecfcf;font-weight:700;margin:0 0 8px;">Hook</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:14px 16px;margin-bottom:22px;font-size:14px;color:#e0e0f0;border-left:3px solid #3ecfcf;">${bundle.hook ?? '—'}</div>

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#3ecfcf;font-weight:700;margin:0 0 8px;">Caption Preview</p>
    <div style="background:#0a0a1e;border-radius:10px;padding:14px 16px;margin-bottom:28px;font-size:13px;color:#c0c0e0;line-height:1.6;">${(bundle.caption ?? '—').slice(0, 300)}${(bundle.caption?.length ?? 0) > 300 ? '…' : ''}</div>

    <!-- Action buttons -->
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:4px 6px 4px 0;">
          <a href="${reviewUrl}?action=approve" style="display:block;background:linear-gradient(135deg,#3ecfcf,#6c63ff);color:#fff;text-align:center;padding:16px 20px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;">✅ Approve &amp; Publish to Instagram</a>
        </td>
        <td style="padding:4px 0 4px 6px;width:160px;">
          <a href="${reviewUrl}?action=reject" style="display:block;background:transparent;color:#ff6b6b;text-align:center;padding:16px 20px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #ff6b6b;">❌ Reject</a>
        </td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:18px 32px;border-top:1px solid #1e1e3e;font-size:12px;color:#555;text-align:center;">
    Link expires in 48 hours · GrowthOS for ${channel.brand_name}
  </div>
</div>
</body></html>`;
  }
}

export const approvalService = new ApprovalService();
