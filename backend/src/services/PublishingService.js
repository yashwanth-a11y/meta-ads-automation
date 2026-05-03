import axios from 'axios';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  creativeBundles,
  metaAdAccounts,
  instagramAccounts,
  channelInstagramAccounts,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { badRequest } from '../lib/errors.js';
import { decryptToken } from '../utils/encryption.js';

// Instagram Content Publishing API — two-step: create container → publish
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// Two valid Graph API hosts depending on how the token was minted:
//   - Page access token from Facebook Login → graph.facebook.com
//   - User access token from Instagram Business Login → graph.instagram.com
// We default to the Facebook host (existing creative-bundle path uses page
// tokens) and let callers override `_apiBase` per-publish for IG-direct
// tokens — see InstagramPublishService.publishToAccount.
const DEFAULT_API_BASE = `${env.META_API_BASE_URL}/${env.META_API_VERSION}`;
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

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function validateImageUserTags(tags) {
  if (!Array.isArray(tags)) return;
  for (const t of tags) {
    if (!t || typeof t.username !== 'string') {
      throw badRequest('user_tags entry requires a username', { tag: t });
    }
    if (typeof t.x !== 'number' || typeof t.y !== 'number' || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) {
      throw badRequest('user_tags on images require x and y in [0,1]', { tag: t });
    }
  }
}

function validateOptionalCoverFields(spec) {
  if (spec.cover_url !== undefined && !isHttpUrl(spec.cover_url)) {
    throw badRequest('cover_url must be an http(s) URL', { cover_url: spec.cover_url });
  }
  if (spec.thumb_offset_ms !== undefined && (typeof spec.thumb_offset_ms !== 'number' || spec.thumb_offset_ms < 0)) {
    throw badRequest('thumb_offset_ms must be a non-negative number', { thumb_offset_ms: spec.thumb_offset_ms });
  }
}

export class PublishingService {
  constructor() {
    // Mutable so per-publish callers (InstagramPublishService) can swap the
    // host to graph.instagram.com when posting with an IG-direct token. Same
    // pattern as the existing _getPageToken patch in publishBundle.
    this._apiBase = DEFAULT_API_BASE;
  }

  // -------------------------------------------------------------------------
  // Publish media (new unified API for all types: image, video, reels, carousel, story)
  // -------------------------------------------------------------------------
  async publishMedia(channel, spec) {
    this._validateSpec(spec);
    if (!channel?.instagram_account_id) {
      throw badRequest('Channel is missing instagram_account_id');
    }
    const token = await this._getPageToken(channel.organization_id);
    if (!token) {
      throw badRequest('No Meta access token configured for this organization');
    }
    const igUserId = channel.instagram_account_id;
    let containerId;
    switch (spec.type) {
      case 'image':
        containerId = await this._createImageContainer({ spec, igUserId, token });
        break;
      case 'video':
        containerId = await this._createVideoContainer({ spec, igUserId, token });
        break;
      case 'reels':
        containerId = await this._createReelsContainer({ spec, igUserId, token });
        break;
      case 'story':
        containerId = await this._createStoryContainer({ spec, igUserId, token });
        break;
      case 'carousel':
        containerId = await this._createCarouselContainer({ spec, igUserId, token });
        break;
      default:
        throw badRequest(`publishMedia does not yet handle type=${spec.type}`);
    }
    await this._waitForContainer({ igUserId, token, containerId });
    const mediaId = await this._publishContainer({ igUserId, token, containerId });
    return { containerId, mediaId };
  }

