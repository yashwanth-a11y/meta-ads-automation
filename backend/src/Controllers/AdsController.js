export class AdsController {
  constructor(adsService, logger) {
    this.adsService = adsService;
    this.logger = logger;
  }

  // === SETUP ===

  async getSetupStatus(request, reply) {
    const result = await this.adsService.getSetupStatus(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async getOAuthUrl(request, reply) {
    const result = this.adsService.getOAuthUrl(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async handleCallback(request, reply) {
    const { code, state } = request.body;
    if (!code) return reply.status(400).send({ success: false, message: "Authorization code required" });
    if (!state) return reply.status(400).send({ success: false, message: "OAuth state required" });

    try {
      const result = await this.adsService.handleOAuthCallback(
        code,
        state,
        request.user.organization_id,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      const metaError = error.response?.data?.error || error.response?.data || error.message;
      this.logger.error("Ads OAuth callback failed:", metaError);
      const statusCode = typeof error.code === "number" && error.code >= 100 && error.code < 600
        ? error.code
        : 500;
      return reply.status(statusCode).send({
        success: false,
        error: error.message || metaError || "OAuth callback failed",
        details: error.response?.status,
      });
    }
  }

  async connectAdAccount(request, reply) {
    try {
      const result = await this.adsService.connectAdAccount(
        request.user.organization_id,
        request.body
      );
      return reply.status(201).send({ success: true, data: result });
    } catch (error) {
      const metaError = error.response?.data?.error || error.message || error;
      this.logger.error("Connect ad account failed:", metaError, error.stack || error);
      const statusCode = error.code >= 400 && error.code < 600 ? error.code : 500;
      return reply.status(statusCode).send({
        success: false,
        error: typeof metaError === "string" ? metaError : (metaError.message || "Failed to connect ad account"),
        details: error.metaErrorCode ? { metaErrorCode: error.metaErrorCode } : null,
      });
    }
  }

  async getAvailableAdAccounts(request, reply) {
    const result = await this.adsService.getAvailableAdAccounts(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async switchAdAccount(request, reply) {
    const result = await this.adsService.switchAdAccount(
      request.user.organization_id,
      request.body
    );
    return reply.status(200).send({ success: true, data: result });
  }

  async getBalance(request, reply) {
    const result = await this.adsService.getBalance(request.user.organization_id);
    if (!result) return reply.status(404).send({ success: false, message: "No ad account connected" });
    return reply.send({ success: true, data: result });
  }

  async disconnect(request, reply) {
    await this.adsService.disconnect(request.user.organization_id);
    return reply.send({ success: true, message: "Ad account disconnected" });
  }

  // === CATALOGS ===

  async createProductCatalog(request, reply) {
    try {
      const result = await this.adsService.createProductCatalog(
        request.user.organization_id,
        request.body
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      this.logger.error("Create catalog failed:", error);
      return reply.status(error.code || 500).send({
        success: false,
        error: error.message || "Failed to create catalog",
      });
    }
  }

  async addProductToCatalog(request, reply) {
    try {
      const result = await this.adsService.addProductToCatalog(
        request.user.organization_id,
        request.params.catalogId,
        request.body
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      this.logger.error("Add product to catalog failed:", error);
      return reply.status(error.code || 500).send({
        success: false,
        error: error.message || "Failed to add product",
      });
    }
  }

  async getProductCatalogs(request, reply) {
    try {
      const result = await this.adsService.getProductCatalogs(request.user.organization_id);
      return reply.send({ success: true, data: result });
    } catch (error) {
      this.logger.error("Get catalogs failed:", error);
      // Return empty array instead of error so UI still works
      return reply.send({ success: true, data: [] });
    }
  }

  async getCatalogProductSets(request, reply) {
    const result = await this.adsService.getCatalogProductSets(
      request.user.organization_id,
      request.params.catalogId
    );
    return reply.send({ success: true, data: result });
  }

  async getCatalogProducts(request, reply) {
    const result = await this.adsService.getCatalogProducts(
      request.user.organization_id,
      request.params.catalogId
    );
    return reply.send({ success: true, data: result });
  }

  // === CAMPAIGNS ===

  async getCampaigns(request, reply) {
    const { status, search, page, limit } = request.query;
    const result = await this.adsService.getCampaigns(request.user.organization_id, {
      status,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    return reply.send({ success: true, data: result });
  }

  async createCampaign(request, reply) {
    try {
      const result = await this.adsService.createCampaign(
        request.user.organization_id,
        request.body
      );
      const warning = result._publishWarning;
      if (warning) delete result._publishWarning;
      return reply.status(201).send({ success: true, data: result, ...(warning && { warning }) });
    } catch (error) {
      const statusCode = (typeof error.code === "number" && error.code >= 100 && error.code < 600)
        ? error.code
        : (error.response?.status || 500);

      console.error("[CreateCampaign] Full error:", JSON.stringify(error, null, 2));
      this.logger.error({ err: error?.message, sub: error?.metaErrorSubcode, step: error?.step }, "Create campaign failed");

      // Return actionable error messages for known Meta error subcodes
      if (error.metaErrorSubcode === 2446886) {
        return reply.status(400).send({
          success: false,
          error: "Your Facebook Page is not linked to a WhatsApp Business Account. Go to your Facebook Page Settings → WhatsApp and connect your WhatsApp number, then try again.",
        });
      }

      // Prefer Meta's user-facing message (e.g. "Budget is too low: must be
      // more than ₹93.36") over the bland top-level "Invalid parameter".
      // `error.message` is already composed by MetaAdsApiService._request to
      // be "<userTitle>: <userMsg>" when both are present.
      const userMessage =
        error.metaErrorUserMsg
          ? (error.metaErrorUserTitle && !error.metaErrorUserMsg.toLowerCase().includes(String(error.metaErrorUserTitle).toLowerCase())
              ? `${error.metaErrorUserTitle}: ${error.metaErrorUserMsg}`
              : error.metaErrorUserMsg)
          : error.message || "Failed to create campaign";

      return reply.status(statusCode).send({
        success: false,
        error: userMessage,
        details: {
          step: error.step,
          field: error.field,
          meta_error_code: error.metaErrorCode,
          meta_error_subcode: error.metaErrorSubcode,
          fbtrace_id: error.metaErrorFbtraceId,
        },
      });
    }
  }

  async getCampaign(request, reply) {
    const result = await this.adsService.getCampaign(
      request.params.id,
      request.user.organization_id
    );
    if (!result) return reply.status(404).send({ success: false, message: "Campaign not found" });
    return reply.send({ success: true, data: result });
  }

  // Validate-only dry-run: same payload as createCampaign, but Meta is asked
  // to validate without persisting. Always returns 200 with {ok: bool}.
  async validateCampaign(request, reply) {
    try {
      const result = await this.adsService.validateCampaign(
        request.user.organization_id,
        request.body,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      // Hard failures (missing account, network) bubble up as 5xx.
      this.logger?.error({ message: error?.message }, "validateCampaign failed");
      return reply.status(error.code || 500).send({
        success: false,
        error: error.message || "Validation failed",
      });
    }
  }

  // Create a Lead Gen form on the connected Page.
  async createLeadForm(request, reply) {
    try {
      const result = await this.adsService.createLeadForm(
        request.user.organization_id,
        request.body,
      );
      return reply.status(201).send({ success: true, data: result });
    } catch (error) {
      const metaError = error.response?.data?.error || error.message || error;
      this.logger?.error({ message: metaError?.message || metaError }, "createLeadForm failed");
      const statusCode = error.code >= 400 && error.code < 600 ? error.code : 500;
      return reply.status(statusCode).send({
        success: false,
        error: typeof metaError === "string" ? metaError : (metaError.message || "Failed to create lead form"),
      });
    }
  }

  async updateCampaign(request, reply) {
    const result = await this.adsService.updateCampaign(
      request.params.id,
      request.user.organization_id,
      request.body
    );
    return reply.send({ success: true, data: result });
  }

  async deleteCampaign(request, reply) {
    await this.adsService.deleteCampaign(request.params.id, request.user.organization_id);
    return reply.send({ success: true, message: "Campaign deleted" });
  }

  async syncCampaign(request, reply) {
    const result = await this.adsService.syncCampaign(
      request.params.id,
      request.user.organization_id
    );
    return reply.send({ success: true, data: result });
  }

  async duplicateCampaign(request, reply) {
    const result = await this.adsService.duplicateCampaign(
      request.params.id,
      request.user.organization_id
    );
    return reply.status(201).send({ success: true, data: result });
  }

  // === INSIGHTS ===

  async getCampaignInsights(request, reply) {
    const { start_date, end_date } = request.query;
    const result = await this.adsService.getCampaignInsights(
      request.params.id,
      request.user.organization_id,
      start_date ? new Date(start_date) : null,
      end_date ? new Date(end_date) : null
    );
    return reply.send({ success: true, data: result });
  }

  async getLeadsChart(request, reply) {
    const { start_date, end_date } = request.query;
    const result = await this.adsService.getLeadsChart(
      request.params.id,
      request.user.organization_id,
      start_date ? new Date(start_date) : null,
      end_date ? new Date(end_date) : null
    );
    return reply.send({ success: true, data: result });
  }

  // === SEARCH ===

  async searchInterests(request, reply) {
    const result = await this.adsService.searchInterests(
      request.user.organization_id,
      request.body.query
    );
    return reply.send({ success: true, data: result });
  }

  async searchLocations(request, reply) {
    const result = await this.adsService.searchLocations(
      request.user.organization_id,
      request.body.query
    );
    return reply.send({ success: true, data: result });
  }

  // === AUDIENCES ===

  async getAudiences(request, reply) {
    const result = await this.adsService.getAudiences(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async createCustomAudience(request, reply) {
    const result = await this.adsService.createCustomAudience(
      request.user.organization_id,
      request.body
    );
    return reply.status(201).send({ success: true, data: result });
  }

  async createAudienceFromContacts(request, reply) {
    const result = await this.adsService.createCustomAudience(
      request.user.organization_id,
      request.body
    );
    return reply.status(201).send({ success: true, data: result });
  }

  async createLookalikeAudience(request, reply) {
    const result = await this.adsService.createLookalikeAudience(
      request.user.organization_id,
      request.body
    );
    return reply.status(201).send({ success: true, data: result });
  }

  async getAudiencePresets(request, reply) {
    const result = await this.adsService.getAudiencePresets(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async saveAudiencePreset(request, reply) {
    const result = await this.adsService.saveAudiencePreset(
      request.user.organization_id,
      request.body
    );
    return reply.status(201).send({ success: true, data: result });
  }

  // === FLOWS ===

  async getFlows(request, reply) {
    const result = await this.adsService.getFlows(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  // === FETCH FROM META ===

  async fetchAdsFromMeta(request, reply) {
    const result = await this.adsService.fetchAdsFromMeta(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  // === INSTAGRAM DASHBOARD ===

  async getInstagramSummary(request, reply) {
    const { start_date, end_date, date_preset, ad_account_id } = request.query || {};

    // Basic validation: date range and preset are mutually exclusive
    const hasRange = Boolean(start_date && end_date);
    const hasPreset = Boolean(date_preset);
    if (hasRange && hasPreset) {
      return reply.status(400).send({
        success: false,
        error: "Provide either date_preset OR (start_date and end_date), not both",
      });
    }
    if ((start_date && !end_date) || (!start_date && end_date)) {
      return reply.status(400).send({
        success: false,
        error: "Both start_date and end_date are required for a custom date range",
      });
    }

    try {
      const result = await this.adsService.getInstagramDashboard(
        request.user.organization_id,
        { start_date, end_date, date_preset, ad_account_id }
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      const statusCode = error?.code >= 400 && error?.code < 600 ? error.code : 500;
      this.logger?.error(
        { statusCode, errorCode: error?.errorCode, message: error?.message },
        "Get Instagram ad summary failed"
      );
      return reply.status(statusCode).send({
        success: false,
        error: error?.errorCode || "INSTAGRAM_SUMMARY_FAILED",
        message: error?.message || "Failed to fetch Instagram ad summary",
      });
    }
  }

  // List all Meta ad accounts connected to the org so the frontend can present
  // an account-switcher when multiple are connected.
  async listAdAccounts(request, reply) {
    try {
      const accounts = await this.adsService.listAdAccounts(request.user.organization_id);
      return reply.send({ success: true, data: accounts });
    } catch (error) {
      this.logger?.error({ message: error?.message }, "List ad accounts failed");
      return reply.status(500).send({ success: false, error: error?.message || "Failed to list ad accounts" });
    }
  }

  // === META AD ACTIONS ===

  async updateMetaAd(request, reply) {
    const { meta_ad_id } = request.params;
    const result = await this.adsService.updateMetaAd(
      request.user.organization_id,
      meta_ad_id,
      request.body
    );
    return reply.send({ success: true, data: result });
  }

  async updateMetaCampaign(request, reply) {
    const { meta_campaign_id } = request.params;
    const result = await this.adsService.updateMetaCampaignStatus(
      request.user.organization_id,
      meta_campaign_id,
      request.body.status
    );
    return reply.send({ success: true, data: result });
  }

  async updateMetaAdSet(request, reply) {
    const { meta_adset_id } = request.params;
    const result = await this.adsService.updateMetaAdSet(
      request.user.organization_id,
      meta_adset_id,
      request.body
    );
    return reply.send({ success: true, data: result });
  }

  // === IMAGE UPLOAD ===

  async uploadImage(request, reply) {
    const { image_url } = request.body;
    const result = await this.adsService.uploadAdImage(
      request.user.organization_id,
      image_url
    );
    return reply.send({ success: true, data: result });
  }

  async uploadImageFile(request, reply) {
    const data = await request.file();
    if (!data) return reply.status(400).send({ success: false, message: "No file provided" });

    const buffer = await data.toBuffer();
    const result = await this.adsService.uploadAdImageFile(
      request.user.organization_id,
      buffer,
      data.filename
    );
    return reply.send({ success: true, data: result });
  }

  // === AI GENERATION ===

  async generateAdCopy(request, reply) {
    const result = await this.adsService.generateAdCopy(
      request.user.organization_id,
      request.body
    );
    return reply.send({ success: true, data: result });
  }

  // Full campaign generator: prompt in → structured WizardForm-shaped data out.
  async aiGenerateCampaign(request, reply) {
    try {
      const result = await this.adsService.generateCampaignFromPrompt(
        request.user.organization_id,
        request.body || {},
      );
      return reply.send({ success: true, data: result });
    } catch (err) {
      const code = err?.code >= 400 && err?.code < 600 ? err.code : 500;
      this.logger?.error({ err: err?.message }, "aiGenerateCampaign failed");
      return reply.status(code).send({
        success: false,
        error: err?.message || "AI campaign generation failed",
      });
    }
  }

  // Image generator: brief prompt + campaign context → GPT-4o-mini refines →
  // microservice generates → returns S3 image URL for preview.
  async aiGenerateImage(request, reply) {
    try {
      const result = await this.adsService.generateAdImage(
        request.user.organization_id,
        request.body || {},
      );
      return reply.send({ success: true, data: result });
    } catch (err) {
      const code = err?.code >= 400 && err?.code < 600 ? err.code : 500;
      this.logger?.error({ err: err?.message }, "aiGenerateImage failed");
      return reply.status(code).send({
        success: false,
        error: err?.message || "Image generation failed",
      });
    }
  }

  // Discard a previously-generated image: best-effort S3 delete. Always
  // returns 200 with `{deleted, reason}` — the caller doesn't need to care
  // whether the delete succeeded; a failed delete just leaves an orphan.
  async aiDiscardImage(request, reply) {
    const { image_url } = request.body || {};
    const result = await this.adsService.discardGeneratedImage(
      request.user.organization_id,
      image_url,
    );
    return reply.send({ success: true, data: result });
  }

  // === CAMPAIGN DETAIL ===

  async getMetaCampaignDetail(request, reply) {
    const { meta_campaign_id } = request.params;
    const result = await this.adsService.getMetaCampaignDetail(
      request.user.organization_id,
      meta_campaign_id
    );
    return reply.send({ success: true, data: result });
  }

  // === AD SET DETAIL ===

  async getMetaAdSetDetail(request, reply) {
    const { meta_adset_id } = request.params;
    const result = await this.adsService.getMetaAdSetDetail(
      request.user.organization_id,
      meta_adset_id
    );
    return reply.send({ success: true, data: result });
  }

  // === AD INSIGHTS ===

  async getMetaAdInsights(request, reply) {
    const { meta_ad_id } = request.params;
    const { start_date, end_date, date_preset } = request.query;
    const result = await this.adsService.getMetaAdInsights(
      request.user.organization_id,
      meta_ad_id,
      { start_date, end_date, date_preset }
    );
    return reply.send({ success: true, data: result });
  }

  // === AI ASSISTANT ===

  async aiAssistant(request, reply) {
    const result = await this.adsService.aiCampaignAssistant(
      request.user.organization_id,
      request.body
    );
    return reply.send({ success: true, data: result });
  }

  // === SINGLE AD DETAIL ===

  async getMetaAdDetail(request, reply) {
    const { meta_ad_id } = request.params;
    const result = await this.adsService.getMetaAdDetail(
      request.user.organization_id,
      meta_ad_id
    );
    return reply.send({ success: true, data: result });
  }

  // === ALL ADS FOR A CAMPAIGN ===

  async getMetaCampaignAds(request, reply) {
    const { meta_campaign_id } = request.params;
    const { date_preset } = request.query || {};
    const result = await this.adsService.getMetaCampaignAds(
      request.user.organization_id,
      meta_campaign_id,
      { date_preset }
    );
    return reply.send({ success: true, data: result });
  }

  // === BUSINESS & FUNDING ===

  async getBusinesses(request, reply) {
    const result = await this.adsService.getBusinesses(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async createAdAccountOnMeta(request, reply) {
    const result = await this.adsService.createAdAccountOnMeta(
      request.user.organization_id,
      request.body
    );
    return reply.status(201).send({ success: true, data: result });
  }

  async getFundingDetails(request, reply) {
    const result = await this.adsService.getFundingDetails(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  // === META LEADS ===

  async getLeadForms(request, reply) {
    const result = await this.adsService.getLeadForms(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }

  async getLeadFormLeads(request, reply) {
    const { form_id } = request.params;
    const { limit, after } = request.query;
    const result = await this.adsService.getLeadFormLeads(
      request.user.organization_id,
      form_id,
      Number(limit) || 50,
      after || null
    );
    return reply.send({ success: true, data: result });
  }

  async getAllPageLeads(request, reply) {
    const { limit, offset } = request.query;
    const result = await this.adsService.getAllPageLeads(
      request.user.organization_id,
      Number(limit) || 100,
      Number(offset) || 0
    );
    return reply.send({ success: true, data: result });
  }

  async syncMetaLeads(request, reply) {
    const result = await this.adsService.syncMetaLeads(request.user.organization_id);
    return reply.send({ success: true, data: result });
  }
}
