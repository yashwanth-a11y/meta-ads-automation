import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { creativeBundles, metaAdAccounts } from '../db/schema.js';
import { env } from '../config/env.js';
import { badRequest } from '../lib/errors.js';

// Instagram Content Publishing API — two-step: create container → publish
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
const IG_API_BASE = `${env.META_API_BASE_URL}/${env.META_API_VERSION}`;
const POLL_INTERVAL_MS = 15_000; // 15s between container status polls
const POLL_MAX_ATTEMPTS = 24;    // 24 × 15s = 6 minutes max

/**
 * @typedef {object} UserTag
 * @property {string} username
 * @property {number} [x]   // 0..1, REQUIRED for image
 * @property {number} [y]   // 0..1, REQUIRED for image
 *
 * @typedef {object} Partnership
 * @property {true} is_paid_partnership
 * @property {string[]} [sponsor_ig_user_ids]    // ≤2
 *
 * @typedef {object} CarouselChild
 * @property {'image'|'video'} kind
 * @property {string} [image_url]
 * @property {string} [video_url]
 * @property {UserTag[]} [user_tags]
 * @property {string} [alt_text]                 // image children only
 *
 * @typedef {object} ImageSpec
 * @property {'image'} type
 * @property {string} image_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [alt_text]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} VideoSpec
 * @property {'video'} type
 * @property {string} video_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [cover_url]
 * @property {number} [thumb_offset_ms]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} ReelsSpec
 * @property {'reels'} type
 * @property {string} video_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [cover_url]
 * @property {number} [thumb_offset_ms]
 * @property {boolean} [share_to_feed]      // defaults true
 * @property {string} [audio_name]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} CarouselSpec
 * @property {'carousel'} type
 * @property {CarouselChild[]} children      // 2..10
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string[]} [collaborators]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} StorySpec
 * @property {'story'} type
 * @property {string} [image_url]
 * @property {string} [video_url]
 * @property {UserTag[]} [user_tags]
 *
 * @typedef {ImageSpec|VideoSpec|ReelsSpec|CarouselSpec|StorySpec} MediaSpec
 */

const MEDIA_TYPES = new Set(['image', 'video', 'reels', 'carousel', 'story']);

