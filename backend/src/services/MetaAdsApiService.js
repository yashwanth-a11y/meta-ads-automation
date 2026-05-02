import axios from "axios";
import { config } from "../config/index.js";

const META_API_BASE = process.env.META_API_BASE_URL || "https://graph.facebook.com";
const META_API_VERSION = config.meta.apiVersion;

export class MetaAdsApiService {
  constructor(accessToken, logger) {
    this.accessToken = accessToken;
    this.logger = logger;
    this.baseUrl = `${META_API_BASE}/${META_API_VERSION}`;
  }

  async _request(method, endpoint, params = {}, retries = 3) {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const config = {
          method,
          url,
          headers: { Authorization: `Bearer ${this.accessToken}` },
          timeout: 30000,
        };

        if (method === "GET") {
          config.params = params;
        } else {
          // Meta Graph API expects form-encoded POST data
          const formData = new URLSearchParams();
          for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
              formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
            }
          }
          config.data = formData.toString();
          config.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }

        this.logger?.info({ method, endpoint, data: config.data, attempt }, "Meta API request");
        const response = await axios(config);
        const duration = Date.now() - startTime;
        this.logger?.info({ method, endpoint, duration, attempt }, "Meta API call");
        return response.data;
      } catch (error) {
        const status = error.response?.status;
        const metaError = error.response?.data?.error;
        const duration = Date.now() - startTime;

        this.logger?.warn(
          { method, endpoint, status, attempt, duration, metaErrorCode: metaError?.code, metaErrorMessage: metaError?.message, metaErrorType: metaError?.type, metaErrorSubcode: metaError?.error_subcode, metaErrorFbtraceId: metaError?.fbtrace_id, metaErrorUserTitle: metaError?.error_user_title, metaErrorUserMsg: metaError?.error_user_msg, fullError: JSON.stringify(error.response?.data) },
          "Meta API error"
        );

        // Retry on 5xx or rate limit (code 32 or 4)
        const isRetryable =
          status >= 500 || metaError?.code === 32 || metaError?.code === 4;

        if (isRetryable && attempt < retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        // Surface Meta's user-friendly fields when present. `error_user_msg`
        // is the message Meta wants you to show to the *advertiser* (e.g.
        // "Your ad set budget must be more than ₹93.36"). It's far more
        // actionable than the top-level `message` field ("Invalid parameter").
        const userMsg = metaError?.error_user_msg || null;
        const userTitle = metaError?.error_user_title || null;
        // Compose a final message: prefer the user-facing one, but include
        // the title as a prefix so the surfaced text reads naturally.
        const composed = userMsg
          ? userTitle && !userMsg.toLowerCase().includes(userTitle.toLowerCase())
            ? `${userTitle}: ${userMsg}`
            : userMsg
          : metaError?.message || error.message;

        // Try to extract the offending field name from `error_data.blame_field_specs`.
        // Meta returns it as a JSON string; defensively try to parse it.
        let blameField = null;
        try {
          const ed = metaError?.error_data;
          const parsed = typeof ed === "string" ? JSON.parse(ed) : ed;
          const specs = parsed?.blame_field_specs;
          if (Array.isArray(specs) && Array.isArray(specs[0])) {
            blameField = specs[0][0] || null;
          }
        } catch { /* best-effort, keep null */ }

        throw {
          code: status || 500,
          message: composed,
          rawMessage: metaError?.message || error.message,
          metaErrorCode: metaError?.code,
          metaErrorSubcode: metaError?.error_subcode,
          metaErrorUserTitle: userTitle,
          metaErrorUserMsg: userMsg,
          metaErrorFbtraceId: metaError?.fbtrace_id,
          field: blameField,
        };
      }
    }
  }

  // === SETUP ===

  async getAdAccounts() {
    return this._request("GET", "/me/adaccounts", {
      fields: "name,currency,balance,account_status,spend_cap,amount_spent",
      limit: 50,
    });
  }

  async getAdAccountBalance(adAccountId) {
    return this._request("GET", `/act_${adAccountId}`, {
      fields: "balance,currency,spend_cap,amount_spent",
    });
  }

  async getPages() {
    return this._request("GET", "/me/accounts", {
      fields: "name,access_token,picture{url},whatsapp_business_account{id,name}",
      limit: 50,
    });
  }

  async getPageWABA(pageId) {
    return this._request("GET", `/${pageId}`, {
      fields: "whatsapp_business_account{id,name}",
    });
  }

  // === CAMPAIGN CREATION ===

  async createCampaign(adAccountId, params) {
    const body = {
      name: params.name,
      objective: params.objective || "OUTCOME_ENGAGEMENT",
      status: params.status || "PAUSED",
      special_ad_categories: (params.special_ad_categories && params.special_ad_categories.length > 0) ? params.special_ad_categories : [],
      is_adset_budget_sharing_enabled: false,
    };
    if (params.adlabels && params.adlabels.length > 0) {
      body.adlabels = params.adlabels;
    }
    // Pass through validate-only flag without persisting other unknown keys.
    // Meta returns {success: true} on success and a normal error on failure
    // when execution_options=['validate_only'] is set.
    if (params.execution_options) body.execution_options = params.execution_options;
    return this._request("POST", `/act_${adAccountId}/campaigns`, body);
  }

  async createAdSet(adAccountId, params) {
    const data = {
      name: params.name,
      campaign_id: params.campaign_id,
      billing_event: params.billing_event || "IMPRESSIONS",
      optimization_goal: params.optimization_goal || "LINK_CLICKS",
      bid_strategy: params.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
      start_time: params.start_time,
      targeting: {
        ...params.targeting,
        targeting_automation: {
          advantage_audience: params.targeting?.targeting_automation?.advantage_audience ?? 0,
        },
      },
      promoted_object: params.promoted_object,
      status: params.status || "PAUSED",
    };
    // Only include destination_type if explicitly provided
    if (params.destination_type) {
      data.destination_type = params.destination_type;
    }
    if (params.daily_budget) data.daily_budget = params.daily_budget;
    if (params.lifetime_budget) data.lifetime_budget = params.lifetime_budget;
    if (params.end_time) data.end_time = params.end_time;
    if (params.bid_amount) data.bid_amount = params.bid_amount;
    if (params.bid_constraints) data.bid_constraints = params.bid_constraints;
    if (params.execution_options) data.execution_options = params.execution_options;
    return this._request("POST", `/act_${adAccountId}/adsets`, data);
  }

  async createAdCreative(adAccountId, params) {
    const data = {
      name: params.name,
      object_story_spec: params.object_story_spec,
    };
    if (params.product_set_id) data.product_set_id = params.product_set_id;
    if (params.execution_options) data.execution_options = params.execution_options;
    return this._request("POST", `/act_${adAccountId}/adcreatives`, data);
  }

  async createAd(adAccountId, params) {
    const body = {
      name: params.name,
      adset_id: params.adset_id,
      creative: params.creative || { creative_id: params.creative_id },
      status: params.status || "PAUSED",
    };
    if (params.execution_options) body.execution_options = params.execution_options;
    return this._request("POST", `/act_${adAccountId}/ads`, body);
  }

  // === LEAD FORMS ===

  // POST /{page-id}/leadgen_forms — must use a PAGE access token, not the
  // user/business token. Caller is expected to construct an instance with
  // the page token (`new MetaAdsApiService(pageToken, logger)`).
  async createLeadGenForm(pageId, payload) {
    return this._request("POST", `/${pageId}/leadgen_forms`, payload);
  }

  // GET /{form-id} — single form metadata, used for ownership / status checks
  async getLeadGenForm(formId) {
    return this._request("GET", `/${formId}`, {
      fields: "id,name,status,page,created_time,questions,leads_count",
    });
  }

  async updateAd(adId, params) {
    return this._request("POST", `/${adId}`, params);
  }

  async updateCampaignStatus(campaignId, status) {
    return this._request("POST", `/${campaignId}`, { status });
  }

  async updateAdSetStatus(adsetId, status) {
    return this._request("POST", `/${adsetId}`, { status });
  }

  async updateAdSet(adsetId, params) {
    return this._request("POST", `/${adsetId}`, params);
  }

  async deleteAd(adId) {
    return this._request("DELETE", `/${adId}`);
  }

  // === INSIGHTS ===

  async getCampaignInsights(campaignId, params = {}) {
    return this._request("GET", `/${campaignId}/insights`, {
      fields:
        "spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking",
      time_range: params.time_range,
      time_increment: params.time_increment || 1,
      level: params.level || "campaign",
      ...params,
    });
  }

  async getAdInsights(adId, params = {}) {
    return this._request("GET", `/${adId}/insights`, {
      fields:
        "spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking",
      time_range: params.time_range,
      time_increment: params.time_increment || 1,
      ...params,
    });
  }

  /**
   * Fetch ad-level insights sliced to Instagram only.
   * Uses publisher_platform breakdown + server-side filtering so the response
   * contains exactly one row per ad (Instagram slice). Returns all rows across
   * paginated pages merged into a single array (`{ data: [...] }`).
   */
  async getInstagramAdInsights(adAccountId, params = {}) {
    const baseParams = {
      level: "ad",
      breakdowns: "publisher_platform",
      filtering: JSON.stringify([
        { field: "publisher_platform", operator: "IN", value: ["instagram"] },
      ]),
      fields:
        "ad_id,ad_name,adset_id,campaign_id,campaign_name,spend,impressions,reach,clicks,unique_clicks,ctr,cpc,frequency,actions,cost_per_action_type",
      limit: 500,
    };

    if (params.time_range) {
      baseParams.time_range = JSON.stringify(params.time_range);
    } else if (params.date_preset) {
      baseParams.date_preset = params.date_preset;
    } else {
      baseParams.date_preset = "last_30d";
    }

    // Paginate until exhausted (in practice rarely more than 1 page per ad account)
    const allRows = [];
    let endpoint = `/act_${adAccountId}/insights`;
    let nextParams = baseParams;
    let guard = 0;
    while (guard++ < 20) {
      const resp = await this._request("GET", endpoint, nextParams);
      if (Array.isArray(resp?.data)) {
        allRows.push(...resp.data);
      }
      const next = resp?.paging?.next;
      if (!next) break;
      // Switch to absolute URL pagination — axios URL param + empty params
      endpoint = next.replace(this.baseUrl, "");
      nextParams = {};
    }
    return { data: allRows };
  }

  async getReachEstimate(adAccountId, targetingSpec, dailyBudget) {
    return this._request("GET", `/act_${adAccountId}/reachestimate`, {
      targeting_spec: JSON.stringify(targetingSpec),
      daily_budget: dailyBudget,
      optimize_for: "CONVERSATIONS",
    });
  }

  // === CATALOGS ===

  async createProductCatalog(businessId, name, vertical = "commerce") {
    // Try business endpoint first, fall back to direct catalog creation
    return this._request("POST", `/${businessId}/owned_product_catalogs`, {
      name,
      vertical,
    });
  }

  async createProductCatalogForAdAccount(adAccountId, name, vertical = "commerce") {
    return this._request("POST", `/act_${adAccountId}/product_catalogs`, {
      name,
      vertical,
    });
  }

  async addProductToCatalog(catalogId, product) {
    // Parse price: expect format like "999.00 INR" or just "999.00"
    let priceValue = product.price;
    let currency = product.currency || "INR";
    if (typeof product.price === "string" && product.price.includes(" ")) {
      const parts = product.price.trim().split(/\s+/);
      priceValue = parts[0];
      currency = parts[1] || currency;
    }
    // Meta expects price in cents (integer)
    const priceInCents = Math.round(parseFloat(priceValue) * 100);

    return this._request("POST", `/${catalogId}/products`, {
      retailer_id: product.retailer_id,
      name: product.name,
      description: product.description || "",
      availability: product.availability || "in stock",
      condition: product.condition || "new",
      price: priceInCents,
      currency: currency,
      url: product.url || "https://www.example.com",
      image_url: product.image_url,
      brand: product.brand || "",
    });
  }

  async getProductCatalogs(adAccountId) {
    return this._request("GET", `/act_${adAccountId}/product_catalogs`, {
      fields: "id,name,product_count,vertical",
      limit: 50,
    });
  }

  async getCatalogProductSets(catalogId) {
    return this._request("GET", `/${catalogId}/product_sets`, {
      fields: "id,name,product_count,filter",
      limit: 50,
    });
  }

  async getCatalogProducts(catalogId, limit = 25) {
    return this._request("GET", `/${catalogId}/products`, {
      fields: "id,name,description,price,image_url,url,availability,retailer_id",
      limit,
    });
  }

  // === SEARCH ===

  async searchInterests(query) {
    return this._request("GET", "/search", {
      type: "adinterest",
      q: query,
      limit: 20,
    });
  }

  async searchLocations(query) {
    return this._request("GET", "/search", {
      type: "adgeolocation",
      q: query,
      location_types: '["city","region","country"]',
      limit: 20,
    });
  }

  // === AUDIENCES ===

  async createCustomAudience(adAccountId, params) {
    return this._request("POST", `/act_${adAccountId}/customaudiences`, {
      name: params.name,
      subtype: params.subtype || "CUSTOM",
      description: params.description,
      customer_file_source: params.customer_file_source || "USER_PROVIDED_ONLY",
    });
  }

  async uploadAudienceUsers(audienceId, schema, data) {
    return this._request("POST", `/${audienceId}/users`, {
      payload: { schema, data },
    });
  }

  async listCustomAudiences(adAccountId) {
    return this._request("GET", `/act_${adAccountId}/customaudiences`, {
      fields: "name,approximate_count,delivery_status,subtype",
      limit: 100,
    });
  }

  async createLookalikeAudience(adAccountId, params) {
    return this._request("POST", `/act_${adAccountId}/customaudiences`, {
      name: params.name,
      subtype: "LOOKALIKE",
      origin_audience_id: params.origin_audience_id,
      lookalike_spec: JSON.stringify({
        country: params.country || "IN",
        ratio: params.ratio || 0.01,
        type: "similarity",
      }),
    });
  }

  // === MEDIA ===

  async uploadImage(adAccountId, imageUrl) {
    return this._request("POST", `/act_${adAccountId}/adimages`, {
      url: imageUrl,
    });
  }

  async uploadImageFile(adAccountId, fileBuffer, fileName) {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("filename", fileBuffer, { filename: fileName });

    const url = `${this.baseUrl}/act_${adAccountId}/adimages`;
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.accessToken}`,
      },
      timeout: 60000,
    });
    return response.data;
  }

  async uploadVideo(adAccountId, fileBuffer, fileName, title) {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("source", fileBuffer, { filename: fileName });
    if (title) form.append("title", title);

    const url = `${this.baseUrl}/act_${adAccountId}/advideos`;
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.accessToken}`,
      },
      timeout: 120000,
    });
    return response.data;
  }

  // === BUSINESS ===

  async getBusinesses() {
    return this._request("GET", "/me/businesses", {
      fields: "id,name,created_time,verification_status",
      limit: 50,
    });
  }

  async createAdAccountForBusiness(businessId, params) {
    return this._request("POST", `/${businessId}/adaccount`, {
      name: params.name,
      currency: params.currency || "INR",
      timezone_id: params.timezone_id || 55, // Asia/Kolkata
      end_advertiser: businessId,
      media_agency: "NONE",
      partner: "NONE",
    });
  }

  async getAdAccountFundingSource(adAccountId) {
    return this._request("GET", `/act_${adAccountId}`, {
      fields: "balance,currency,spend_cap,amount_spent,funding_source,funding_source_details{type,display_string,id},min_daily_budget,adspaymentcycle{threshold_amount,created_time}",
    });
  }

  // === LEAD ADS ===

  async subscribePageToLeadGen(pageId) {
    return this._request("POST", `/${pageId}/subscribed_apps`, {
      subscribed_fields: "leadgen",
    });
  }

  async getLeadGenForms(pageId) {
    return this._request("GET", `/${pageId}/leadgen_forms`, {
      fields: "id,name,status,leads_count,created_time,questions",
      limit: 50,
    });
  }

  async getLeadFormLeads(formId, limit = 50, after = null) {
    const params = {
      fields: "id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,platform",
      limit,
    };
    if (after) params.after = after;
    return this._request("GET", `/${formId}/leads`, params);
  }

  async getAllLeadFormLeads(formId) {
    const allLeads = [];
    let after = null;
    do {
      const resp = await this.getLeadFormLeads(formId, 100, after);
      const leads = resp.data || [];
      allLeads.push(...leads);
      after = resp.paging?.cursors?.after || null;
      // Stop if no more pages or we've fetched a lot
      if (!after || !resp.paging?.next || allLeads.length > 5000) break;
    } while (after);
    return allLeads;
  }

  /**
   * List all forms on the page, then fetch leads from each form and merge.
   * Returns `{ data: [...leads], formCount }`. Use `getAllLeadFormLeads(formId)`
   * for a single form when you don't need cross-form aggregation.
   */
  async getPageLeads(pageId, limit = 50, after = null) {
    const formsResp = await this.getLeadGenForms(pageId);
    const forms = formsResp?.data || [];
    const allLeads = [];
    for (const form of forms) {
      try {
        const leadsResp = await this.getLeadFormLeads(form.id, limit, after);
        for (const lead of leadsResp.data || []) {
          allLeads.push({ ...lead, form_id: form.id, form_name: form.name });
        }
      } catch (err) {
        this.logger?.warn(
          { pageId, formId: form.id, message: err.message },
          "Failed to fetch leads for form",
        );
      }
    }
    return { data: allLeads, formCount: forms.length };
  }

  // === TOKEN ===

  static async exchangeCodeForToken(code, redirectUri, appId) {
    const resolvedAppId =
      appId ||
      process.env.META_ADS_OAUTH_APP_ID ||
      process.env.META_ADS_APP_ID ||
      process.env.META_APP_ID;
    const resolvedSecret =
      resolvedAppId === process.env.META_ADS_APP_ID
        ? (process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET)
        : (process.env.META_APP_SECRET || process.env.META_ADS_APP_SECRET);

    const url = `${META_API_BASE}/${META_API_VERSION}/oauth/access_token`;
    console.log("[Meta Ads OAuth] Exchanging code for token:", {
      url,
      client_id: resolvedAppId,
      redirect_uri: redirectUri,
      hasSecret: !!resolvedSecret,
      codePrefix: code?.substring(0, 20) + "...",
    });
    try {
      const response = await axios.get(url, {
        params: {
          client_id: resolvedAppId,
          client_secret: resolvedSecret,
          redirect_uri: redirectUri,
          code,
        },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      console.error("[Meta Ads OAuth] Token exchange failed:", err.response?.data || err.message);
      throw err;
    }
  }

  static async getLongLivedToken(shortToken, appId) {
    const resolvedAppId =
      appId ||
      process.env.META_ADS_OAUTH_APP_ID ||
      process.env.META_ADS_APP_ID ||
      process.env.META_APP_ID;
    const resolvedSecret =
      resolvedAppId === process.env.META_ADS_APP_ID
        ? (process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET)
        : (process.env.META_APP_SECRET || process.env.META_ADS_APP_SECRET);

    const url = `${META_API_BASE}/${META_API_VERSION}/oauth/access_token`;
    const response = await axios.get(url, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: resolvedAppId,
        client_secret: resolvedSecret,
        fb_exchange_token: shortToken,
      },
      timeout: 15000,
    });
    return response.data;
  }

  // === FETCH ADS FROM META ===

  async getAds(adAccountId, params = {}) {
    return this._request("GET", `/act_${adAccountId}/ads`, {
      fields:
        "name,status,effective_status,created_time,creative{id,name,object_story_spec,thumbnail_url,image_url,source_instagram_media_id,effective_instagram_media_id,instagram_permalink_url,effective_object_story_id},adset{name,targeting,daily_budget,lifetime_budget,start_time,end_time,promoted_object},campaign{name,objective,status},insights.date_preset(maximum){spend,impressions,reach,frequency,clicks,unique_clicks,ctr,cpc,cpm,actions,cost_per_action_type,quality_ranking,engagement_rate_ranking}",
      limit: params.limit || 50,
      ...params,
    });
  }

  async getCampaigns(adAccountId, params = {}) {
    return this._request("GET", `/act_${adAccountId}/campaigns`, {
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time,special_ad_categories,insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions,cost_per_action_type}",
      limit: params.limit || 50,
      ...params,
    });
  }

  async getAdSets(adAccountId, params = {}) {
    return this._request("GET", `/act_${adAccountId}/adsets`, {
      fields:
        "name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,promoted_object,campaign{name,status},insights.date_preset(maximum){spend,impressions,reach,clicks,unique_clicks,ctr,cpc,actions}",
      limit: params.limit || 50,
      ...params,
    });
  }

  // Fetch ads that promote Instagram posts. Each ad's creative exposes
  // `effective_instagram_media_id` — the IG media id the ad comments/webhooks
  // will fire against. Used by the Instagram automation UI to attach
  // auto-reply / auto-comment flows to ads.
  async getInstagramPromotedAds(adAccountId, params = {}) {
    return this._request("GET", `/act_${adAccountId}/ads`, {
      fields:
        "id,name,status,effective_status,created_time,updated_time,adset_id,campaign_id,creative{id,name,thumbnail_url,effective_instagram_media_id,instagram_permalink_url,object_story_spec,effective_object_story_id},adset{id,name,status},campaign{id,name,objective,status},insights.date_preset(last_30d){spend,impressions,reach,clicks}",
      limit: params.limit || 100,
      ...params,
    });
  }
}
