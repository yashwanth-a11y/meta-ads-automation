import { MetaAdsApiService } from "./MetaAdsApiService.js";
import { MetaCapiService } from "./MetaCapiService.js";
import { config } from "../config/index.js";
import { env } from "../config/env.js";
import { encryptToken, decryptToken } from "../utils/encryption.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// --- SSRF guard for /adimages URL-fetch path ---
// Hostname-only check (no DNS resolution). A determined attacker can still
// register a domain pointing at an internal IP and bypass this; for full
// protection resolve the hostname and re-check the resolved address.
function _isPrivateOrLoopbackHostname(host) {
  if (!host) return true;
  const lower = host.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  const ipv4 = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10);
    const b = parseInt(ipv4[2], 10);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. AWS IMDS
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

export class AdsService {
  constructor({
    metaAdAccountRepository,
    ctwaCampaignRepository,
    ctwaInsightsRepository,
    ctwaConversationRepository,
    ctwaConversionRepository,
    audiencePresetRepository,
    contactRepository,
    businessAccountRepository,
    automationFlowRepository,
    logger,
  }) {
    this.metaAdAccountRepo = metaAdAccountRepository;
    this.campaignRepo = ctwaCampaignRepository;
    this.contactRepo = contactRepository;
    this.businessAccountRepo = businessAccountRepository;
    this.automationFlowRepo = automationFlowRepository;
    this.insightsRepo = ctwaInsightsRepository;
    this.conversationRepo = ctwaConversationRepository;
    this.conversionRepo = ctwaConversionRepository;
    this.audiencePresetRepo = audiencePresetRepository;
    this.logger = logger;
    this.capiService = new MetaCapiService(logger);
  }

  _getMetaApi(accessTokenEncrypted) {
    const token = decryptToken(accessTokenEncrypted);
    return new MetaAdsApiService(token, this.logger);
  }

  _getAppCredentials(account) {
    const appId =
      account?.oauth_app_id ||
      process.env.META_ADS_OAUTH_APP_ID ||
      process.env.META_ADS_APP_ID ||
      process.env.META_APP_ID;

    // Derive the secret that corresponds to this app ID
    let appSecret;
    if (appId === process.env.META_ADS_APP_ID) {
      appSecret = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET;
    } else if (appId === process.env.META_APP_ID) {
      appSecret = process.env.META_APP_SECRET || process.env.META_ADS_APP_SECRET;
    } else {
      appSecret = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET;
    }

    return { appId, appSecret };
  }

  _getPageMetaApi(account) {
    // Use page access token if available, fall back to user token
    const tokenEncrypted = account.page_access_token_encrypted || account.access_token_encrypted;
    const token = decryptToken(tokenEncrypted);
    return new MetaAdsApiService(token, this.logger);
  }

  // === SETUP ===

  _getAdsOAuthConfig() {
    return {
      appId:
        process.env.META_ADS_OAUTH_APP_ID ||
        process.env.META_ADS_APP_ID ||
        process.env.META_APP_ID,
      redirectUri: config.redirectUris.metaAds,
    };
  }

  async getSetupStatus(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    return {
      connected: !!account,
      account: account
        ? {
            id: account.id,
            ad_account_id: account.ad_account_id,
            ad_account_name: account.ad_account_name,
            page_id: account.page_id,
            page_name: account.page_name,
            currency: account.currency,
            status: account.status,
            balance: account.balance_cache,
            balance_last_synced: account.balance_last_synced,
          }
        : null,
    };
  }

  // --- OAuth state: HMAC-signed payload `{orgId,timestamp,nonce}` so we can
  // verify on callback without a DB roundtrip. 30-minute expiry. Replay is
  // possible within the window but irrelevant because Meta's auth code is
  // single-use and bound to redirect_uri. ---
  _signOauthState(organizationId) {
    const ts = Date.now();
    const nonce = crypto.randomBytes(8).toString("hex");
    const payload = `${organizationId}.${ts}.${nonce}`;
    const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
    return Buffer.from(`${payload}.${sig}`).toString("base64url");
  }

