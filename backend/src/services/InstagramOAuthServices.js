import crypto from 'crypto';
import { URL, URLSearchParams } from 'url';
import { encryptToken, decryptToken } from '../utils/encryption.js';
import { config } from '../config/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

export class InstagramOAuthService {
  constructor({ logger, repository, apiService }) {
    this.logger = logger;
    this.repository = repository;
    this.apiService = apiService;
  }

  // --- OAuth URL ---
  generateAuthUrl({ origin, referer, forwardedHost, forwardedProto = 'https' } = {}) {
    const appId = config.instagram.appId || process.env.INSTAGRAM_APP_ID;
    const appSecret = config.instagram.appSecret || process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Instagram App ID or App Secret not configured in environment variables.');
    }

    let redirectUri = config.redirectUris.instagram;
    if (!redirectUri) {
      // Match the existing /instagram-callback convention (set in the user's
      // Meta App). Hyphen, not slash.
      if (origin) {
        redirectUri = `${origin}/instagram-callback`;
      } else if (referer) {
        try {
          const u = new URL(referer);
          redirectUri = `${u.origin}/instagram-callback`;
        } catch {
          /* invalid referer */
        }
      } else if (forwardedHost) {
        redirectUri = `${forwardedProto}://${forwardedHost}/instagram-callback`;
      } else {
        redirectUri = 'http://localhost:5173/instagram-callback';
      }
    }

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = config.instagram.scopes;
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state,
    });
    if (config.instagram.forceReauth) params.append('force_reauth', 'true');

    const authBase = config.instagram.authBaseUrl || 'https://www.instagram.com/oauth/authorize';
    return {
      authUrl: `${authBase}?${params.toString()}`,
      state,
      redirectUri,
    };
  }

  // --- Connect (code → long-lived token → profile → upsert) ---
  async connectAccount(code, providedRedirectUri, user, requestHeaders = {}) {
    const organizationId = user?.organization_id;
    if (!organizationId) throw badRequest('User organization not found');
    const userId = user.userId || user.id || null;

    let redirectUri = providedRedirectUri;
    if (!redirectUri) {
      const fwHost = requestHeaders['x-forwarded-host'];
      const fwProto = requestHeaders['x-forwarded-proto'] || 'https';
      redirectUri = fwHost
        ? `${fwProto}://${fwHost}/instagram-callback`
        : config.redirectUris.instagram;
    }

    const appId = config.instagram.appId || process.env.INSTAGRAM_APP_ID;
    const appSecret = config.instagram.appSecret || process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) throw new Error('Instagram credentials invalid');

    // Step A: code → short-lived token (api.instagram.com is correct here per Meta docs)
    const formData = new URLSearchParams();
    formData.append('client_id', appId);
    formData.append('client_secret', appSecret);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', redirectUri);
    formData.append('code', code);
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      throw new Error(err.error_message || 'Failed to exchange code for token');
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData?.access_token || !tokenData?.user_id) {
      throw new Error('Invalid token response from Instagram');
    }
    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    // Step B: short-lived → long-lived
    let longLivedData;
    try {
      const exchanged = await this.apiService.exchangeForLongLivedToken(shortLivedToken);
      longLivedData = { ...exchanged, user_id: igUserId };
    } catch (err) {
      this.logger.warn({ message: 'Long-lived exchange failed, using short-lived', err: err.message });
      longLivedData = { access_token: shortLivedToken, expires_in: 3600, user_id: igUserId };
    }

    // Step C: profile + page id
    let profile;
    let pageId;
    try {
      profile = await this.apiService.getProfile(igUserId, longLivedData.access_token);
    } catch (err) {
      this.logger.warn({ message: 'Profile fetch failed; using minimal profile', err: err.message });
      profile = {
        id: String(igUserId),
        username: `ig_user_${igUserId}`,
        name: 'Instagram User',
        account_type: 'BUSINESS',
        profile_picture_url: null,
        followers_count: 0,
        follows_count: 0,
        media_count: 0,
      };
    }
    try {
      pageId = await this.apiService.getPageId(profile.id, longLivedData.access_token);
    } catch {
      pageId = null;
    }

    const accessTokenEncrypted = encryptToken(longLivedData.access_token, 'instagram');
    const expiresAt = new Date(Date.now() + (longLivedData.expires_in ?? 3600) * 1000);

    const existing = await this.repository.findByBusinessId(organizationId, profile.id);
    if (existing) {
      await this.repository.update(existing.id, {
        access_token_encrypted: accessTokenEncrypted,
        token_expires_at: expiresAt,
        ig_business_id: profile.id,
        ig_page_id: pageId,
        ig_username: profile.username,
        ig_name: profile.name,
        ig_profile_picture_url: profile.profile_picture_url,
        account_type: profile.account_type,
        followers_count: profile.followers_count,
        follows_count: profile.follows_count,
        media_count: profile.media_count,
        is_active: true,
      });
      return { id: existing.id, username: profile.username, name: profile.name, isNew: false };
    }

    const created = await this.repository.create({
      organization_id: organizationId,
      user_id: userId,
      ig_business_id: profile.id,
      ig_page_id: pageId,
      ig_username: profile.username,
      ig_name: profile.name,
      ig_profile_picture_url: profile.profile_picture_url,
      account_type: profile.account_type,
      followers_count: profile.followers_count,
      follows_count: profile.follows_count,
      media_count: profile.media_count,
      access_token_encrypted: accessTokenEncrypted,
      token_expires_at: expiresAt,
      last_synced_at: new Date(),
      is_active: true,
    });

    return { id: created.id, username: profile.username, name: profile.name, isNew: true };
  }

  // --- Account list / detail / disconnect / refresh ---
  async getAccounts(organizationId) {
    const rows = await this.repository.findByOrganization(organizationId);
    return rows.map((r) => {
      const { access_token_encrypted: _hidden, ...safe } = r;
      return safe;
    });
  }

  async getAccountDetails(organizationId, accountId) {
    const row = await this.repository.findById(accountId);
    if (!row || row.organization_id !== organizationId) throw notFound('Account not found');
    const { access_token_encrypted: _hidden, ...safe } = row;
    return safe;
  }

  async disconnectAccount(organizationId, accountId) {
    const row = await this.repository.findById(accountId);
    if (!row || row.organization_id !== organizationId) throw notFound('Account not found');
    await this.repository.hardDelete(accountId);
  }

  async refreshAccount(organizationId, accountId) {
    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) throw notFound('Account not found');

    const accessToken = decryptToken(account.access_token_encrypted, 'instagram');
    const fresh = await this.apiService.refreshLongLivedToken(accessToken);
    const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);

    let profileUpdate = {};
    try {
      const p = await this.apiService.getProfile(account.ig_business_id, fresh.access_token);
      profileUpdate = {
        ig_username: p.username || account.ig_username,
        ig_name: p.name || account.ig_name,
        ig_profile_picture_url: p.profile_picture_url ?? account.ig_profile_picture_url,
        account_type: p.account_type || account.account_type,
        followers_count: p.followers_count ?? account.followers_count,
        follows_count: p.follows_count ?? account.follows_count,
        media_count: p.media_count ?? account.media_count,
        last_synced_at: new Date(),
      };
    } catch (err) {
      this.logger.warn({ message: 'Profile fetch failed during refresh', err: err.message });
    }

    await this.repository.update(accountId, {
      access_token_encrypted: encryptToken(fresh.access_token, 'instagram'),
      token_expires_at: expiresAt,
      ...profileUpdate,
    });
    return { success: true };
  }

  async getMedia(organizationId, accountId, { limit = 25, after } = {}) {
    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) throw notFound('Account not found');
    const accessToken = decryptToken(account.access_token_encrypted, 'instagram');
    return this.apiService.getMedia(account.ig_business_id, accessToken, { limit, after });
  }

  // --- Channel links ---
  async linkChannel(organizationId, accountId, channelId) {
    const account = await this.repository.findById(accountId);
    if (!account) throw notFound('Account not found');
    if (account.organization_id !== organizationId) throw forbidden('Cross-org link not allowed');
    await this.repository.linkChannel({
      organization_id: organizationId,
      channel_id: channelId,
      instagram_account_id: accountId,
    });
  }

  async unlinkChannel(organizationId, accountId, channelId) {
    const account = await this.repository.findById(accountId);
    if (!account) throw notFound('Account not found');
    if (account.organization_id !== organizationId) throw forbidden('Cross-org unlink not allowed');
    await this.repository.unlinkChannel({
      channel_id: channelId,
      instagram_account_id: accountId,
    });
  }
}
