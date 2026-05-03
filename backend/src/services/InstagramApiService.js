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
      fields:
        'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,media_product_type',
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
}