  // -------------------------------------------------------------------------
  // Publish an approved creative bundle to Instagram (Reels). Thin wrapper
  // around publishMedia that owns the creative_bundles status lifecycle.
  // -------------------------------------------------------------------------
  /**
   * Build an Instagram MediaSpec from a creative bundle based on content_type.
   */
  _buildMediaSpec(bundle) {
    const type = bundle.content_type || 'reel';

    if (type === 'image_post') {
      const imageUrl = Array.isArray(bundle.image_urls) && bundle.image_urls[0]
        ? bundle.image_urls[0]
        : bundle.thumbnail_url;
      if (!imageUrl) return null;
      return {
        type: 'image',
        image_url: imageUrl,
        caption: bundle.caption,
        hashtags: bundle.hashtags ?? [],
        alt_text: bundle.hook || undefined,
      };
    }

    if (type === 'carousel') {
      const imageUrls = Array.isArray(bundle.image_urls) ? bundle.image_urls : [];
      if (imageUrls.length < 2) return null;
      return {
        type: 'carousel',
        children: imageUrls.map((url) => ({ kind: 'image', image_url: url })),
        caption: bundle.caption,
        hashtags: bundle.hashtags ?? [],
      };
    }

    if (type === 'story') {
      const imageUrl = Array.isArray(bundle.image_urls) && bundle.image_urls[0]
        ? bundle.image_urls[0]
        : null;
      const videoUrl = bundle.video_url || null;
      if (!imageUrl && !videoUrl) return null;
      return imageUrl
        ? { type: 'story', image_url: imageUrl }
        : { type: 'story', video_url: videoUrl };
    }

    // Default: reel
    if (!bundle.video_url) return null;
    return {
      type: 'reels',
      video_url: bundle.video_url,
      caption: bundle.caption,
      hashtags: bundle.hashtags ?? [],
      cover_url: bundle.thumbnail_url ?? undefined,
    };
  }