  _verifyOauthState(state) {
    if (!state || typeof state !== "string") return null;
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf8");
      const parts = decoded.split(".");
      if (parts.length !== 4) return null;
      const [orgId, tsStr, nonce, sig] = parts;
      const payload = `${orgId}.${tsStr}.${nonce}`;
      const expected = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      const ts = parseInt(tsStr, 10);
      if (!Number.isFinite(ts) || Date.now() - ts > 30 * 60 * 1000) return null;
      return { organizationId: orgId };
    } catch {
      return null;
    }
  }

  getOAuthUrl(organizationId) {
    const state = this._signOauthState(organizationId);

    const { appId, redirectUri } = this._getAdsOAuthConfig();

    const scopes = [
      "ads_management",
      "ads_read",
      "business_management",
      "pages_read_engagement",
      "pages_show_list",
      "pages_manage_ads",
      "leads_retrieval",
    ].join(",");

    const url =
      `https://www.facebook.com/${config.meta.apiVersion}/dialog/oauth?` +
      `client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}` +
      `&response_type=code` +
      `&state=${state}`;

    return {
      url,
      state,
      debug: {
        app_id: appId,
        redirect_uri: redirectUri,
        api_version: config.meta.apiVersion,
      },
    };
  }

  async handleOAuthCallback(code, state, organizationId) {
    // CSRF: state must verify and bind to the calling org.
    const verified = this._verifyOauthState(state);
    if (!verified || verified.organizationId !== organizationId) {
      throw { code: 400, message: "Invalid or expired OAuth state" };
    }

    const { appId, redirectUri } = this._getAdsOAuthConfig();

    // Exchange code for short-lived token
    const tokenData = await MetaAdsApiService.exchangeCodeForToken(code, redirectUri, appId);
    // Exchange for long-lived token
    const longLivedData = await MetaAdsApiService.getLongLivedToken(tokenData.access_token, appId);

    const metaApi = new MetaAdsApiService(longLivedData.access_token, this.logger);

    // Get available ad accounts and pages
    const [adAccountsResp, pagesResp] = await Promise.all([
      metaApi.getAdAccounts(),
      metaApi.getPages(),
    ]);

    return {
      access_token: longLivedData.access_token,
      expires_in: longLivedData.expires_in,
      oauth_app_id: appId,
      ad_accounts: adAccountsResp.data || [],
      pages: pagesResp.data || [],
    };
  }

  async connectAdAccount(organizationId, data) {
    const encryptedToken = encryptToken(data.access_token);
    const encryptedPageToken = data.page_access_token
      ? encryptToken(data.page_access_token)
      : null;
    const tokenExpiry = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    // Remove any existing ad account records for this org to avoid unique constraint conflicts
    await this.metaAdAccountRepo.deleteByOrganizationId(organizationId);

    // Resolve which app was used during OAuth — prefer what the frontend passes back,
    // then fall back to the current env-based config so existing flows still work.
    const oauthAppId =
      data.oauth_app_id ||
      process.env.META_ADS_OAUTH_APP_ID ||
      process.env.META_ADS_APP_ID ||
      process.env.META_APP_ID;

    // If waba_id not provided by frontend, fetch it from Meta using the page access token
    let wabaId = data.waba_id || null;
    if (!wabaId && data.page_id && (data.page_access_token || data.access_token)) {
      try {
        const pageToken = data.page_access_token || data.access_token;
        const pageMetaApi = new MetaAdsApiService(pageToken, this.logger);
        const wabaResp = await pageMetaApi.getPageWABA(data.page_id);
        wabaId = wabaResp?.whatsapp_business_account?.id || null;
        this.logger?.info({ wabaId, page_id: data.page_id }, "Fetched WABA ID for page");
      } catch (err) {
        this.logger?.warn({ err: err.message }, "Could not fetch WABA ID for page, proceeding without it");
      }
    }

    const account = await this.metaAdAccountRepo.create({
      organization_id: organizationId,
      ad_account_id: data.ad_account_id,
      ad_account_name: data.ad_account_name || null,
      page_id: data.page_id || null,
      page_name: data.page_name || null,
      waba_id: wabaId,
      fb_user_id: data.fb_user_id || null,
      access_token_encrypted: encryptedToken,
      page_access_token_encrypted: encryptedPageToken || null,
      token_expiry: tokenExpiry,
      pixel_id: data.pixel_id || null,
      oauth_app_id: oauthAppId || null,
      currency: data.currency || "INR",
    });

    // Subscribe page to leadgen so the API returns real leads (not just test leads)
    if (data.page_id && (encryptedPageToken || encryptedToken)) {
      try {
        const pageMetaApi = this._getPageMetaApi(account);
        await pageMetaApi.subscribePageToLeadGen(data.page_id);
        this.logger?.info({ page_id: data.page_id }, "Subscribed page to leadgen");
      } catch (err) {
        this.logger?.warn({ err: err.message, page_id: data.page_id }, "Failed to subscribe page to leadgen");
      }
    }

    // Sync initial balance
    try {
      const metaApi = this._getMetaApi(account.access_token_encrypted);
      const balanceData = await metaApi.getAdAccountBalance(data.ad_account_id);
      await this.metaAdAccountRepo.updateBalance(
        account.id,
        parseFloat(balanceData.balance) / 100
      );
    } catch (err) {
      this.logger?.warn({ err: err.message }, "Failed to sync initial balance");
    }

    return account;
  }

  async getAvailableAdAccounts(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const [adAccountsResp, pagesResp] = await Promise.all([
      metaApi.getAdAccounts(),
      metaApi.getPages(),
    ]);

    return {
      ad_accounts: adAccountsResp.data || [],
      pages: pagesResp.data || [],
      current_ad_account_id: account.ad_account_id,
      current_page_id: account.page_id,
    };
  }

  async switchAdAccount(organizationId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    // Decrypt the existing token to re-use it
    const token = decryptToken(account.access_token_encrypted);

    // If a new page_access_token is provided (from the available accounts data), encrypt it
    const pageTokenEncrypted = data.page_access_token
      ? encryptToken(data.page_access_token)
      : account.page_access_token_encrypted;

    // Resolve WABA ID for the selected page
    let wabaId = data.waba_id || null;
    if (!wabaId && data.page_id) {
      try {
        const pageToken = data.page_access_token || token;
        const pageMetaApi = new MetaAdsApiService(pageToken, this.logger);
        const wabaResp = await pageMetaApi.getPageWABA(data.page_id);
        wabaId = wabaResp?.whatsapp_business_account?.id || null;
        this.logger?.info({ wabaId, page_id: data.page_id }, "[Ads] Fetched WABA ID for switched page");
      } catch (err) {
        this.logger?.warn({ err: err.message, page_id: data.page_id }, "[Ads] Could not fetch WABA ID for switched page");
      }
    }

    // Delete existing and create new with same token
    await this.metaAdAccountRepo.deleteByOrganizationId(organizationId);

    const newAccount = await this.metaAdAccountRepo.create({
      organization_id: organizationId,
      ad_account_id: data.ad_account_id,
      ad_account_name: data.ad_account_name || null,
      oauth_app_id: account.oauth_app_id || null,
      page_id: data.page_id || null,
      page_name: data.page_name || null,
      waba_id: wabaId,
      access_token_encrypted: account.access_token_encrypted,
      page_access_token_encrypted: pageTokenEncrypted || null,
      token_expiry: account.token_expiry,
      currency: data.currency || "INR",
    });

    // Subscribe page to leadgen so the API returns real leads
    if (data.page_id) {
      try {
        const pageMetaApi = this._getPageMetaApi(newAccount);
        await pageMetaApi.subscribePageToLeadGen(data.page_id);
        this.logger?.info({ page_id: data.page_id }, "[Ads] Subscribed page to leadgen after switch");
      } catch (err) {
        this.logger?.warn({ err: err.message, page_id: data.page_id }, "[Ads] Failed to subscribe page to leadgen after switch");
      }
    }

    // Sync balance for new account
    try {
      const metaApi = new MetaAdsApiService(token, this.logger);
      const balanceData = await metaApi.getAdAccountBalance(data.ad_account_id);
      await this.metaAdAccountRepo.updateBalance(
        newAccount.id,
        parseFloat(balanceData.balance) / 100
      );
    } catch (err) {
      this.logger?.warn({ err: err.message }, "Failed to sync balance after switch");
    }

    return newAccount;
  }

  async getBalance(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) return null;

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const balanceData = await metaApi.getAdAccountBalance(account.ad_account_id);
    const balance = parseFloat(balanceData.balance) / 100;

    await this.metaAdAccountRepo.updateBalance(account.id, balance);

    return {
      balance,
      currency: account.currency,
      amount_spent: parseFloat(balanceData.amount_spent) / 100,
      spend_cap: balanceData.spend_cap ? parseFloat(balanceData.spend_cap) / 100 : null,
    };
  }

  async disconnect(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (account) {
      await this.metaAdAccountRepo.disconnect(account.id);
    }
  }

  // === CAMPAIGNS ===

  // Newer wizard objectives (Website Traffic, Lead Gen, true CTWA-with-WABA)
  // are dispatched to a separate orchestrator below. The legacy CTWA +
  // Catalog logic in this method is preserved as-is for back-compat.
  static NEW_OBJECTIVES = new Set([
    "OUTCOME_TRAFFIC_WEBSITE",
    "OUTCOME_LEADS_ON_AD",
    "OUTCOME_ENGAGEMENT_CTWA",
  ]);

  async createCampaign(organizationId, data) {
    if (data && data.objective && AdsService.NEW_OBJECTIVES.has(data.objective)) {
      return this._createCampaignForObjective(organizationId, data, { dryRun: false });
    }

    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    const isCatalogCampaign = !!data.catalog_id;

    // WABA ID is stored during connectAdAccount / switchAdAccount from the Facebook Page's linked WhatsApp account.
    // If missing (e.g. old connected account), try fetching from Meta page API and save it back.
    let wabaId = account.waba_id;
    this.logger?.info({ wabaId, accountId: account.id, page_id: account.page_id }, "[Ads] WABA ID from stored meta_ad_account");
    if (!isCatalogCampaign && !wabaId && account.page_id) {
      try {
        const pageApi = this._getPageMetaApi(account);
        const wabaResp = await pageApi.getPageWABA(account.page_id);
        wabaId = wabaResp?.whatsapp_business_account?.id || null;
        if (wabaId) {
          await this.metaAdAccountRepo.update(account.id, { waba_id: wabaId });
          this.logger?.info({ wabaId, page_id: account.page_id }, "[Ads] Auto-fetched and saved WABA ID from Meta page");
        } else {
          this.logger?.warn({ page_id: account.page_id }, "[Ads] Page has no linked WhatsApp Business Account — promoted_object will use page_id only");
        }
      } catch (err) {
        this.logger?.warn({ err: err.message, page_id: account.page_id }, "[Ads] Could not fetch WABA ID from Meta page");
      }
    }
    this.logger?.info({ finalWabaId: wabaId, isCatalogCampaign }, "[Ads] Final WABA ID for campaign creation");

    // For CTWA ads, get the WhatsApp phone number from the connected business account
    // so we can set ctaValue.link = https://wa.me/<number> on the creative.
    let orgWhatsappNumber = null;
    if (!isCatalogCampaign && this.businessAccountRepo) {
      try {
        const { data: businessAccounts } = await this.businessAccountRepo.findAll({
          organizationId,
          pagination: { limit: 1 },
        });
        if (businessAccounts?.length) {
          orgWhatsappNumber = businessAccounts[0].phone_number || null;
        }
        this.logger?.info({ orgWhatsappNumber }, "[Ads] WhatsApp phone number for CTWA creative");
      } catch (err) {
        this.logger?.warn({ err: err.message }, "[Ads] Could not fetch business account phone number");
      }
    }

    // Step 1: Create Meta campaign
    const campaignCreateParams = {
      name: data.name,
      // OUTCOME_TRAFFIC + LINK_CLICKS is the only combination that:
      //   a) works without a WABA-linked Facebook Page, and
      //   b) is compatible with the LINK_CLICKS optimization goal on the ad set.
      // OUTCOME_ENGAGEMENT only supports CONVERSATIONS (requires WABA) for CTWA ads.
      objective: isCatalogCampaign ? "OUTCOME_SALES" : "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: Array.isArray(data.special_ad_categories) && data.special_ad_categories.length > 0
        ? data.special_ad_categories
        : [],
    };
    if (data.campaign_label) {
      campaignCreateParams.adlabels = [{ name: data.campaign_label }];
    }
    const metaCampaign = await metaApi.createCampaign(account.ad_account_id, campaignCreateParams);

    // Step 2: Create ad set
    const promotedObject = isCatalogCampaign
      ? {
          product_catalog_id: data.catalog_id,
          ...(data.product_set_id && { product_set_id: data.product_set_id }),
          page_id: account.page_id,
        }
      : {
          // For CTWA ads we only need the page_id.
          // Including whatsapp_business_account_id requires the page to be formally
          // linked to a WABA in Meta Business Suite, which triggers error 2446886 on activation.
          page_id: account.page_id,
        };

    // Convert date strings to Unix timestamps for Meta API
    const toUnixTimestamp = (dateStr) => {
      if (!dateStr) return undefined;
      const ts = Math.floor(new Date(dateStr).getTime() / 1000);
      // Ensure start_time is not in the past — use now+5min if it is
      const nowTs = Math.floor(Date.now() / 1000);
      return ts < nowTs ? nowTs + 300 : ts;
    };

    const adSetParams = {
      name: `${data.name} - AdSet`,
      campaign_id: metaCampaign.id,
      daily_budget: data.daily_budget ? Math.round(data.daily_budget * 100) : undefined,
      lifetime_budget: data.lifetime_budget ? Math.round(data.lifetime_budget * 100) : undefined,
      start_time: toUnixTimestamp(data.start_date),
      end_time: data.end_date ? Math.floor(new Date(data.end_date).getTime() / 1000) : undefined,
      targeting: data.targeting_spec || { geo_locations: { countries: ["IN"] } },
      promoted_object: promotedObject,
      status: "PAUSED",
    };

    if (isCatalogCampaign) {
      adSetParams.optimization_goal = "OFFSITE_CONVERSIONS";
      adSetParams.destination_type = "WEBSITE";
      adSetParams.billing_event = "IMPRESSIONS";
    } else {
      // LINK_CLICKS is valid for OUTCOME_TRAFFIC and requires no WABA linking.
      // The WhatsApp destination is driven by the creative CTA (WHATSAPP_MESSAGE + wa.me link).
      adSetParams.optimization_goal = "LINK_CLICKS";
      adSetParams.billing_event = "IMPRESSIONS";
    }

    this.logger?.info({ adSetParams: JSON.stringify(adSetParams) }, "[Ads] Creating ad set");
    const metaAdSet = await metaApi.createAdSet(account.ad_account_id, adSetParams);
    this.logger?.info({ adSetId: metaAdSet.id }, "[Ads] Ad set created");

    // Step 3: Create ad creative
    const creativeSpec = data.creative_spec || {};
    let objectStorySpec;

    if (isCatalogCampaign) {
      // Dynamic product ad creative using template_data
      objectStorySpec = {
        page_id: account.page_id,
        template_data: {
          message: creativeSpec.primary_text || "Check out our products!",
          link: creativeSpec.website_url || "https://www.example.com",
          name: "{{product.name}}",
          description: "{{product.price}}",
          call_to_action: {
            type: creativeSpec.cta_type || "SHOP_NOW",
          },
        },
      };
    } else {
      // Standard WhatsApp engagement ad creative
      // For CTWA ads the page URL is used as the link; destination is controlled by destination_type=WHATSAPP on the ad set
      const pageUrl = `https://www.facebook.com/${account.page_id}`;
      const ctaValue = { app_destination: "WHATSAPP" };
      const waNumber = creativeSpec.whatsapp_number || orgWhatsappNumber;
      if (waNumber) {
        ctaValue.link = `https://wa.me/${String(waNumber).replace(/\D/g, "")}`;
      }

      objectStorySpec = {
        page_id: account.page_id,
        link_data: {
          message: creativeSpec.primary_text || data.name,
          link: pageUrl,
          name: creativeSpec.headline || data.name,
          description: creativeSpec.description || "",
          call_to_action: {
            type: creativeSpec.cta_type || "WHATSAPP_MESSAGE",
            value: ctaValue,
          },
        },
      };

      if (creativeSpec.image_hash) {
        objectStorySpec.link_data.image_hash = creativeSpec.image_hash;
      } else if (creativeSpec.image_url) {
        objectStorySpec.link_data.picture = creativeSpec.image_url;
      }
    }

    const creativeParams = {
      name: `${data.name} - Creative`,
      object_story_spec: objectStorySpec,
    };
    if (isCatalogCampaign) {
      creativeParams.product_set_id = data.product_set_id;
    }

    this.logger?.info({ creativeParams: JSON.stringify(creativeParams) }, "[Ads] Creating ad creative");
    const metaCreative = await metaApi.createAdCreative(account.ad_account_id, creativeParams);
    this.logger?.info({ creativeId: metaCreative.id }, "[Ads] Ad creative created");

    // Step 4: Create ad
    const metaAd = await metaApi.createAd(account.ad_account_id, {
      name: data.name,
      adset_id: metaAdSet.id,
      creative_id: metaCreative.id,
      status: "PAUSED",
    });

    // Step 5: Store in DB
    const campaign = await this.campaignRepo.create({
      organization_id: organizationId,
      ad_account_id: account.ad_account_id,
      business_account_id: data.business_account_id,
      meta_campaign_id: metaCampaign.id,
      meta_adset_id: metaAdSet.id,
      meta_creative_id: metaCreative.id,
      meta_ad_id: metaAd.id,
      name: data.name,
      campaign_label: data.campaign_label || null,
      status: "paused",
      objective: isCatalogCampaign ? "OUTCOME_SALES" : "OUTCOME_TRAFFIC",
      campaign_type: data.campaign_type || "easy",
      daily_budget: data.daily_budget,
      lifetime_budget: data.lifetime_budget,
      start_date: data.start_date ? new Date(data.start_date) : null,
      end_date: data.end_date ? new Date(data.end_date) : null,
      flow_id: data.flow_id,
      targeting_spec: data.targeting_spec,
      placement_spec: data.placement_spec,
      creative_spec: data.creative_spec,
      opening_message: data.opening_message,
    });

    // Step 6: Publish if requested
    if (data.publish) {
      try {
        await metaApi.updateCampaignStatus(metaCampaign.id, "ACTIVE");
        await metaApi.updateAdSetStatus(metaAdSet.id, "ACTIVE");
        await metaApi.updateAd(metaAd.id, { status: "ACTIVE" });
        await this.campaignRepo.update(campaign.id, { status: "active" });
        campaign.status = "active";
      } catch (publishErr) {
        // Campaign objects were created in Meta (PAUSED) and saved to DB.
        // Activation failed — return the campaign as a draft with a warning
        // so the frontend can show a useful message instead of a hard error.
        this.logger?.warn(
          { err: publishErr, metaErrorSubcode: publishErr.metaErrorSubcode, campaignId: campaign.id },
          "[Ads] Campaign created but activation failed — returning as draft"
        );
        let warning = "Campaign was saved as a draft. To publish it, go to Meta Ads Manager and activate it manually.";
        if (publishErr.metaErrorSubcode === 2446886) {
          warning =
            "Campaign saved as draft. Activation failed because your Facebook Page is not linked to a WhatsApp Business Account. " +
            "Go to Facebook Page Settings → WhatsApp, connect your number, then activate the campaign.";
        }
        campaign._publishWarning = warning;
      }
    }

    return campaign;
  }

  // === NEW OBJECTIVES ORCHESTRATOR ===

  // Resolves per-objective Meta campaign+adset+creative+ad params.
  // Returns { campaign, adset, creative, ad } where each is the params bag
  // that goes to MetaAdsApiService.create*. The orchestrator then runs
  // the 4-step create with optional validate_only and cleanup-on-failure.
  _resolveObjective(objective, data, account) {
    const orgPageId = account.page_id;
    if (!orgPageId) {
      throw { code: 400, message: "Connected Page is required for this objective." };
    }

    const baseTargeting = {
      ...(data.targeting_spec || {}),
      targeting_automation: {
        advantage_audience:
          data.targeting_spec?.targeting_automation?.advantage_audience ?? 1,
      },
    };
    if (!baseTargeting.geo_locations || Object.keys(baseTargeting.geo_locations).length === 0) {
      baseTargeting.geo_locations = { countries: ["IN"] };
    }

    const cs = data.creative_spec || {};
    const headline = cs.headline || data.name;
    const message = cs.primary_text || data.name;
    const description = cs.description || "";

    const linkData = (link, ctaType, ctaValue) => {
      const ld = {
        message,
        link,
        name: headline,
        description,
        call_to_action: { type: ctaType, value: ctaValue },
      };
      if (cs.image_hash) ld.image_hash = cs.image_hash;
      else if (cs.image_url) ld.picture = cs.image_url;
      if (cs.video_id) ld.video_id = cs.video_id;
      return ld;
    };

    const objectStorySpecLink = (link, ctaType, ctaValue) => ({
      page_id: orgPageId,
      link_data: linkData(link, ctaType, ctaValue),
    });

    const sac =
      Array.isArray(data.special_ad_categories) && data.special_ad_categories.length > 0
        ? data.special_ad_categories
        : ["NONE"];

    if (objective === "OUTCOME_TRAFFIC_WEBSITE") {
      const url = cs.destination_url;
      if (!url || !/^https?:\/\//.test(url)) {
        throw { code: 400, message: "destination_url is required and must start with http(s)://" };
      }
      return {
        campaign: { name: data.name, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: sac },
        adset: {
          name: `${data.name} - AdSet`,
          campaign_id: null, // filled in after step 1
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          targeting: baseTargeting,
          status: "PAUSED",
        },
        creative: {
          name: `${data.name} - Creative`,
          object_story_spec: objectStorySpecLink(url, cs.cta_type || "LEARN_MORE", { link: url }),
        },
        ad: { name: data.name, adset_id: null, creative_id: null, status: "PAUSED" },
      };
    }

    if (objective === "OUTCOME_LEADS_ON_AD") {
      const leadFormId = data.lead_gen_form_id || cs.lead_gen_form_id;
      if (!leadFormId) {
        throw { code: 400, message: "lead_gen_form_id is required for Lead Gen campaigns." };
      }
      // Per Meta lead-ads docs: adset.destination_type=ON_AD,
      // optimization_goal=LEAD_GENERATION, promoted_object.page_id, and
      // creative CTA value carries lead_gen_form_id.
      const placeholderUrl = `https://www.facebook.com/${orgPageId}`;
      return {
        campaign: { name: data.name, objective: "OUTCOME_LEADS", status: "PAUSED", special_ad_categories: sac },
        adset: {
          name: `${data.name} - AdSet`,
          campaign_id: null,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LEAD_GENERATION",
          destination_type: "ON_AD",
          targeting: baseTargeting,
          promoted_object: { page_id: orgPageId },
          status: "PAUSED",
        },
        creative: {
          name: `${data.name} - Creative`,
          object_story_spec: objectStorySpecLink(
            placeholderUrl,
            cs.cta_type || "SIGN_UP",
            { lead_gen_form_id: leadFormId },
          ),
        },
        ad: { name: data.name, adset_id: null, creative_id: null, status: "PAUSED" },
      };
    }

    if (objective === "OUTCOME_ENGAGEMENT_CTWA") {
      if (!account.waba_id) {
        throw {
          code: 400,
          message:
            "Your Facebook Page is not linked to a WhatsApp Business Account. Link a WABA in Meta Business Suite, or use the legacy CTWA flow.",
          metaErrorSubcode: 2446886,
        };
      }
      const waNumber = (cs.whatsapp_number || "").replace(/\D/g, "");
      const waLink = waNumber ? `https://wa.me/${waNumber}` : `https://wa.me/`;
      return {
        campaign: { name: data.name, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", special_ad_categories: sac },
        adset: {
          name: `${data.name} - AdSet`,
          campaign_id: null,
          billing_event: "IMPRESSIONS",
          optimization_goal: "CONVERSATIONS",
          destination_type: "WHATSAPP",
          targeting: baseTargeting,
          promoted_object: { page_id: orgPageId },
          status: "PAUSED",
        },
        creative: {
          name: `${data.name} - Creative`,
          object_story_spec: objectStorySpecLink(
            waLink,
            "WHATSAPP_MESSAGE",
            { app_destination: "WHATSAPP", link: waLink },
          ),
        },
        ad: { name: data.name, adset_id: null, creative_id: null, status: "PAUSED" },
      };
    }

    throw { code: 400, message: `Unknown objective: ${objective}` };
  }

  // Clamp helper used by AI generation normalization.
  static _clampInt(value, min, max, fallback) {
    const n = typeof value === "number" ? Math.round(value) : parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  // Coerces a date-string or unix-second value to unix seconds; if the
  // result is in the past, bumps it to now+5min so Meta doesn't reject it.
  static _toUnixTs(value) {
    if (!value) return undefined;
    let ts = typeof value === "number" ? value : Math.floor(new Date(value).getTime() / 1000);
    if (Number.isNaN(ts)) return undefined;
    const nowTs = Math.floor(Date.now() / 1000);
    if (ts < nowTs) ts = nowTs + 300;
    return ts;
  }

  // The orchestrator. Runs the 4 Meta calls (with execution_options=
  // ['validate_only'] when dryRun is true). On real-run failure, deletes
  // any objects already created on Meta in reverse order so we don't
  // leave orphans behind.
  async _createCampaignForObjective(organizationId, data, { dryRun }) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Auto-fetch WABA for Page if missing & objective wants it
    if (data.objective === "OUTCOME_ENGAGEMENT_CTWA" && !account.waba_id && account.page_id) {
      try {
        const pageApi = this._getPageMetaApi(account);
        const wabaResp = await pageApi.getPageWABA(account.page_id);
        const wabaId = wabaResp?.whatsapp_business_account?.id || null;
        if (wabaId) {
          await this.metaAdAccountRepo.update(account.id, { waba_id: wabaId });
          account.waba_id = wabaId;
        }
      } catch (err) {
        this.logger?.warn({ err: err.message }, "[Ads] Could not auto-fetch WABA");
      }
    }

    const resolved = this._resolveObjective(data.objective, data, account);

    // Apply budget/schedule/promoted_object to the adset block
    const adset = { ...resolved.adset };
    if (data.daily_budget) adset.daily_budget = Math.round(data.daily_budget * 100);
    if (data.lifetime_budget) adset.lifetime_budget = Math.round(data.lifetime_budget * 100);
    adset.start_time = AdsService._toUnixTs(data.start_date);
    adset.end_time = data.end_date
      ? Math.floor(new Date(data.end_date).getTime() / 1000)
      : undefined;

    // Bid strategy. Default 'LOWEST_COST_WITHOUT_CAP' is set in the resolver.
    // Meta requires bid_amount in account-currency MINOR units when using
    // LOWEST_COST_WITH_BID_CAP or COST_CAP. roas_average_floor is a basis-points
    // multiplier (1.5 → pass 1500) for LOWEST_COST_WITH_MIN_ROAS.
    if (data.bid_strategy && data.bid_strategy !== "LOWEST_COST_WITHOUT_CAP") {
      adset.bid_strategy = data.bid_strategy;
      if (
        (data.bid_strategy === "LOWEST_COST_WITH_BID_CAP" ||
          data.bid_strategy === "COST_CAP") &&
        typeof data.bid_amount === "number" &&
        data.bid_amount > 0
      ) {
        adset.bid_amount = Math.round(data.bid_amount * 100);
      }
      if (
        data.bid_strategy === "LOWEST_COST_WITH_MIN_ROAS" &&
        typeof data.roas_average_floor === "number" &&
        data.roas_average_floor > 0
      ) {
        // Meta expects roas_average_floor as basis points (1.5 = 1500).
        adset.bid_constraints = { roas_average_floor: Math.round(data.roas_average_floor * 1000) };
      }
    }

    const execOptions = dryRun ? ["validate_only"] : undefined;

    // Track created object IDs so we can roll back on failure.
    const created = [];
    let validatedSteps = [];
    try {
      // STEP 1 — campaign
      const campaignResp = await metaApi.createCampaign(account.ad_account_id, {
        ...resolved.campaign,
        ...(execOptions ? { execution_options: execOptions } : {}),
      });
      const metaCampaignId = campaignResp?.id;
      if (!dryRun) created.push({ kind: "campaign", id: metaCampaignId });
      validatedSteps.push("campaign");

      // Dry-run short-circuit: Meta's validate_only returns { success: true }
      // with no `id`, so we can't chain the next step's validation against
      // a parent that doesn't exist (placeholder "0" gets rejected with
      // "Invalid id: 0"). The campaign-level validation is still useful —
      // it catches objective + special_ad_categories + name issues, which
      // are the most common failure modes. Adset/creative/ad get validated
      // at real publish, with cleanup-on-failure if any step fails.
      if (dryRun) {
        return {
          ok: true,
          validated: validatedSteps,
          note:
            "Meta validate_only only verifies the campaign step end-to-end. " +
            "Ad set, creative, and ad are validated at publish time (cleanup runs on failure).",
        };
      }

      // STEP 2 — ad set
      const adsetParams = {
        ...adset,
        campaign_id: metaCampaignId,
      };
      const adsetResp = await metaApi.createAdSet(account.ad_account_id, adsetParams);
      const metaAdsetId = adsetResp?.id;
      created.push({ kind: "adset", id: metaAdsetId });
      validatedSteps.push("adset");

      // STEP 3 — ad creative
      const creativeResp = await metaApi.createAdCreative(account.ad_account_id, {
        ...resolved.creative,
      });
      const metaCreativeId = creativeResp?.id;
      created.push({ kind: "creative", id: metaCreativeId });
      validatedSteps.push("creative");

      // STEP 4 — ad
      const adResp = await metaApi.createAd(account.ad_account_id, {
        ...resolved.ad,
        adset_id: metaAdsetId,
        creative_id: metaCreativeId,
      });
      const metaAdId = adResp?.id;
      created.push({ kind: "ad", id: metaAdId });
      validatedSteps.push("ad");

      // (dryRun returned earlier — code path below is real-create only.)

      // Persist mirror row
      const campaign = await this.campaignRepo.create({
        organization_id: organizationId,
        ad_account_id: account.ad_account_id,
        business_account_id: data.business_account_id,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdsetId,
        meta_creative_id: metaCreativeId,
        meta_ad_id: metaAdId,
        name: data.name,
        campaign_label: data.campaign_label || null,
        status: "paused",
        objective: data.objective,
        campaign_type: data.campaign_type || data.objective,
        daily_budget: data.daily_budget,
        lifetime_budget: data.lifetime_budget,
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
        targeting_spec: data.targeting_spec,
        creative_spec: data.creative_spec,
        opening_message: data.opening_message,
      });

      // Optionally publish — flips campaign + adset + ad to ACTIVE.
      if (data.publish) {
        try {
          await metaApi.updateCampaignStatus(metaCampaignId, "ACTIVE");
          await metaApi.updateAdSetStatus(metaAdsetId, "ACTIVE");
          await metaApi.updateAd(metaAdId, { status: "ACTIVE" });
          await this.campaignRepo.update(campaign.id, { status: "active" });
          campaign.status = "active";
        } catch (publishErr) {
          this.logger?.warn(
            { err: publishErr, campaignId: campaign.id },
            "[Ads] Campaign created but activation failed",
          );
          campaign._publishWarning =
            publishErr?.message ||
            "Campaign was saved as a draft. Open it in Meta Ads Manager to activate.";
        }
      }

      return campaign;
    } catch (err) {
      // Cleanup orphans on real-run failure (skip for validate_only).
      if (!dryRun && created.length > 0) {
        for (const obj of [...created].reverse()) {
          try {
            if (obj.kind === "ad") await metaApi.deleteAd(obj.id);
            else if (obj.kind === "creative") await metaApi._request("DELETE", `/${obj.id}`);
            else if (obj.kind === "adset") await metaApi._request("DELETE", `/${obj.id}`);
            else if (obj.kind === "campaign") await metaApi._request("DELETE", `/${obj.id}`);
            this.logger?.info({ kind: obj.kind, id: obj.id }, "[Ads] Cleanup deleted orphan");
          } catch (cleanupErr) {
            this.logger?.error(
              { kind: obj.kind, id: obj.id, err: cleanupErr.message },
              "[Ads] Cleanup failed for orphan — manual deletion required",
            );
          }
        }
      }
      // Tag with the failed step so the wizard's review screen can show it.
      // We forward Meta's user-facing fields verbatim so the controller can
      // surface "Budget is too low: must be more than ₹93.36" instead of
      // the useless top-level "Invalid parameter".
      const failedStep = validatedSteps.length < 4 ? ["campaign","adset","creative","ad"][validatedSteps.length] : "publish";
      throw {
        code: err?.code || 500,
        message: err?.message || "Failed to create campaign",
        metaErrorCode: err?.metaErrorCode,
        metaErrorSubcode: err?.metaErrorSubcode,
        metaErrorUserTitle: err?.metaErrorUserTitle,
        metaErrorUserMsg: err?.metaErrorUserMsg,
        metaErrorFbtraceId: err?.metaErrorFbtraceId,
        field: err?.field,
        step: failedStep,
      };
    }
  }

  // Public dry-run: same machinery as createCampaign but with validate_only
  // on every Meta call. Always returns 200 with {ok: bool} — even on
  // Meta-side rejection (a successful "validation says no" is still a
  // successful API call).
  async validateCampaign(organizationId, data) {
    if (!data || !data.objective) {
      return {
        ok: false,
        step: "preflight",
        error: { code: 400, user_message: "Objective is required to validate." },
      };
    }
    if (!AdsService.NEW_OBJECTIVES.has(data.objective)) {
      return {
        ok: false,
        step: "preflight",
        error: { code: 400, user_message: `Validation is only supported for new objectives. Got ${data.objective}.` },
      };
    }
    try {
      const result = await this._createCampaignForObjective(organizationId, data, { dryRun: true });
      return {
        ok: true,
        validated: result.validated || ["campaign"],
        ...(result.note ? { note: result.note } : {}),
      };
    } catch (err) {
      // Prefer Meta's `error_user_msg` (with title prefix) over the bland
      // top-level "Invalid parameter". `err.message` is already composed
      // that way by MetaAdsApiService._request.
      return {
        ok: false,
        step: err?.step || "preflight",
        error: {
          code: err?.metaErrorCode || err?.code || 500,
          user_message: err?.metaErrorUserMsg || err?.message || "Validation failed",
          title: err?.metaErrorUserTitle,
          field: err?.field,
          fbtrace_id: err?.metaErrorFbtraceId,
        },
      };
    }
  }

  // === LEAD FORMS ===

  // POST /{page-id}/leadgen_forms — uses the page access token, so the
  // user must have selected a page during connect (page_access_token saved).
  async createLeadForm(organizationId, input) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };
    if (!account.page_id) throw { code: 400, message: "No Facebook Page selected" };
    if (!account.page_access_token_encrypted) {
      throw {
        code: 400,
        message: "No Page access token on file. Reconnect Meta to grant pages_manage_ads.",
      };
    }
    const pageToken = decryptToken(account.page_access_token_encrypted);
    const pageApi = new MetaAdsApiService(pageToken, this.logger);

    const payload = {
      name: input.name,
      locale: input.locale || "en_US",
      questions: JSON.stringify(input.questions || []),
      privacy_policy: JSON.stringify(input.privacy_policy || {}),
    };
    if (input.follow_up_action_url) payload.follow_up_action_url = input.follow_up_action_url;
    if (input.thank_you_page) payload.thank_you_page = JSON.stringify(input.thank_you_page);
    if (input.context_card) payload.context_card = JSON.stringify(input.context_card);

    const created = await pageApi.createLeadGenForm(account.page_id, payload);
    // Read it back to surface name/status/questions in one round-trip
    try {
      return await pageApi.getLeadGenForm(created.id);
    } catch {
      return created;
    }
  }

  // === CATALOGS ===

  async createProductCatalog(organizationId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const catalogName = data.name || "Product Catalog";
    const vertical = data.vertical || "commerce";

    // Try business-level creation first if business_id provided
    if (data.business_id) {
      try {
        return await metaApi.createProductCatalog(data.business_id, catalogName, vertical);
      } catch (err) {
        this.logger?.warn({ err }, "Business-level catalog creation failed, trying ad account level");
      }
    }

    // Fall back to ad-account-level creation
    return metaApi.createProductCatalogForAdAccount(account.ad_account_id, catalogName, vertical);
  }

  async addProductToCatalog(organizationId, catalogId, product) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.addProductToCatalog(catalogId, product);
  }

  async getProductCatalogs(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Try ad account level first
    try {
      const result = await metaApi.getProductCatalogs(account.ad_account_id);
      if (result.data && result.data.length > 0) return result.data;
    } catch (err) {
      this.logger?.warn({ err }, "Ad account catalog fetch failed, trying business level");
    }

    // Fall back to business-level catalogs
    try {
      const bizResp = await metaApi.getBusinesses();
      const businesses = bizResp.data || [];
      for (const biz of businesses) {
        const catResp = await metaApi._request("GET", `/${biz.id}/owned_product_catalogs`, {
          fields: "id,name,product_count,vertical",
          limit: 50,
        });
        if (catResp.data && catResp.data.length > 0) return catResp.data;
      }
    } catch (err) {
      this.logger?.warn({ err }, "Business-level catalog fetch also failed");
    }

    return [];
  }

  async getCatalogProductSets(organizationId, catalogId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const result = await metaApi.getCatalogProductSets(catalogId);
    return result.data || [];
  }

  async getCatalogProducts(organizationId, catalogId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const result = await metaApi.getCatalogProducts(catalogId);
    return result.data || [];
  }

  async getCampaigns(organizationId, filters = {}) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) {
      // Not connected → no campaigns visible. Return empty page rather than
      // throwing so the UI can render the "Connect Meta" empty state.
      return { items: [], totalCount: 0, page: filters.page || 1, limit: filters.limit || 50 };
    }

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const limit = Math.min(filters.limit || 50, 100);

    let metaResp;
    try {
      metaResp = await metaApi.getCampaigns(account.ad_account_id, { limit });
    } catch (err) {
      this.logger?.warn(
        { err: err.message, account_id: account.ad_account_id },
        "[Ads] Meta getCampaigns failed — falling back to local mirror table",
      );
      // Best-effort fallback: surface whatever we have locally so the UI
      // isn't completely blank if Meta is unavailable / rate-limited.
      return this.campaignRepo.findAll(organizationId, filters);
    }

    const metaItems = Array.isArray(metaResp?.data) ? metaResp.data : [];

    // Index our local rows by meta_campaign_id so we can enrich Meta's
    // payload with anything we know locally (our internal id, opening_message,
    // mirrored objective, etc.).
    const local = await this.campaignRepo.findAll(organizationId, { limit: 1000 });
    const byMetaId = new Map();
    for (const row of local.items || []) {
      if (row.meta_campaign_id) byMetaId.set(String(row.meta_campaign_id), row);
    }

    const items = metaItems.map((m) => {
      const localRow = byMetaId.get(String(m.id)) || null;
      // Meta returns daily_budget / lifetime_budget as strings in account
      // currency *minor* units (e.g. "9300" = ₹93.00). Convert to major units
      // so the UI can format with currency() directly.
      const dailyMinor = m.daily_budget ? Number(m.daily_budget) : null;
      const lifetimeMinor = m.lifetime_budget ? Number(m.lifetime_budget) : null;
      return {
        // Use the Meta campaign id as the primary key when no local row exists.
        id: localRow?.id || m.id,
        organization_id: organizationId,
        ad_account_id: account.ad_account_id,
        meta_campaign_id: m.id,
        meta_adset_id: localRow?.meta_adset_id || null,
        meta_creative_id: localRow?.meta_creative_id || null,
        meta_ad_id: localRow?.meta_ad_id || null,
        name: m.name,
        // Map Meta's UPPERCASE status to our lowercase enum where relevant.
        status: (m.status || "").toLowerCase() || "paused",
        effective_status: m.effective_status || m.status,
        objective: localRow?.objective || m.objective,
        campaign_type: localRow?.campaign_type || null,
        daily_budget: dailyMinor !== null ? dailyMinor / 100 : null,
        lifetime_budget: lifetimeMinor !== null ? lifetimeMinor / 100 : null,
        start_date: m.start_time || null,
        end_date: m.stop_time || null,
        special_ad_categories: m.special_ad_categories || null,
        insights: m.insights?.data?.[0] || null,
        created_at: m.created_time || localRow?.created_at || new Date().toISOString(),
        updated_at: m.updated_time || localRow?.updated_at || new Date().toISOString(),
      };
    });

    // Apply client-side filters that Meta's /campaigns endpoint doesn't
    // expose directly via fields=... query. (Meta has its own filtering
    // syntax but it's brittle — this is good enough for the list view.)
    let filtered = items;
    if (filters.status && filters.status !== "all") {
      const target = String(filters.status).toLowerCase();
      filtered = filtered.filter((c) => c.status.toLowerCase() === target);
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      filtered = filtered.filter((c) => c.name?.toLowerCase().includes(q));
    }

    return {
      items: filtered,
      totalCount: filtered.length,
      page: filters.page || 1,
      limit,
    };
  }

  async getCampaign(id, organizationId) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) return null;
    return campaign;
  }

  async updateCampaign(id, organizationId, data) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Update status on Meta if changed
    if (data.status && data.status !== campaign.status) {
      const metaStatus = data.status === "active" ? "ACTIVE" : "PAUSED";
      if (campaign.meta_campaign_id) {
        await metaApi.updateCampaignStatus(campaign.meta_campaign_id, metaStatus);
      }
      if (campaign.meta_adset_id) {
        await metaApi.updateAdSetStatus(campaign.meta_adset_id, metaStatus);
      }
      if (campaign.meta_ad_id) {
        await metaApi.updateAd(campaign.meta_ad_id, { status: metaStatus });
      }
    }

    // Update budget on Meta if changed
    if (data.daily_budget && data.daily_budget !== campaign.daily_budget) {
      if (campaign.meta_adset_id) {
        await metaApi.updateAdSet(campaign.meta_adset_id, {
          daily_budget: Math.round(data.daily_budget * 100),
        });
      }
    }

    const updateData = {};
    if (data.name) updateData.name = data.name;
    if (data.status) updateData.status = data.status;
    if (data.daily_budget) updateData.daily_budget = data.daily_budget;
    if (data.end_date) updateData.end_date = new Date(data.end_date);

    return this.campaignRepo.update(id, updateData);
  }

  async deleteCampaign(id, organizationId) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (account && campaign.meta_ad_id) {
      try {
        const metaApi = this._getMetaApi(account.access_token_encrypted);
        await metaApi.deleteAd(campaign.meta_ad_id);
      } catch (err) {
        this.logger?.warn({ err: err.message }, "Failed to delete ad on Meta");
      }
    }

    await this.campaignRepo.delete(id);
  }

  async duplicateCampaign(id, organizationId) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    return this.createCampaign(organizationId, {
      name: `${campaign.name} (Copy)`,
      objective: campaign.objective,
      campaign_type: campaign.campaign_type,
      daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) : undefined,
      lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) : undefined,
      start_date: new Date().toISOString(),
      end_date: campaign.end_date,
      flow_id: campaign.flow_id,
      targeting_spec: campaign.targeting_spec,
      placement_spec: campaign.placement_spec,
      creative_spec: campaign.creative_spec,
      opening_message: campaign.opening_message,
      business_account_id: campaign.business_account_id,
    });
  }

  async syncCampaign(id, organizationId) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    if (!campaign.meta_campaign_id) return campaign;

    // Fetch insights
    const insightsResp = await metaApi.getCampaignInsights(campaign.meta_campaign_id, {
      time_increment: 1,
      date_preset: "maximum",
    });

    if (insightsResp.data) {
      for (const row of insightsResp.data) {
        const conversationsStarted =
          row.actions?.find((a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")
            ?.value || 0;
        const newContacts =
          row.actions?.find((a) => a.action_type === "onsite_conversion.messaging_first_reply")
            ?.value || 0;

        await this.insightsRepo.upsert({
          meta_campaign_id: campaign.meta_campaign_id,
          meta_ad_id: campaign.meta_ad_id,
          date: new Date(row.date_start),
          spend: parseFloat(row.spend || 0),
          impressions: parseInt(row.impressions || 0),
          reach: parseInt(row.reach || 0),
          clicks: parseInt(row.clicks || 0),
          unique_clicks: parseInt(row.unique_clicks || 0),
          ctr: parseFloat(row.ctr || 0),
          cpc: parseFloat(row.cpc || 0),
          messaging_conversations_started: parseInt(conversationsStarted),
          new_messaging_contacts: parseInt(newContacts),
          quality_ranking: row.quality_ranking || "UNKNOWN",
          engagement_rate_ranking: row.engagement_rate_ranking || "UNKNOWN",
        });
      }
    }

    return this.campaignRepo.findById(id);
  }

  // === INSIGHTS ===

  async getCampaignInsights(id, organizationId, startDate, endDate) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    const [aggregated, rankings, leadCounts] = await Promise.all([
      this.insightsRepo.getAggregated(campaign.meta_campaign_id, startDate, endDate),
      this.insightsRepo.getLatestRankings(campaign.meta_campaign_id),
      this.conversationRepo.getCountByCampaign(id),
    ]);

    // Get CTWA conversion revenue
    const ctwaConvs = await this.conversationRepo.findByCampaign(id, { startDate, endDate });
    const ctwaConvIds = ctwaConvs.map((c) => c.id);
    const revenue = await this.conversionRepo.getRevenueByCampaignConversations(ctwaConvIds);

    const totalSpend = parseFloat(aggregated.total_spend);
    const roas = totalSpend > 0 ? parseFloat(revenue.total_revenue) / totalSpend : 0;

    return {
      ...aggregated,
      ...rankings,
      leads: leadCounts,
      revenue: {
        ...revenue,
        roas: roas.toFixed(2),
        conv_rate:
          leadCounts?.total > 0
            ? ((Number(revenue.total_orders) / Number(leadCounts.total)) * 100).toFixed(2)
            : "0.00",
      },
      campaign,
    };
  }

  async getLeadsChart(id, organizationId, startDate, endDate) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw { code: 404, message: "Campaign not found" };
    }

    return this.conversationRepo.getLeadsChartData(id, startDate, endDate);
  }

  // === SEARCH ===

  async searchInterests(organizationId, query) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };
    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.searchInterests(query);
  }

  async searchLocations(organizationId, query) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };
    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.searchLocations(query);
  }

  // === AUDIENCES ===

  async getAudiences(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) return { data: [] };
    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.listCustomAudiences(account.ad_account_id);
  }

  async createCustomAudience(organizationId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    const audience = await metaApi.createCustomAudience(account.ad_account_id, {
      name: data.name,
      description: data.description,
    });

    // Upload user data if provided directly
    let users = data.users || [];

    // If contact_ids provided, look up contacts and extract phone/email
    if (!users.length && data.contact_ids?.length && this.contactRepo) {
      const contacts = await this.contactRepo.findByIds(data.contact_ids);
      users = contacts.map((c) => ({ phone: c.phoneNumber, email: c.email }));
    }

    if (users.length) {
      const hashedData = users
        .filter((u) => u.phone || u.email)
        .map((u) => [
          u.phone ? this.capiService.hashPhone(u.phone) : "",
          u.email ? this.capiService.hashEmail(u.email) : "",
        ]);

      if (hashedData.length) {
        await metaApi.uploadAudienceUsers(audience.id, ["PHONE", "EMAIL"], hashedData);
      }
    }

    return audience;
  }

  async createLookalikeAudience(organizationId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };
    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.createLookalikeAudience(account.ad_account_id, data);
  }

  // === AUDIENCE PRESETS ===

  async getAudiencePresets(organizationId) {
    return this.audiencePresetRepo?.findByOrganizationId(organizationId) || [];
  }

  async saveAudiencePreset(organizationId, data) {
    return this.audiencePresetRepo?.create({
      organization_id: organizationId,
      name: data.name,
      targeting_spec: data.targeting_spec,
      description: data.description,
    });
  }

  // === FLOWS ===

  async getFlows(organizationId) {
    if (!this.businessAccountRepo || !this.automationFlowRepo) return [];

    const { data: businessAccounts } = await this.businessAccountRepo.findAll({
      organizationId,
      pagination: { limit: 100 },
    });

    if (!businessAccounts?.length) return [];

    const flows = [];
    for (const ba of businessAccounts) {
      const baFlows = await this.automationFlowRepo.findByBusinessAccountId(ba.id);
      flows.push(...baFlows);
    }

    return flows.map((f) => ({ id: f.id, name: f.name, status: f.status, is_active: f.is_active }));
  }

  // === CTWA WEBHOOK ===

  async handleCTWAReferral(referralData, contactId, conversationId) {
    const campaign = referralData.meta_ad_id
      ? await this.campaignRepo.findByMetaAdId(
          referralData.meta_ad_id,
          referralData.organization_id
        )
      : null;

    const ctwaConv = await this.conversationRepo.create({
      organization_id: referralData.organization_id,
      campaign_id: campaign?.id || null,
      meta_ad_id: referralData.meta_ad_id,
      contact_id: contactId,
      conversation_id: conversationId,
      ctwa_clid: referralData.ctwa_clid,
      referral_source: referralData.referral_source,
      referral_headline: referralData.referral_headline,
      referral_body: referralData.referral_body,
      referral_image_url: referralData.referral_image_url,
      source_url: referralData.source_url,
      is_new_contact: referralData.is_new_contact || false,
    });

    // Send CAPI event if pixel configured
    if (campaign && referralData.ctwa_clid) {
      const account = await this.metaAdAccountRepo.findActiveByOrganizationId(
        referralData.organization_id
      );
      if (account?.pixel_id) {
        const token = decryptToken(account.access_token_encrypted);
        const eventId = uuidv4();
        const result = await this.capiService.sendEvent(account.pixel_id, token, {
          eventName: "Lead",
          eventId,
          ctwaClid: referralData.ctwa_clid,
          userData: { phone: referralData.phone },
        });

        await this.conversionRepo.create({
          ctwa_conversation_id: ctwaConv.id,
          event_type: "Lead",
          meta_event_id: eventId,
          sent_to_meta: result.success,
          sent_at: result.success ? new Date() : null,
          meta_response: result,
        });
      }
    }

    return {
      ctwaConversation: ctwaConv,
      flowId: campaign?.flow_id || null,
    };
  }

  // === FETCH ADS FROM META ===

  async fetchAdsFromMeta(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Fetch campaigns, adsets, and ads in parallel
    const [campaignsResp, adsetsResp, adsResp] = await Promise.all([
      metaApi.getCampaigns(account.ad_account_id),
      metaApi.getAdSets(account.ad_account_id),
      metaApi.getAds(account.ad_account_id),
    ]);

    const campaigns = campaignsResp.data || [];
    const adsets = adsetsResp.data || [];
    const ads = adsResp.data || [];

    // Count active/paused
    const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE").length;
    const pausedCampaigns = campaigns.filter(c => c.status === "PAUSED").length;
    const activeAds = ads.filter(a => a.status === "ACTIVE").length;
    const pausedAds = ads.filter(a => a.status === "PAUSED").length;

    // Message-related action types to check
    const messageActionTypes = [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "messaging_conversation_started_7d",
      "contact_total",
      "lead",
    ];

    // Aggregate totals from ad-level insights
    let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0, totalUniqueClicks = 0, totalMessages = 0;
    for (const ad of ads) {
      const ins = ad.insights?.data?.[0];
      if (ins) {
        totalSpend += Number(ins.spend || 0);
        totalImpressions += Number(ins.impressions || 0);
        totalReach += Number(ins.reach || 0);
        totalClicks += Number(ins.clicks || 0);
        totalUniqueClicks += Number(ins.unique_clicks || 0);
        // Find messages from any matching action type
        let adMessages = 0;
        for (const actionType of messageActionTypes) {
          const action = ins.actions?.find(a => a.action_type === actionType);
          if (action) {
            adMessages = Math.max(adMessages, Number(action.value || 0));
          }
        }
        totalMessages += adMessages;

        // Log action types for first ad (for debugging)
        if (ads.indexOf(ad) === 0 && ins.actions) {
          this.logger?.info({ actions: ins.actions.map(a => ({ type: a.action_type, value: a.value })) }, "Meta ad action types sample");
        }
      }
    }

    return {
      campaigns,
      adsets,
      ads,
      summary: {
        total_campaigns: campaigns.length,
        active_campaigns: activeCampaigns,
        paused_campaigns: pausedCampaigns,
        total_adsets: adsets.length,
        total_ads: ads.length,
        active_ads: activeAds,
        paused_ads: pausedAds,
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_reach: totalReach,
        total_clicks: totalClicks,
        total_unique_clicks: totalUniqueClicks,
        total_messages: totalMessages,
        avg_ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0,
        avg_cpc: totalClicks > 0 ? (totalSpend / totalClicks) : 0,
        cost_per_result: totalMessages > 0 ? (totalSpend / totalMessages) : 0,
      },
      account: {
        ad_account_id: account.ad_account_id,
        page_id: account.page_id,
        page_name: account.page_name,
      },
    };
  }

  // Return all ad accounts connected to the org — used by the frontend to
  // populate an account-switcher dropdown.
  async listAdAccounts(organizationId) {
    const rows = await this.metaAdAccountRepo.findByOrganizationId(organizationId);
    return (rows || []).map((a) => ({
      ad_account_id: a.ad_account_id,
      ad_account_name: a.ad_account_name,
      page_id: a.page_id,
      page_name: a.page_name,
      currency: a.currency,
      status: a.status,
    }));
  }

  // === INSTAGRAM AD INSIGHTS ===

  /**
   * Fetch Instagram-only ad performance for the org's active ad account.
   * Returns the same { campaigns, adsets, ads, summary, account } shape as
   * fetchAdsFromMeta, but every `ad.insights` is replaced with the Instagram
   * slice and `summary` is aggregated across Instagram-only insights.
   *
   * @param {string} organizationId
   * @param {object} opts
   * @param {string} [opts.date_preset]  e.g. "last_7d", "last_30d", "last_90d"
   * @param {string} [opts.start_date]   ISO date (mutually exclusive with date_preset)
   * @param {string} [opts.end_date]     ISO date (mutually exclusive with date_preset)
   */
  async getInstagramDashboard(organizationId, opts = {}) {
    // If ad_account_id is specified, pick that one (must belong to the org);
    // otherwise fall back to the first active account.
    let account;
    if (opts.ad_account_id) {
      const candidates = await this.metaAdAccountRepo.findByOrganizationId(organizationId);
      account = (candidates || []).find(
        (a) => a.ad_account_id === opts.ad_account_id && a.status === "active",
      );
      if (!account) throw { code: 404, message: "Ad account not found for this org", errorCode: "AD_ACCOUNT_NOT_FOUND" };
    } else {
      account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
      if (!account) throw { code: 404, message: "No ad account connected", errorCode: "NO_AD_ACCOUNT" };
    }

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Build insights params (date range or preset)
    const insightParams = {};
    if (opts.start_date && opts.end_date) {
      insightParams.time_range = { since: opts.start_date, until: opts.end_date };
    } else if (opts.date_preset) {
      insightParams.date_preset = opts.date_preset;
    } else {
      insightParams.date_preset = "last_30d";
    }

    // Fetch structure + Instagram insights in parallel
    let campaignsResp, adsetsResp, adsResp, igInsightsResp;
    try {
      [campaignsResp, adsetsResp, adsResp, igInsightsResp] = await Promise.all([
        metaApi.getCampaigns(account.ad_account_id),
        metaApi.getAdSets(account.ad_account_id),
        metaApi.getAds(account.ad_account_id),
        metaApi.getInstagramAdInsights(account.ad_account_id, insightParams),
      ]);
    } catch (error) {
      // Translate Meta API errors into HTTP-codeable errors the controller can map
      if (error?.code === 401 || error?.metaErrorCode === 190) {
        throw { code: 401, message: "Meta access token expired or revoked", errorCode: "ACCOUNT_NOT_CONNECTED" };
      }
      if (error?.code === 429 || error?.metaErrorCode === 17 || error?.metaErrorCode === 80004 || error?.metaErrorCode === 4) {
        throw { code: 429, message: "Meta API rate limit reached", errorCode: "RATE_LIMITED" };
      }
      throw { code: 502, message: error?.message || "Meta API request failed", errorCode: "META_API_ERROR" };
    }

    const allCampaigns = campaignsResp?.data || [];
    const allAdsets = adsetsResp?.data || [];
    const allAds = adsResp?.data || [];
    const igRows = igInsightsResp?.data || [];

    // Index Instagram insights by ad_id
    const insightsByAdId = new Map();
    for (const row of igRows) {
      if (row.ad_id) insightsByAdId.set(String(row.ad_id), row);
    }

    // Determine the effective date range for the request so we can also filter
    // ads by their *creation* date (the user's mental model of "Yesterday" on
    // the Promoted Posts tab is "posts I promoted yesterday", not "ads that
    // happened to deliver an impression yesterday"). Source priority:
    //   1. Custom time_range the controller sent through.
    //   2. Meta's own date_start/date_stop on the insights rows — this reflects
    //      the ad account's timezone, which we don't otherwise know.
    //   3. A UTC fallback computed from the preset (only matters when no
    //      insights came back at all, which is also when no ads pass the
    //      `insightsByAdId.has` filter — so the fallback is rarely exercised).
    let creationRange = null;
    if (insightParams.time_range) {
      creationRange = {
        start: insightParams.time_range.since,
        end: insightParams.time_range.until,
      };
    } else if (igRows.length > 0 && igRows[0].date_start && igRows[0].date_stop) {
      creationRange = { start: igRows[0].date_start, end: igRows[0].date_stop };
    } else if (insightParams.date_preset && insightParams.date_preset !== "maximum") {
      creationRange = AdsService._computePresetRangeUTC(insightParams.date_preset);
    }

    const adInCreationRange = (ad) => {
      if (!creationRange) return true;
      const created = ad.created_time ? new Date(ad.created_time).getTime() : NaN;
      // If Meta didn't return a created_time we can't filter — include rather
      // than hide. The bug we're fixing is *known* old created_times leaking
      // through the Yesterday filter, not unknown ones.
      if (!Number.isFinite(created)) return true;
      const startMs = new Date(`${creationRange.start}T00:00:00Z`).getTime();
      const endMs = new Date(`${creationRange.end}T23:59:59.999Z`).getTime();
      return created >= startMs && created <= endMs;
    };

    // Only keep ads that:
    //   (a) have Instagram-platform insights (so this is genuinely an
    //       Instagram-delivered ad, not a Facebook-only one), AND
    //   (b) were created within the active date range (so "Yesterday" doesn't
    //       leak through ads created weeks ago that just happen to still run).
    const adsWithIgInsights = allAds
      .filter((ad) => insightsByAdId.has(String(ad.id)))
      .filter(adInCreationRange)
      .map((ad) => {
        const ig = insightsByAdId.get(String(ad.id));
        return { ...ad, insights: { data: [ig] } };
      });

    // Enrich ads with full-resolution creative images.
    // Strategy 1: Fetch each adcreative separately to get image_url (most reliable).
    // Strategy 2: Fall back to IG media endpoint for source_instagram_media_id.
    // The creative.thumbnail_url from the inline ad response is always low-res/blurry.
    try {
      const creativeIds = adsWithIgInsights
        .map((ad) => ad.creative?.id)
        .filter(Boolean);
      const uniqueCreativeIds = [...new Set(creativeIds)];

      if (uniqueCreativeIds.length > 0) {
        const CHUNK = 10;
        const creativeMap = new Map();
        for (let i = 0; i < uniqueCreativeIds.length; i += CHUNK) {
          const chunk = uniqueCreativeIds.slice(i, i + CHUNK);
          const results = await Promise.allSettled(
            chunk.map((id) =>
              metaApi._request("GET", `/${id}`, {
                fields: "id,image_url,thumbnail_url,object_story_spec,effective_instagram_media_id,source_instagram_media_id",
              })
            )
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value?.id) {
              creativeMap.set(String(r.value.id), r.value);
            }
          }
        }

        for (const ad of adsWithIgInsights) {
          if (!ad.creative?.id) continue;
          const enriched = creativeMap.get(String(ad.creative.id));
          if (!enriched) continue;

          // Merge the full-res image_url from the dedicated creative fetch
          const fullImageUrl = enriched.image_url || null;
          const storySpec = enriched.object_story_spec || {};
          const linkPicture = storySpec.link_data?.picture || storySpec.link_data?.image_url || null;
          const videoPoster = storySpec.video_data?.image_url || null;

          ad.creative._ig_media_url = fullImageUrl || linkPicture || videoPoster || null;
          ad.creative._ig_media_type = storySpec.video_data ? "VIDEO" : "IMAGE";

          // Also backfill source_instagram_media_id if missing
          if (!ad.creative.source_instagram_media_id && enriched.source_instagram_media_id) {
            ad.creative.source_instagram_media_id = enriched.source_instagram_media_id;
          }
          if (!ad.creative.effective_instagram_media_id && enriched.effective_instagram_media_id) {
            ad.creative.effective_instagram_media_id = enriched.effective_instagram_media_id;
          }
        }
      }
    } catch (enrichErr) {
      // Non-fatal — ads still display with the low-res fallback
      this.logger?.warn?.({ msg: "Failed to enrich ad creatives", error: enrichErr?.message });
    }

    // Narrow adsets + campaigns to only those referenced by the Instagram ads.
    const igAdsetIds = new Set(
      adsWithIgInsights.map((ad) => String(ad.adset_id || ad.adset?.id)).filter(Boolean)
    );
    const igCampaignIds = new Set(
      adsWithIgInsights.map((ad) => String(ad.campaign_id || ad.campaign?.id)).filter(Boolean)
    );
    const adsets = allAdsets.filter((as) => igAdsetIds.has(String(as.id)));
    const campaigns = allCampaigns.filter((c) => igCampaignIds.has(String(c.id)));

    // Aggregate Instagram-only summary
    const messageActionTypes = [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "messaging_conversation_started_7d",
      "contact_total",
      "lead",
      "leadgen.other",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ];

    // Aggregate over the ads we kept (date-filtered). Iterating raw `igRows`
    // would double-count ads excluded by the creation-date filter and inflate
    // the summary cards relative to what's rendered in the grid.
    let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0, totalUniqueClicks = 0, totalMessages = 0;
    for (const ad of adsWithIgInsights) {
      const row = ad.insights?.data?.[0];
      if (!row) continue;
      totalSpend += Number(row.spend || 0);
      totalImpressions += Number(row.impressions || 0);
      totalReach += Number(row.reach || 0);
      totalClicks += Number(row.clicks || 0);
      totalUniqueClicks += Number(row.unique_clicks || 0);
      let rowMessages = 0;
      for (const type of messageActionTypes) {
        const action = row.actions?.find((a) => a.action_type === type);
        if (action) rowMessages = Math.max(rowMessages, Number(action.value || 0));
      }
      totalMessages += rowMessages;
    }

    // Active/paused are counted from campaign structure — they're account-level,
    // not platform-specific. Meta doesn't offer per-platform status.
    const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
    const pausedCampaigns = campaigns.filter((c) => c.status === "PAUSED").length;
    const activeAds = adsWithIgInsights.filter((a) => a.status === "ACTIVE").length;
    const pausedAds = adsWithIgInsights.filter((a) => a.status === "PAUSED").length;

    return {
      campaigns,
      adsets,
      ads: adsWithIgInsights,
      summary: {
        total_campaigns: campaigns.length,
        active_campaigns: activeCampaigns,
        paused_campaigns: pausedCampaigns,
        total_adsets: adsets.length,
        total_ads: adsWithIgInsights.length,
        active_ads: activeAds,
        paused_ads: pausedAds,
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_reach: totalReach,
        total_clicks: totalClicks,
        total_unique_clicks: totalUniqueClicks,
        total_messages: totalMessages,
        avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        cost_per_result: totalMessages > 0 ? totalSpend / totalMessages : 0,
      },
      account: {
        ad_account_id: account.ad_account_id,
        page_id: account.page_id,
        page_name: account.page_name,
        currency: account.currency || "INR",
      },
      date_range: insightParams.time_range
        ? { start: insightParams.time_range.since, end: insightParams.time_range.until }
        : {
            preset: insightParams.date_preset,
            ...(creationRange ? { start: creationRange.start, end: creationRange.end } : {}),
          },
      platform: "instagram",
    };
  }

  /**
   * Compute a UTC YYYY-MM-DD range for a Meta `date_preset`. Used as a
   * fallback only — when Meta returns insights, we prefer its own
   * date_start/date_stop because that reflects the ad account's timezone
   * (which we don't otherwise track). Mirrors Meta's preset semantics
   * (last_Nd excludes today).
   */
  static _computePresetRangeUTC(preset, today = new Date()) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const fmt = (dt) => dt.toISOString().slice(0, 10);
    const shift = (days) => {
      const x = new Date(d.getTime());
      x.setUTCDate(x.getUTCDate() + days);
      return x;
    };

    switch (preset) {
      case "today":      return { start: fmt(d), end: fmt(d) };
      case "yesterday":  return { start: fmt(shift(-1)), end: fmt(shift(-1)) };
      case "last_3d":    return { start: fmt(shift(-3)), end: fmt(shift(-1)) };
      case "last_7d":    return { start: fmt(shift(-7)), end: fmt(shift(-1)) };
      case "last_14d":   return { start: fmt(shift(-14)), end: fmt(shift(-1)) };
      case "last_28d":   return { start: fmt(shift(-28)), end: fmt(shift(-1)) };
      case "last_30d":   return { start: fmt(shift(-30)), end: fmt(shift(-1)) };
      case "last_90d":   return { start: fmt(shift(-90)), end: fmt(shift(-1)) };
      case "this_month": {
        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        return { start: fmt(start), end: fmt(d) };
      }
      case "last_month": {
        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
        return { start: fmt(start), end: fmt(end) };
      }
      case "this_quarter": {
        const q = Math.floor(d.getUTCMonth() / 3);
        const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
        return { start: fmt(start), end: fmt(d) };
      }
      default: return null; // "maximum" or unknown — no client-side filter
    }
  }

  // === META AD ACTIONS ===

  async updateMetaAd(organizationId, metaAdId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.updateAd(metaAdId, data);
  }

  async updateMetaCampaignStatus(organizationId, metaCampaignId, status) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.updateCampaignStatus(metaCampaignId, status);
  }

  async updateMetaAdSet(organizationId, metaAdSetId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.updateAdSetStatus(metaAdSetId, data.status);
  }

  // === IMAGE UPLOAD ===

  async uploadAdImage(organizationId, imageUrl) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    if (!imageUrl || typeof imageUrl !== "string") {
      throw { code: 400, message: "image_url is required" };
    }

    // Meta's URL-based /adimages endpoint requires the source domain to be
    // whitelisted on the app — most apps cannot use it and get
    // "(#3) Application does not have the capability to make this API call".
    // We fetch the URL ourselves and push the bytes via the multipart endpoint,
    // which works regardless of the source domain.

    // SSRF guard: only allow public http(s) hosts. Reject loopback / private /
    // link-local / metadata-service IPs to prevent us from being used as a
    // proxy into the host network (AWS IMDS, internal Redis, etc.).
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      throw { code: 400, message: "Invalid image URL" };
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw { code: 400, message: "image URL must be http(s)" };
    }
    if (_isPrivateOrLoopbackHostname(parsedUrl.hostname)) {
      throw { code: 400, message: "image URL host is not allowed" };
    }

    const axios = (await import("axios")).default;
    const MAX_BYTES = 10 * 1024 * 1024; // Meta accepts up to ~30MB; 10MB is safe and fast.

    let response;
    try {
      response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
        validateStatus: (s) => s >= 200 && s < 300,
        // Don't follow redirects to prevent SSRF bypass via 302 → internal IP.
        maxRedirects: 0,
      });
    } catch (err) {
      const status = err.response?.status;
      const detail = status ? `${status} ${err.response?.statusText || ""}`.trim() : err.message;
      throw { code: 400, message: `Could not fetch image from URL: ${detail}` };
    }

    const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw { code: 400, message: `URL did not return an image (content-type: ${contentType || "unknown"})` };
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > MAX_BYTES) {
      throw { code: 400, message: `Image exceeds ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit` };
    }

    let fileName = "image.jpg";
    try {
      const path = new URL(imageUrl).pathname;
      const lastSegment = path.split("/").filter(Boolean).pop();
      if (lastSegment && /\.(jpe?g|png|webp|gif)$/i.test(lastSegment)) fileName = lastSegment;
    } catch {
      // Bad URL — fall back to default filename. We already fetched it, so this is just cosmetic.
    }

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.uploadImageFile(account.ad_account_id, buffer, fileName);
  }

  async uploadAdImageFile(organizationId, fileBuffer, fileName) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    return metaApi.uploadImageFile(account.ad_account_id, fileBuffer, fileName);
  }

  // === AI AD GENERATION ===

  async generateAdCopy(organizationId, data) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw { code: 500, message: "OpenAI API key not configured" };

    const { business_name, business_type, product_name, product_description, target_audience, tone, language } = data;

    const prompt = `You are an expert Meta/Facebook ads copywriter. Generate compelling ad copy for a Click-to-WhatsApp ad campaign.

Business: ${business_name || "N/A"}
Industry: ${business_type || "N/A"}
Product/Service: ${product_name || "N/A"}
Description: ${product_description || "N/A"}
Target Audience: ${target_audience || "General"}
Tone: ${tone || "Professional and engaging"}
Language: ${language || "English"}

Generate 3 variations of ad copy. For each variation provide:
- primary_text: The main ad copy (max 125 chars for optimal, can go up to 2200)
- headline: Short attention-grabbing headline (max 40 chars)
- description: Supporting text below the headline (max 30 chars)
- cta_text: Suggested call-to-action text

Return ONLY valid JSON array with no markdown formatting:
[{"primary_text":"...","headline":"...","description":"...","cta_text":"..."},...]`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { code: 500, message: err.error?.message || "AI generation failed" };
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim();

    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      this.logger?.warn({ text }, "Failed to parse AI response");
      return [{ primary_text: text, headline: "", description: "", cta_text: "Send WhatsApp Message" }];
    }
  }

  // === AI: full campaign generation from a free-text prompt ===
  //
  // Asks OpenAI (see OPENAI_MODEL, default gpt-4o-mini) to draft a complete campaign config (objective, audience,
  // budget, creative copy + CTA, optional lead-form questions) from one
  // sentence-or-paragraph prompt. Uses OpenAI's response_format json_object
  // so we get back valid JSON without prose around it.
  //
  // The wizard then maps this onto its `WizardForm` shape and jumps straight
  // to the Review step. Media (image/video) is NOT generated — the user
  // uploads on Review before publishing.
  async generateCampaignFromPrompt(organizationId, { prompt }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw { code: 500, message: "OpenAI API key not configured" };
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      throw { code: 400, message: "Prompt must be at least 10 characters." };
    }

    // Pull account context so the model can pick a sane currency / locale.
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    const currency = account?.currency || "USD";
    const pageName = account?.page_name || null;
    const wabaLinked = Boolean(account?.waba_id);

    const systemPrompt = `You are an expert Meta Ads strategist. Convert a user's plain-English brief into a complete, production-ready Meta ad campaign configuration. Reply with VALID JSON ONLY matching the schema below — no prose, no markdown.

CONTEXT:
- Connected Page: ${pageName || "unknown"}
- Account currency: ${currency}
- WhatsApp linked to Page: ${wabaLinked ? "yes" : "no"} (only suggest CTWA objective when this is yes)

OBJECTIVE OPTIONS (pick exactly one):
- "WEBSITE_TRAFFIC" — drive clicks to a landing page (most common SMB choice)
- "LEAD_GEN" — collect leads via Meta's instant form
- "CTWA" — open WhatsApp conversation (only when WhatsApp linked = yes)

CTA OPTIONS by objective:
- WEBSITE_TRAFFIC: LEARN_MORE | SHOP_NOW | SIGN_UP | BOOK_NOW | DOWNLOAD | GET_OFFER | GET_QUOTE | CONTACT_US
- LEAD_GEN: SIGN_UP | LEARN_MORE | GET_QUOTE | APPLY_NOW | GET_OFFER | SUBSCRIBE
- CTWA: WHATSAPP_MESSAGE

BUDGET RULES:
- Use account currency (${currency}). Output amount as a number in MAJOR units (e.g. 100 = ₹100, not 10000 paise).
- For INR, daily minimum is usually around 100. For USD, around 5. For most accounts, 200 is a safe daily floor.
- Default to "daily" budget unless the user specifies a campaign run length.

OUTPUT JSON SCHEMA:
{
  "name": "Short descriptive campaign name (max 80 chars)",
  "objective": "WEBSITE_TRAFFIC|LEAD_GEN|CTWA",
  "audience": {
    "country_codes": ["IN", "US"],     // ISO-3166-1 alpha-2 codes; default ["IN"] if unsure
    "age_min": 18,                      // integer 13-65
    "age_max": 65,                      // integer 13-65, >= age_min
    "genders": "all|male|female",
    "interest_keywords": ["string"],    // free-text suggestions, user will look up in Meta later
    "advantage_audience": true,
    "special_ad_categories": ["NONE"]   // ["NONE"] OR one of: CREDIT, EMPLOYMENT, HOUSING, FINANCIAL_PRODUCTS_SERVICES, ISSUES_ELECTIONS_POLITICS, ONLINE_GAMBLING_AND_GAMING
  },
  "budget": {
    "type": "daily|lifetime",
    "amount": 200,                      // number in major currency units
    "start_date": null,                 // ISO 8601 string, or null for "start when published"
    "end_date": null                    // ISO 8601 string, or null. REQUIRED if type === "lifetime"
  },
  "creative": {
    "headline": "Max 40 chars",
    "primary_text": "Max 125 chars; the body of the ad",
    "description": "Max 30 chars; sub-headline",
    "cta_type": "LEARN_MORE",           // from CTA OPTIONS above, valid for the chosen objective
    "destination_url": "https://..."    // REQUIRED for WEBSITE_TRAFFIC; null for LEAD_GEN and CTWA
  },
  "lead_form_suggestion": {             // ONLY include this object when objective = LEAD_GEN
    "name": "Form name",
    "questions": [                      // pick 3-5 useful questions
      {"type": "FULL_NAME"},
      {"type": "EMAIL"},
      {"type": "PHONE"}
    ]
  },
  "rationale": "1-2 sentence explanation of why these choices fit the brief"
}

If the user mentions a website URL in their brief, use it for destination_url and lean toward WEBSITE_TRAFFIC.
If they mention 'WhatsApp' / 'chat' / 'message' AND WhatsApp is linked, choose CTWA.
If they mention 'leads' / 'enquiries' / 'sign-ups' / 'form', choose LEAD_GEN.
Otherwise choose WEBSITE_TRAFFIC.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      this.logger?.error({ err }, "[Ads.AI] OpenAI request failed");
      throw { code: 502, message: err.error?.message || "AI generation failed" };
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw { code: 502, message: "AI returned empty response." };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger?.warn({ text }, "[Ads.AI] Failed to parse JSON");
      throw { code: 502, message: "AI response was not valid JSON. Try rephrasing your brief." };
    }

    // Defensive normalization. The model is usually obedient but we don't
    // want a single malformed field to break the whole flow.
    const objective = ["WEBSITE_TRAFFIC", "LEAD_GEN", "CTWA"].includes(parsed.objective)
      ? parsed.objective
      : "WEBSITE_TRAFFIC";

    // Force CTWA → WEBSITE_TRAFFIC if no WABA is linked (model isn't always
    // disciplined about the constraint we put in the system prompt).
    const safeObjective = objective === "CTWA" && !wabaLinked ? "WEBSITE_TRAFFIC" : objective;

    const audience = parsed.audience || {};
    const budget = parsed.budget || {};
    const creative = parsed.creative || {};

    const normalized = {
      name: String(parsed.name || "AI campaign").slice(0, 80),
      objective: safeObjective,
      audience: {
        country_codes: Array.isArray(audience.country_codes) && audience.country_codes.length > 0
          ? audience.country_codes.map((c) => String(c).toUpperCase().slice(0, 2))
          : ["IN"],
        age_min: AdsService._clampInt(audience.age_min, 13, 65, 18),
        age_max: AdsService._clampInt(audience.age_max, 13, 65, 65),
        genders: ["all", "male", "female"].includes(audience.genders) ? audience.genders : "all",
        interest_keywords: Array.isArray(audience.interest_keywords)
          ? audience.interest_keywords.map(String).slice(0, 8)
          : [],
        advantage_audience: audience.advantage_audience !== false,
        special_ad_categories: Array.isArray(audience.special_ad_categories) && audience.special_ad_categories.length > 0
          ? audience.special_ad_categories
          : ["NONE"],
      },
      budget: {
        type: budget.type === "lifetime" ? "lifetime" : "daily",
        amount: typeof budget.amount === "number" && budget.amount > 0 ? budget.amount : 200,
        start_date: budget.start_date || null,
        end_date: budget.end_date || null,
      },
      creative: {
        headline: String(creative.headline || "").slice(0, 40),
        primary_text: String(creative.primary_text || "").slice(0, 125),
        description: String(creative.description || "").slice(0, 30),
        cta_type: String(creative.cta_type || "LEARN_MORE"),
        destination_url:
          safeObjective === "WEBSITE_TRAFFIC" ? (creative.destination_url || "") : null,
      },
      lead_form_suggestion:
        safeObjective === "LEAD_GEN" && parsed.lead_form_suggestion
          ? {
              name: String(parsed.lead_form_suggestion.name || "Leads").slice(0, 100),
              questions: Array.isArray(parsed.lead_form_suggestion.questions)
                ? parsed.lead_form_suggestion.questions.filter((q) => q && q.type)
                : [{ type: "FULL_NAME" }, { type: "EMAIL" }, { type: "PHONE" }],
            }
          : null,
      rationale: String(parsed.rationale || ""),
      account_currency: currency,
    };

    return normalized;
  }

  // === CAMPAIGN DETAIL (Ad Sets + Ads for a single campaign) ===

  async getMetaCampaignDetail(organizationId, metaCampaignId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    // Fetch campaign info, its adsets, and insights
    const [campaignResp, adsetsResp] = await Promise.all([
      metaApi._request("GET", `/${metaCampaignId}`, {
        fields: "name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,special_ad_categories,insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,frequency}",
      }),
      metaApi._request("GET", `/${metaCampaignId}/adsets`, {
        fields: "name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,promoted_object,optimization_goal,billing_event,insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,frequency}",
        limit: 100,
      }),
    ]);

    return {
      campaign: campaignResp,
      adsets: adsetsResp.data || [],
      account: { ad_account_id: account.ad_account_id, page_id: account.page_id, page_name: account.page_name },
    };
  }

  // === AD SET DETAIL (Ads for a single ad set) ===

  async getMetaAdSetDetail(organizationId, metaAdSetId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    const [adsetResp, adsResp] = await Promise.all([
      metaApi._request("GET", `/${metaAdSetId}`, {
        fields: "name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,promoted_object,optimization_goal,billing_event,campaign{name,objective,status,id},insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,frequency}",
      }),
      metaApi._request("GET", `/${metaAdSetId}/ads`, {
        fields: "name,status,creative{name,object_story_spec,thumbnail_url,image_url},insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,frequency,quality_ranking,engagement_rate_ranking}",
        limit: 100,
      }),
    ]);

    return {
      adset: adsetResp,
      ads: adsResp.data || [],
      account: { ad_account_id: account.ad_account_id, page_id: account.page_id, page_name: account.page_name },
    };
  }

  // === AD INSIGHTS WITH DATE RANGE ===

  async getMetaAdInsights(organizationId, metaAdId, params = {}) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    const insightParams = {
      fields: "spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,frequency,cpp",
      time_increment: 1,
    };

    if (params.start_date && params.end_date) {
      insightParams.time_range = JSON.stringify({
        since: params.start_date,
        until: params.end_date,
      });
    } else {
      insightParams.date_preset = params.date_preset || "last_30d";
    }

    const resp = await metaApi._request("GET", `/${metaAdId}/insights`, insightParams);
    return resp.data || [];
  }

  // === AI CAMPAIGN ASSISTANT ===

  async aiCampaignAssistant(organizationId, data) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw { code: 500, message: "OpenAI API key not configured" };

    const { question, context } = data;

    const prompt = `You are an expert Meta Ads Manager assistant for Click-to-WhatsApp (CTWA) campaigns. Answer the user's question based on the campaign data provided.

