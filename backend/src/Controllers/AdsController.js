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
      const metaError = error.response?.data?.error || error.message || error;
      console.error("[CreateCampaign] Full error:", JSON.stringify(error, null, 2));
      console.error("[CreateCampaign] Meta error:", JSON.stringify(metaError, null, 2));
      this.logger.error("Create campaign failed:", metaError);

      // Return actionable error messages for known Meta error subcodes
      if (error.metaErrorSubcode === 2446886) {
        return reply.status(400).send({
          success: false,
          error: "Your Facebook Page is not linked to a WhatsApp Business Account. Go to your Facebook Page Settings → WhatsApp and connect your WhatsApp number, then try again.",
        });
      }

      return reply.status(statusCode).send({
        success: false,
        error: typeof metaError === "string" ? metaError : (metaError.message || "Failed to create campaign"),
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