export class PublishingService {
  // -------------------------------------------------------------------------
  // Publish an approved creative bundle to Instagram
  // -------------------------------------------------------------------------
  async publish(channel, bundle) {
    // Need instagram_account_id on the channel
    if (!channel.instagram_account_id) {
      console.warn(`[Publishing] Channel ${channel.id} has no instagram_account_id — skipping publish`);
      return { published: false, reason: 'No instagram_account_id on channel' };
    }

    // Get decrypted page access token for this org
    const token = await this._getPageToken(channel.organization_id);
    if (!token) {
      console.warn(`[Publishing] No Meta access token for org ${channel.organization_id}`);
      return { published: false, reason: 'No Meta access token' };
    }

    if (!bundle.video_url) {
      return { published: false, reason: 'Bundle has no video_url' };
    }

    // Update bundle status to 'publishing'
    await db
      .update(creativeBundles)
      .set({ status: 'publishing', updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    try {
      const caption = this._buildCaption({ caption: bundle.caption, hashtags: bundle.hashtags });

      // Step 1: Create media container (Reels)
      const containerId = await this._createContainer({
        igUserId: channel.instagram_account_id,
        token,
        videoUrl: bundle.video_url,
        caption,
      });

      // Step 2: Poll until container is FINISHED
      await this._waitForContainer({ igUserId: channel.instagram_account_id, token, containerId });

      // Step 3: Publish
      const mediaId = await this._publishContainer({
        igUserId: channel.instagram_account_id,
        token,
        containerId,
      });

      // Update bundle as published
      await db
        .update(creativeBundles)
        .set({
          status: 'published',
          updated_at: new Date(),
          render_job_id: mediaId, // re-use field to store IG media ID
        })
        .where(eq(creativeBundles.id, bundle.id));

      console.log(`[Publishing] Bundle ${bundle.id} published → IG media ID: ${mediaId}`);
      return { published: true, mediaId };
    } catch (err) {
      await db
        .update(creativeBundles)
        .set({ status: 'ready', updated_at: new Date() }) // roll back so it can retry
        .where(eq(creativeBundles.id, bundle.id));

      console.error(`[Publishing] Failed for bundle ${bundle.id}:`, err.message);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Get current publish jobs (creative_bundles in publishing status)
  // -------------------------------------------------------------------------
  async listJobs(organizationId) {
    return db
      .select()
      .from(creativeBundles)
      .where(eq(creativeBundles.organization_id, organizationId))
      .orderBy(creativeBundles.updated_at);
  }

  async getJob(bundleId, organizationId) {
    const [row] = await db
      .select()
      .from(creativeBundles)
      .where(eq(creativeBundles.id, bundleId));
    if (!row || row.organization_id !== organizationId) return null;
    return row;
  }

  // -------------------------------------------------------------------------
  // Internal: Instagram API calls
  // -------------------------------------------------------------------------
  async _createContainer({ igUserId, token, videoUrl, caption }) {
    const { data } = await axios.post(
      `${IG_API_BASE}/${igUserId}/media`,
      null,
      {
        params: {
          media_type: 'REELS',
          video_url: videoUrl,
          caption,
          access_token: token,
        },
        timeout: 30_000,
      },
    );

    if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Container created: ${data.id}`);
    return data.id;
  }

  async _waitForContainer({ igUserId, token, containerId }) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await this._sleep(POLL_INTERVAL_MS);

      const { data } = await axios.get(
        `${IG_API_BASE}/${containerId}`,
        {
          params: { fields: 'status_code,status', access_token: token },
          timeout: 10_000,
        },
      );

      const statusCode = data?.status_code ?? data?.status;
      console.log(`[Publishing] Container ${containerId} status: ${statusCode} (attempt ${attempt + 1})`);

      if (statusCode === 'FINISHED') return;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`IG container ${containerId} entered status: ${statusCode}`);
      }
      // IN_PROGRESS / PUBLISHED — keep polling
    }

    throw new Error(`IG container ${containerId} did not finish within ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
  }

  async _publishContainer({ igUserId, token, containerId }) {
    const { data } = await axios.post(
      `${IG_API_BASE}/${igUserId}/media_publish`,
      null,
      {
        params: { creation_id: containerId, access_token: token },
        timeout: 15_000,
      },
    );

    if (!data?.id) throw new Error(`IG publish failed: ${JSON.stringify(data)}`);
    return data.id;
  }

  // -------------------------------------------------------------------------
  // Get page access token from meta_ad_accounts (decrypted)
  // -------------------------------------------------------------------------
  async _getPageToken(organizationId) {
    const [account] = await db
      .select({
        page_access_token_encrypted: metaAdAccounts.page_access_token_encrypted,
        access_token_encrypted: metaAdAccounts.access_token_encrypted,
        status: metaAdAccounts.status,
      })
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.organization_id, organizationId));

    if (!account) return null;

    // Use page token if available, else fall back to access token
    const encrypted = account.page_access_token_encrypted ?? account.access_token_encrypted;
    if (!encrypted) return null;

    // Decrypt AES-256-GCM token using the existing TOKEN_ENCRYPTION_KEY
    try {
      const { decryptToken } = await import('../utils/crypto.js');
      return decryptToken(encrypted);
    } catch {
      // If no crypto util, return the raw value (handles unencrypted dev tokens)
      return encrypted;
    }
  }

  _buildCaption({ caption, hashtags } = {}) {
    const cap = typeof caption === 'string' ? caption : '';
    const tags = Array.isArray(hashtags) ? hashtags : [];

    if (cap.length > 2200) {
      throw badRequest('Caption exceeds 2200 characters', { length: cap.length });
    }
    if (tags.length > 30) {
      throw badRequest('Caption has more than 30 hashtags', { count: tags.length });
    }
    const mentionMatches = cap.match(/@[A-Za-z0-9._]+/g) ?? [];
    if (mentionMatches.length > 20) {
      throw badRequest('Caption has more than 20 @-mentions', { count: mentionMatches.length });
    }
    if (!cap && tags.length === 0) return '';
    const tagBlock = tags.length ? `\n\n${tags.map((h) => `#${h}`).join(' ')}` : '';
    const out = `${cap}${tagBlock}`;
    if (out.length > 2200) {
      throw badRequest('Caption + hashtags combined exceed 2200 characters', { length: out.length });
    }
    return out;
  }

  /** @param {MediaSpec} spec */
  _validateSpec(spec) {
    if (!spec || typeof spec !== 'object') {
      throw badRequest('MediaSpec is required', { spec });
    }
    if (!MEDIA_TYPES.has(spec.type)) {
      throw badRequest(`Unknown MediaSpec type: ${spec.type}`, { allowed: [...MEDIA_TYPES] });
    }
    // Per-type validation lands in subsequent tasks.
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const publishingService = new PublishingService();