  async publishBundle(channel, bundle) {
    const spec = this._buildMediaSpec(bundle);
    if (!spec) {
      const type = bundle.content_type || 'reel';
      return { published: false, reason: `Bundle has no media URL for content_type=${type}` };
    }

    // Discover IG accounts linked to this channel (many-to-many path).
    const linkedAccounts = await this._findLinkedInstagramAccounts(channel.id);

    // Legacy fallback: if no linked accounts, fall back to the channel's
    // single instagram_account_id field with the org's Meta page token.
    if (linkedAccounts.length === 0) {
      if (!channel.instagram_account_id) {
        console.warn(
          `[Publishing] Channel ${channel.id} has no instagram_account_id and no linked IG accounts — skipping publish`,
        );
        return {
          published: false,
          reason: 'No instagram_account_id on channel and no linked accounts',
        };
      }
      const probeToken = await this._getPageToken(channel.organization_id);
      if (!probeToken) {
        console.warn(`[Publishing] No Meta access token for org ${channel.organization_id}`);
        return { published: false, reason: 'No Meta access token' };
      }

      await db
        .update(creativeBundles)
        .set({ status: 'publishing', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));

      try {
        const { mediaId } = await this.publishMedia(channel, spec);

        await db
          .update(creativeBundles)
          .set({
            status: 'published',
            updated_at: new Date(),
            render_job_id: mediaId,
            published_targets: [
              {
                instagram_account_id: null,
                ig_username: null,
                ig_business_id: channel.instagram_account_id,
                media_id: mediaId,
                error: null,
                published_at: new Date().toISOString(),
              },
            ],
          })
          .where(eq(creativeBundles.id, bundle.id));

        console.log(`[Publishing] Bundle ${bundle.id} published (legacy single-account) → ${mediaId}`);
        return { published: true, mediaId };
      } catch (err) {
        await db
          .update(creativeBundles)
          .set({ status: 'ready', updated_at: new Date() })
          .where(eq(creativeBundles.id, bundle.id));
        console.error(`[Publishing] Failed for bundle ${bundle.id}:`, err.message);
        throw err;
      }
    }

    // Fan-out path: one publish per linked IG account, each using the
    // IG-account row's own decrypted token.
    await db
      .update(creativeBundles)
      .set({ status: 'publishing', updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    const results = [];
    for (const acct of linkedAccounts) {
      const token = decryptToken(acct.access_token_encrypted, 'instagram');
      const channelStub = {
        id: channel.id,
        organization_id: channel.organization_id,
        instagram_account_id: acct.ig_business_id,
      };
      const originalGetPageToken = this._getPageToken;
      this._getPageToken = async () => token;
      try {
        const out = await this.publishMedia(channelStub, spec);
        results.push({
          instagram_account_id: acct.id,
          ig_username: acct.ig_username,
          ig_business_id: acct.ig_business_id,
          media_id: out.mediaId,
          error: null,
          published_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error(
          `[Publishing] Fan-out to ${acct.ig_username || acct.ig_business_id} failed:`,
          err.message,
        );
        results.push({
          instagram_account_id: acct.id,
          ig_username: acct.ig_username,
          ig_business_id: acct.ig_business_id,
          media_id: null,
          error: err.message,
          published_at: new Date().toISOString(),
        });
      } finally {
        this._getPageToken = originalGetPageToken;
      }
    }

    const successes = results.filter((r) => r.media_id);
    if (successes.length === 0) {
      await db
        .update(creativeBundles)
        .set({ status: 'ready', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));
      const firstError = results.find((r) => r.error)?.error || 'All fan-out targets failed';
      throw new Error(firstError);
    }

    await db
      .update(creativeBundles)
      .set({
        status: 'published',
        updated_at: new Date(),
        render_job_id: successes[0].media_id,
        published_targets: results,
      })
      .where(eq(creativeBundles.id, bundle.id));

    console.log(
      `[Publishing] Bundle ${bundle.id} fanned out → ${successes.length}/${results.length} succeeded`,
    );
    return { published: true, results, mediaId: successes[0].media_id };
  }

  async _findLinkedInstagramAccounts(channelId) {
    const links = await db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.channel_id, channelId));
    if (links.length === 0) return [];
    const ids = links.map((l) => l.instagram_account_id);
    const rows = await db
      .select()
      .from(instagramAccounts)
      .where(inArray(instagramAccounts.id, ids));
    return rows.filter((r) => r.is_active);
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
  async _createImageContainer({ spec, igUserId, token }) {
    const params = {
      ...this._buildCommonParams(spec),
      image_url: spec.image_url,
      access_token: token,
    };
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Image container created: ${data.id}`);
    return data.id;
  }

  async _createVideoContainer({ spec, igUserId, token }) {
    const params = {
      ...this._buildCommonParams(spec),
      media_type: 'VIDEO',
      video_url: spec.video_url,
      access_token: token,
    };
    if (spec.cover_url) params.cover_url = spec.cover_url;
    if (spec.thumb_offset_ms !== undefined) params.thumb_offset = spec.thumb_offset_ms;
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Video container created: ${data.id}`);
    return data.id;
  }

  async _createReelsContainer({ spec, igUserId, token }) {
    const params = {
      ...this._buildCommonParams(spec),
      media_type: 'REELS',
      video_url: spec.video_url,
      share_to_feed: String(spec.share_to_feed ?? true),
      access_token: token,
    };
    if (spec.cover_url) params.cover_url = spec.cover_url;
    if (spec.thumb_offset_ms !== undefined) params.thumb_offset = spec.thumb_offset_ms;
    if (spec.audio_name) params.audio_name = spec.audio_name;
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Reels container created: ${data.id}`);
    return data.id;
  }

  async _createCarouselContainer({ spec, igUserId, token }) {
    const childIds = [];
    for (const child of spec.children) {
      const childId = await this._createCarouselChildContainer({ child, igUserId, token });
      childIds.push(childId);
    }

    for (const childId of childIds) {
      await this._waitForContainer({ igUserId, token, containerId: childId });
    }

    const params = {
      ...this._buildCommonParams(spec),
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      access_token: token,
    };
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG carousel parent creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Carousel parent container created: ${data.id} (children: ${childIds.join(',')})`);
    return data.id;
  }

  async _createCarouselChildContainer({ child, igUserId, token }) {
    const params = { is_carousel_item: 'true', access_token: token };
    if (child.kind === 'image') {
      params.image_url = child.image_url;
      if (Array.isArray(child.user_tags) && child.user_tags.length) {
        params.user_tags = JSON.stringify(child.user_tags);
      }
      if (child.alt_text) params.alt_text = child.alt_text;
    } else {
      params.media_type = 'VIDEO';
      params.video_url = child.video_url;
      if (Array.isArray(child.user_tags) && child.user_tags.length) {
        params.user_tags = JSON.stringify(child.user_tags);
      }
    }
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG carousel child creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Carousel child created: ${data.id}`);
    return data.id;
  }

  async _createStoryContainer({ spec, igUserId, token }) {
    const params = {
      media_type: 'STORIES',
      access_token: token,
    };
    if (spec.image_url) params.image_url = spec.image_url;
    if (spec.video_url) params.video_url = spec.video_url;
    if (Array.isArray(spec.user_tags) && spec.user_tags.length) {
      params.user_tags = JSON.stringify(spec.user_tags);
    }
    const { data } = await axios.post(`${this._apiBase}/${igUserId}/media`, null, {
      params, timeout: 30_000,
    });
    if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
    console.log(`[Publishing] Story container created: ${data.id}`);
    return data.id;
  }

  async _waitForContainer({ igUserId, token, containerId }) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await this._sleep(POLL_INTERVAL_MS);

      // `status_code` is the enum (FINISHED/IN_PROGRESS/ERROR/EXPIRED); the
      // human reason for ERROR ("Failed to download media file", "Video too
      // long", etc.) lives in `status` — fetch both. Querying with both
      // fields makes the diagnosis surface to the user instead of a useless
      // generic "entered status: ERROR".
      const { data } = await axios.get(
        `${this._apiBase}/${containerId}`,
        {
          params: { fields: 'status_code,status', access_token: token },
          timeout: 10_000,
        },
      );

      const statusCode = data?.status_code;
      const statusText = typeof data?.status === 'string' ? data.status : null;
      console.log(
        `[Publishing] Container ${containerId} status_code=${statusCode}` +
          (statusText ? ` status="${statusText}"` : '') +
          ` (attempt ${attempt + 1})`,
      );

      if (statusCode === 'FINISHED') return;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        // The `status` text is normally formatted as "Error: <reason>" — strip
        // the prefix so the message reads naturally when surfaced to users.
        const reason = statusText ? statusText.replace(/^Error:\s*/i, '').trim() : '';
        const friendly = reason
          ? `Instagram rejected the media: ${reason}`
          : `IG container ${containerId} entered status ${statusCode} but no reason was returned by Meta. Most common causes: unsupported codec (use H.264 + AAC), aspect ratio out of range, or duration limits (Reels: 3–90 s, Stories: ≤ 60 s).`;
        const err = new Error(friendly);
        err.statusCode = 400;
        err.code = `IG_CONTAINER_${statusCode}`;
        err.details = { containerId, statusCode, status: statusText };
        throw err;
      }
      // IN_PROGRESS / PUBLISHED — keep polling
    }

    const err = new Error(
      `IG container ${containerId} did not finish within ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s. The video may be too large or Meta is processing slowly — try again or use a shorter clip.`,
    );
    err.statusCode = 504;
    err.code = 'IG_CONTAINER_TIMEOUT';
    err.details = { containerId };
    throw err;
  }

  async _publishContainer({ igUserId, token, containerId }) {
    const { data } = await axios.post(
      `${this._apiBase}/${igUserId}/media_publish`,
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
  _buildCommonParams(spec) {
    const out = {};
    const caption = this._buildCaption({ caption: spec.caption, hashtags: spec.hashtags });
    if (caption) out.caption = caption;
    if (spec.location_id) out.location_id = String(spec.location_id);
    if (Array.isArray(spec.user_tags) && spec.user_tags.length) {
      out.user_tags = JSON.stringify(spec.user_tags);
    }
    if (Array.isArray(spec.collaborators) && spec.collaborators.length) {
      out.collaborators = JSON.stringify(spec.collaborators);
    }
    if (typeof spec.alt_text === 'string' && spec.alt_text.length) {
      out.alt_text = spec.alt_text;
    }
    if (spec.partnership?.is_paid_partnership) {
      out.is_paid_partnership = 'true';
      if (spec.partnership.sponsor_ig_user_ids?.length) {
        out.branded_content_sponsor_ids = JSON.stringify(spec.partnership.sponsor_ig_user_ids);
      }
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

    // Common: collaborators (≤3), partnership (sponsor_ig_user_ids ≤2)
    if (spec.collaborators !== undefined) {
      if (!Array.isArray(spec.collaborators) || spec.collaborators.length > 3) {
        throw badRequest('collaborators must be an array of at most 3 usernames', {
          collaborators: spec.collaborators,
        });
      }
    }
    if (spec.partnership) {
      const ids = spec.partnership.sponsor_ig_user_ids;
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 2)) {
        throw badRequest('partnership.sponsor_ig_user_ids must be an array of at most 2', { ids });
      }
    }

    switch (spec.type) {
      case 'image':
        this._validateImageSpec(spec);
        break;
      case 'video':
        this._validateVideoSpec(spec);
        break;
      case 'reels':
        this._validateReelsSpec(spec);
        break;
      case 'carousel':
        this._validateCarouselSpec(spec);
        break;
      case 'story':
        this._validateStorySpec(spec);
        break;
    }
  }

  _validateImageSpec(spec) {
    if (!isHttpUrl(spec.image_url)) {
      throw badRequest('image_url is required and must be an http(s) URL', { image_url: spec.image_url });
    }
    if (typeof spec.alt_text === 'string' && spec.alt_text.length > 1000) {
      throw badRequest('alt_text exceeds 1000 characters', { length: spec.alt_text.length });
    }
    validateImageUserTags(spec.user_tags);
  }

  _validateVideoSpec(spec) {
    if (!isHttpUrl(spec.video_url)) {
      throw badRequest('video_url is required and must be an http(s) URL', { video_url: spec.video_url });
    }
    if (spec.share_to_feed !== undefined) {
      throw badRequest('share_to_feed is reels-only; use type="reels"');
    }
    if (spec.audio_name !== undefined) {
      throw badRequest('audio_name is reels-only; use type="reels"');
    }
    validateOptionalCoverFields(spec);
  }

  _validateReelsSpec(spec) {
    if (!isHttpUrl(spec.video_url)) {
      throw badRequest('video_url is required and must be an http(s) URL', { video_url: spec.video_url });
    }
    if (typeof spec.audio_name === 'string' && spec.audio_name.length > 30) {
      throw badRequest('audio_name exceeds 30 characters', { length: spec.audio_name.length });
    }
    validateOptionalCoverFields(spec);
  }

  _validateStorySpec(spec) {
    const hasImage = isHttpUrl(spec.image_url);
    const hasVideo = isHttpUrl(spec.video_url);
    if (hasImage === hasVideo) {
      throw badRequest('story requires exactly one of image_url or video_url');
    }
    for (const forbidden of ['caption', 'hashtags', 'collaborators', 'partnership']) {
      if (spec[forbidden] !== undefined) {
        throw badRequest(`${forbidden} is not supported on stories`, { forbidden });
      }
    }
  }

  _validateCarouselSpec(spec) {
    if (!Array.isArray(spec.children) || spec.children.length < 2 || spec.children.length > 10) {
      throw badRequest('carousel children must contain 2 to 10 items', {
        count: Array.isArray(spec.children) ? spec.children.length : null,
      });
    }
    for (const child of spec.children) {
      if (!child || (child.kind !== 'image' && child.kind !== 'video')) {
        throw badRequest('carousel child must declare kind="image" or kind="video"', { child });
      }
      if (child.kind === 'image' && !isHttpUrl(child.image_url)) {
        throw badRequest('carousel image child requires a valid image_url', { child });
      }
      if (child.kind === 'video' && !isHttpUrl(child.video_url)) {
        throw badRequest('carousel video child requires a valid video_url', { child });
      }
      if (child.kind === 'image') {
        validateImageUserTags(child.user_tags);
        if (typeof child.alt_text === 'string' && child.alt_text.length > 1000) {
          throw badRequest('child alt_text exceeds 1000 characters', { length: child.alt_text.length });
        }
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const publishingService = new PublishingService();