Campaign Context:
${JSON.stringify(context, null, 2)}

User Question: ${question}

Provide a concise, actionable answer. If recommending changes, be specific about what to change and why. Format numbers clearly. Use bullet points for multiple recommendations.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { code: 500, message: err.error?.message || "AI assistant failed" };
    }

    const result = await response.json();
    return { answer: result.choices?.[0]?.message?.content?.trim() };
  }

  // === FETCH AD DETAIL FROM META ===

  async getMetaAdDetail(organizationId, metaAdId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);

    const ad = await metaApi._request("GET", `/${metaAdId}`, {
      fields: "name,status,creative{name,object_story_spec,thumbnail_url,image_url,video_id,asset_feed_spec},adset{name,status,targeting,daily_budget,lifetime_budget,start_time,end_time,promoted_object,optimization_goal,billing_event},campaign{name,objective,status,daily_budget,lifetime_budget},insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,frequency,cpp}",
    });

    return { ad, account: { ad_account_id: account.ad_account_id, page_id: account.page_id, page_name: account.page_name } };
  }

  // === BUSINESS & FUNDING ===

  async getBusinesses(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const resp = await metaApi.getBusinesses();
    return resp.data || [];
  }

  async createAdAccountOnMeta(organizationId, data) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    if (!data.business_id) {
      throw { code: 400, message: "Business ID is required to create an ad account" };
    }

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const result = await metaApi.createAdAccountForBusiness(data.business_id, {
      name: data.name,
      currency: data.currency || "INR",
      timezone_id: data.timezone_id || 55,
    });

    return result;
  }

  async getFundingDetails(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getMetaApi(account.access_token_encrypted);
    const details = await metaApi.getAdAccountFundingSource(account.ad_account_id);

    return {
      balance: details.balance ? parseFloat(details.balance) / 100 : 0,
      currency: details.currency || account.currency,
      spend_cap: details.spend_cap ? parseFloat(details.spend_cap) / 100 : null,
      amount_spent: details.amount_spent ? parseFloat(details.amount_spent) / 100 : 0,
      min_daily_budget: details.min_daily_budget ? parseFloat(details.min_daily_budget) / 100 : 0,
      funding_source: details.funding_source_details || null,
      payment_cycle: details.adspaymentcycle?.data?.[0] || null,
      ad_account_id: account.ad_account_id,
      ad_account_name: account.ad_account_name,
    };
  }

  // === META LEADS ===

  async getLeadForms(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };
    if (!account.page_id) throw { code: 400, message: "No Facebook page connected" };

    const metaApi = this._getPageMetaApi(account);
    const resp = await metaApi.getLeadGenForms(account.page_id);
    return resp.data || [];
  }

  async getLeadFormLeads(organizationId, formId, limit = 50, after = null) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const metaApi = this._getPageMetaApi(account);
    const resp = await metaApi.getLeadFormLeads(formId, limit, after);
    return {
      leads: (resp.data || []).map((lead) => {
        const fields = {};
        (lead.field_data || []).forEach((f) => {
          fields[f.name] = f.values?.[0] || "";
        });
        return {
          id: lead.id,
          created_time: lead.created_time,
          ad_name: lead.ad_name || null,
          campaign_name: lead.campaign_name || null,
          adset_name: lead.adset_name || null,
          platform: lead.platform || null,
          fields,
        };
      }),
      paging: resp.paging || null,
    };
  }

  async syncMetaLeads(organizationId) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const { db, metaAdLeads } = await import("../db/index.js");
    const { eq } = await import("drizzle-orm");

    const userMetaApi = this._getMetaApi(account.access_token_encrypted);
    const pagesResp = await userMetaApi.getPages();
    const pages = pagesResp.data || [];

    let synced = 0;
    const allForms = [];

    for (const page of pages) {
      try {
        const pageMetaApi = new MetaAdsApiService(page.access_token, this.logger);

        // Best-effort: page may already be subscribed to leadgen; ignore the error.
        try { await pageMetaApi.subscribePageToLeadGen(page.id); } catch { /* already subscribed */ }

        const formsResp = await pageMetaApi.getLeadGenForms(page.id);
        const forms = formsResp.data || [];

        for (const form of forms) {
          allForms.push({ ...form, page_name: page.name, page_id: page.id });

          try {
            const formLeads = await pageMetaApi.getAllLeadFormLeads(form.id);
            for (const lead of formLeads) {
              const fields = {};
              (lead.field_data || []).forEach((f) => { fields[f.name] = f.values?.[0] || ""; });

              // Upsert — insert if not exists
              const existing = await db.select({ id: metaAdLeads.id }).from(metaAdLeads).where(eq(metaAdLeads.id, lead.id)).limit(1);
              if (!existing.length) {
                await db.insert(metaAdLeads).values({
                  id: lead.id,
                  organization_id: organizationId,
                  form_id: form.id,
                  form_name: form.name,
                  page_name: page.name,
                  ad_name: lead.ad_name || null,
                  campaign_name: lead.campaign_name || null,
                  adset_name: lead.adset_name || null,
                  platform: lead.platform || null,
                  fields: JSON.stringify(fields),
                  created_time: lead.created_time ? new Date(lead.created_time) : null,
                  synced_at: new Date(),
                });
                synced++;
              }
            }
          } catch (err) {
            this.logger?.warn({ err: err.message, formId: form.id }, "Failed to sync leads for form");
          }
        }
      } catch (err) {
        this.logger?.warn({ err: err.message, page_id: page.id }, "Failed to sync lead forms for page");
      }
    }

    this.logger?.info({ synced, pagesScanned: pages.length, formsFound: allForms.length }, "Meta leads sync complete");
    return { synced, forms: allForms };
  }

  async getAllPageLeads(organizationId, limit = 100, offset = 0) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) throw { code: 400, message: "No ad account connected" };

    const { db, metaAdLeads } = await import("../db/index.js");
    const { eq, desc, sql, and } = await import("drizzle-orm");

    // Check if we have cached leads
    const [{ count: cachedCount }] = await db.select({ count: sql`count(*)`.mapWith(Number) })
      .from(metaAdLeads)
      .where(eq(metaAdLeads.organization_id, organizationId));

    // If no cached leads, do initial sync
    if (cachedCount === 0) {
      await this.syncMetaLeads(organizationId);
    }

    // Query from DB with pagination
    const [{ count: total }] = await db.select({ count: sql`count(*)`.mapWith(Number) })
      .from(metaAdLeads)
      .where(eq(metaAdLeads.organization_id, organizationId));

    const leads = await db.select()
      .from(metaAdLeads)
      .where(eq(metaAdLeads.organization_id, organizationId))
      .orderBy(desc(metaAdLeads.created_time))
      .limit(limit)
      .offset(offset);

    // Parse fields JSON
    const parsedLeads = leads.map(l => ({
      ...l,
      fields: typeof l.fields === 'string' ? JSON.parse(l.fields) : (l.fields || {}),
    }));

    // Get unique forms
    const formsRows = await db.selectDistinct({
      form_id: metaAdLeads.form_id,
      form_name: metaAdLeads.form_name,
      page_name: metaAdLeads.page_name,
    }).from(metaAdLeads).where(eq(metaAdLeads.organization_id, organizationId));

    const forms = formsRows.map(f => ({ id: f.form_id, name: f.form_name, page_name: f.page_name }));

    return {
      leads: parsedLeads,
      forms,
      total,
      offset,
      limit,
      has_more: (offset + limit) < total,
      page_name: account.page_name,
    };
  }
}
