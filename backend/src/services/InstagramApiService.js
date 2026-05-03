import axios from 'axios';
import { config } from '../config/index.js';

const TIMEOUT_MS = 15_000;

export class InstagramApiService {
  constructor({ logger }) {
    this.logger = logger;
    this.graphBase = config.instagram.graphApiBaseUrl || 'https://graph.instagram.com';
    this.fbBase = config.meta.baseUrl || 'https://graph.facebook.com';
    this.apiVersion = `v${(config.instagram.apiVersion || 'v21.0').replace(/^v/, '')}`;
  }

  async exchangeForLongLivedToken(shortLivedToken) {
    const { data } = await axios.get(`${this.graphBase}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: config.instagram.appSecret || process.env.INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  async refreshLongLivedToken(longLivedToken) {
    const { data } = await axios.get(`${this.graphBase}/refresh_access_token`, {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: longLivedToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  async getProfile(igBusinessId, accessToken) {
    const { data } = await axios.get(`${this.graphBase}/${this.apiVersion}/${igBusinessId}`, {
      params: {
        fields:
          'id,username,name,profile_picture_url,account_type,followers_count,follows_count,media_count,biography,website',
        access_token: accessToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  async getPageId(igBusinessId, accessToken) {
    // Best-effort. Callers fall back to igBusinessId if this fails.
    const { data } = await axios.get(`${this.fbBase}/${this.apiVersion}/${igBusinessId}`, {
      params: {
        fields: 'connected_facebook_page{id}',
        access_token: accessToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data?.connected_facebook_page?.id ?? null;
  }

  async getMedia(igBusinessId, accessToken, { limit = 25, after } = {}) {
    const params = {
      fields: [
        'id',
        'caption',
        'media_type',
        'media_url',
        'permalink',
        'timestamp',
        'thumbnail_url',
        'media_product_type',
        'like_count',
        'comments_count',
        'is_comment_enabled',
        'children{id,media_type,media_url,permalink,thumbnail_url}',
      ].join(','),
      limit,
      access_token: accessToken,
    };
    if (after) params.after = after;
    const { data } = await axios.get(
      `${this.graphBase}/${this.apiVersion}/${igBusinessId}/media`,
      { params, timeout: TIMEOUT_MS },
    );
    return data;
  }

  // Fetches just enough media metadata to pick the right insight metrics.
  // Used when the caller doesn't already know the media's type.
  async getMediaMeta(mediaId, accessToken) {
    const { data } = await axios.get(`${this.graphBase}/${this.apiVersion}/${mediaId}`, {
      params: {
        fields: 'id,media_type,media_product_type,timestamp',
        access_token: accessToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  // IG Graph API rejects the entire insights call if any single requested
  // metric is invalid for the media type, so callers MUST send a metric set
  // that's valid for that specific media_type / media_product_type combo.
  // Use `defaultInsightMetrics()` below.
  async getMediaInsights(mediaId, accessToken, { metrics }) {
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new Error('metrics array is required');
    }
    const { data } = await axios.get(
      `${this.graphBase}/${this.apiVersion}/${mediaId}/insights`,
      {
        params: {
          metric: metrics.join(','),
          access_token: accessToken,
        },
        timeout: TIMEOUT_MS,
      },
    );
    // Normalize { data: [{ name, values: [{ value }] }] } → { name: value }.
    const out = {};
    for (const row of data?.data ?? []) {
      const v = row?.values?.[0]?.value;
      out[row.name] = v ?? null;
    }
    return out;
  }

  // Fetch top-level comments on a media. Each comment carries one level of
  // replies via the nested `replies{...}` field — IG's API doesn't recurse
  // deeper than that, so callers don't need to paginate replies separately.
  async getMediaComments(mediaId, accessToken, { limit = 25, after } = {}) {
    const params = {
      fields: [
        'id',
        'text',
        'timestamp',
        'username',
        'like_count',
        'hidden',
        'replies{id,text,timestamp,username,like_count,hidden}',
      ].join(','),
      limit,
      access_token: accessToken,
    };
    if (after) params.after = after;
    const { data } = await axios.get(
      `${this.graphBase}/${this.apiVersion}/${mediaId}/comments`,
      { params, timeout: TIMEOUT_MS },
    );
    return data;
  }
}

// Picks the insight metric set Meta accepts for a given media kind.
// Wrong metrics → 400 from IG, so be conservative.
export function defaultInsightMetrics({ media_type, media_product_type } = {}) {
  if (media_product_type === 'STORY') {
    return ['reach', 'replies', 'total_interactions'];
  }
  if (media_product_type === 'REELS' || media_type === 'VIDEO') {
    return ['reach', 'saved', 'total_interactions', 'likes', 'comments', 'shares', 'views'];
  }
  // FEED IMAGE / CAROUSEL_ALBUM
  return ['reach', 'saved', 'total_interactions', 'likes', 'comments', 'shares'];
}
