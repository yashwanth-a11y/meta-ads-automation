export async function adsRoutes(fastify, options) {
  const controller = fastify.adsController;

  // Feature flag guard
  if (process.env.FEATURE_ADS_ENABLED !== "true") {
    return;
  }

  fastify.addHook("onRequest", fastify.authenticate);

  // === SETUP ===

  fastify.get("/ads/setup/status", {
    schema: {
      description: "Check if merchant has connected an ad account",
      tags: ["ads"],
    },
  }, (req, reply) => controller.getSetupStatus(req, reply));

  fastify.get("/ads/setup/oauth-url", {
    schema: {
      description: "Generate Meta OAuth URL for ads",
      tags: ["ads"],
    },
  }, (req, reply) => controller.getOAuthUrl(req, reply));

  fastify.post("/ads/setup/callback", {
    schema: {
      description: "Handle Meta OAuth callback",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["code", "state"],
        properties: {
          code: { type: "string" },
          state: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.handleCallback(req, reply));

  fastify.post("/ads/setup/connect", {
    schema: {
      description: "Save selected ad account connection",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["ad_account_id", "access_token"],
        properties: {
          ad_account_id: { type: "string" },
          ad_account_name: { type: "string" },
          page_id: { type: "string" },
          page_name: { type: "string" },
          waba_id: { type: "string", nullable: true },
          fb_user_id: { type: "string", nullable: true },
          access_token: { type: "string" },
          page_access_token: { type: "string", nullable: true },
          expires_in: { type: "number", nullable: true },
          pixel_id: { type: "string", nullable: true },
          currency: { type: "string", nullable: true },
        },
      },
    },
  }, (req, reply) => controller.connectAdAccount(req, reply));

  fastify.get("/ads/setup/ad-accounts", {
    schema: {
      description: "Get all available ad accounts from connected Facebook",
      tags: ["ads"],
    },
  }, (req, reply) => controller.getAvailableAdAccounts(req, reply));

  fastify.post("/ads/setup/switch", {
    schema: {
      description: "Switch to a different ad account without re-authenticating",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["ad_account_id"],
        properties: {
          ad_account_id: { type: "string" },
          ad_account_name: { type: "string" },
          page_id: { type: "string" },
          page_name: { type: "string" },
          page_access_token: { type: "string" },
          currency: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.switchAdAccount(req, reply));

  fastify.get("/ads/setup/balance", {
    schema: {
      description: "Get live ad account balance",
      tags: ["ads"],
    },
  }, (req, reply) => controller.getBalance(req, reply));

  fastify.delete("/ads/setup/disconnect", {
    schema: {
      description: "Disconnect ad account",
      tags: ["ads"],
    },
  }, (req, reply) => controller.disconnect(req, reply));

  // === CATALOGS ===

  fastify.post("/ads/catalogs", {
    schema: {
      description: "Create a product catalog on Meta",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name"],
        properties: {
          business_id: { type: "string" },
          name: { type: "string" },
          vertical: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.createProductCatalog(req, reply));

  fastify.post("/ads/catalogs/:catalogId/products", {
    schema: {
      description: "Add a product to a catalog",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["catalogId"],
        properties: { catalogId: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["retailer_id", "name", "price", "image_url"],
        properties: {
          retailer_id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
          image_url: { type: "string" },
          url: { type: "string" },
          availability: { type: "string" },
          condition: { type: "string" },
          brand: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.addProductToCatalog(req, reply));

  fastify.get("/ads/catalogs", {
    schema: {
      description: "List product catalogs from Meta",
      tags: ["ads"],
    },
  }, (req, reply) => controller.getProductCatalogs(req, reply));

  fastify.get("/ads/catalogs/:catalogId/product-sets", {
    schema: {
      description: "List product sets for a catalog",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["catalogId"],
        properties: { catalogId: { type: "string" } },
      },
    },
  }, (req, reply) => controller.getCatalogProductSets(req, reply));

  fastify.get("/ads/catalogs/:catalogId/products", {
    schema: {
      description: "List products for a catalog",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["catalogId"],
        properties: { catalogId: { type: "string" } },
      },
    },
  }, (req, reply) => controller.getCatalogProducts(req, reply));

  // === CAMPAIGNS ===

  fastify.get("/ads/campaigns", {
    schema: {
      description: "List all CTWA campaigns",
      tags: ["ads"],
      querystring: {
        type: "object",
        properties: {
          status: { type: "string" },
          search: { type: "string" },
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, (req, reply) => controller.getCampaigns(req, reply));

  // Validate-only dry-run: runs the full 4-step Meta create with
  // execution_options=['validate_only'] and returns {ok, validated, error}.
  // Always responds 200 unless the request itself was malformed.
  fastify.post("/ads/campaigns/validate", {
    schema: {
      description: "Dry-run a campaign create against Meta (validate_only).",
      tags: ["ads"],
      body: { type: "object" },
    },
  }, (req, reply) => controller.validateCampaign(req, reply));

  fastify.post("/ads/campaigns", {
    schema: {
      description: "Create a CTWA campaign",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 255 },
          objective: { type: "string" },
          campaign_type: { type: "string" },
          daily_budget: { type: "number", minimum: 1 },
          lifetime_budget: { type: "number" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          flow_id: { type: "string" },
          business_account_id: { type: "string" },
          targeting_spec: { type: "object" },
          placement_spec: { type: "object" },
          creative_spec: { type: "object" },
          opening_message: { type: "string" },
          publish: { type: "boolean" },
        },
      },
    },
  }, (req, reply) => controller.createCampaign(req, reply));

  fastify.get("/ads/campaigns/:id", {
    schema: {
      description: "Get single campaign detail",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, (req, reply) => controller.getCampaign(req, reply));

  fastify.patch("/ads/campaigns/:id", {
    schema: {
      description: "Update campaign (budget, status, end date)",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string" },
          daily_budget: { type: "number" },
          end_date: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.updateCampaign(req, reply));

  fastify.delete("/ads/campaigns/:id", {
    schema: {
      description: "Delete campaign",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, (req, reply) => controller.deleteCampaign(req, reply));

  fastify.post("/ads/campaigns/:id/sync", {
    schema: {
      description: "Manually sync campaign from Meta",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, (req, reply) => controller.syncCampaign(req, reply));

  fastify.post("/ads/campaigns/:id/duplicate", {
    schema: {
      description: "Duplicate campaign",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, (req, reply) => controller.duplicateCampaign(req, reply));

  // === INSIGHTS ===

  fastify.get("/ads/campaigns/:id/insights", {
    schema: {
      description: "Get campaign insights",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.getCampaignInsights(req, reply));

  fastify.get("/ads/campaigns/:id/leads-chart", {
    schema: {
      description: "Get leads per day chart data",
      tags: ["ads"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.getLeadsChart(req, reply));

  // === SEARCH ===

  fastify.post("/ads/search/interests", {
    schema: {
      description: "Search Meta interests/behaviors",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
  }, (req, reply) => controller.searchInterests(req, reply));

  fastify.post("/ads/search/locations", {
    schema: {
      description: "Search Meta locations",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
  }, (req, reply) => controller.searchLocations(req, reply));

  // === AUDIENCES ===

  fastify.get("/ads/audiences", {
    schema: { description: "List custom audiences", tags: ["ads"] },
  }, (req, reply) => controller.getAudiences(req, reply));

  fastify.post("/ads/audiences/custom", {
    schema: {
      description: "Create custom audience",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          users: { type: "array" },
        },
      },
    },
  }, (req, reply) => controller.createCustomAudience(req, reply));

  fastify.post("/ads/audiences/from-contacts", {
    schema: {
      description: "Create audience from WeNext contacts",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          contact_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
  }, (req, reply) => controller.createAudienceFromContacts(req, reply));

  fastify.post("/ads/audiences/lookalike", {
    schema: {
      description: "Create lookalike audience",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name", "origin_audience_id"],
        properties: {
          name: { type: "string" },
          origin_audience_id: { type: "string" },
          country: { type: "string" },
          ratio: { type: "number" },
        },
      },
    },
  }, (req, reply) => controller.createLookalikeAudience(req, reply));

  fastify.get("/ads/audiences/presets", {
    schema: { description: "Get saved audience presets", tags: ["ads"] },
  }, (req, reply) => controller.getAudiencePresets(req, reply));

  fastify.post("/ads/audiences/presets", {
    schema: {
      description: "Save audience preset",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name", "targeting_spec"],
        properties: {
          name: { type: "string" },
          targeting_spec: { type: "object" },
          description: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.saveAudiencePreset(req, reply));

  // === FLOWS ===

  fastify.get("/ads/flows", {
    schema: { description: "List available WeNext flows", tags: ["ads"] },
  }, (req, reply) => controller.getFlows(req, reply));

  // === FETCH FROM META ===

  fastify.get("/ads/fetch-from-meta", {
    schema: { description: "Fetch ads from Meta ad account", tags: ["ads"] },
  }, (req, reply) => controller.fetchAdsFromMeta(req, reply));

  // === INSTAGRAM DASHBOARD (platform-specific ad performance) ===

  fastify.get("/ads/instagram/summary", {
    schema: {
      description:
        "Fetch Instagram-only ad performance (uses Meta Marketing API publisher_platform breakdown filtered to instagram)",
      tags: ["ads"],
      querystring: {
        type: "object",
        properties: {
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          date_preset: {
            type: "string",
            enum: [
              "today", "yesterday", "this_month", "last_month",
              "this_quarter", "maximum",
              "last_3d", "last_7d", "last_14d", "last_28d",
              "last_30d", "last_90d",
            ],
          },
          ad_account_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  }, (req, reply) => controller.getInstagramSummary(req, reply));

  fastify.get("/ads/accounts", {
    schema: {
      description: "List all Meta ad accounts connected to the org",
      tags: ["ads"],
    },
  }, (req, reply) => controller.listAdAccounts(req, reply));

  // === META AD ACTIONS ===

  fastify.post("/ads/meta-ads/:meta_ad_id", {
    schema: { description: "Update a Meta ad (pause/resume/edit)", tags: ["ads"] },
  }, (req, reply) => controller.updateMetaAd(req, reply));

  fastify.post("/ads/meta-campaigns/:meta_campaign_id", {
    schema: { description: "Update a Meta campaign status", tags: ["ads"] },
  }, (req, reply) => controller.updateMetaCampaign(req, reply));

  fastify.post("/ads/meta-adsets/:meta_adset_id", {
    schema: { description: "Update a Meta ad set (pause/resume)", tags: ["ads"] },
  }, (req, reply) => controller.updateMetaAdSet(req, reply));

  // === IMAGE UPLOAD ===

  fastify.post("/ads/upload-image", {
    schema: {
      description: "Upload image to Meta ad account via URL",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["image_url"],
        properties: { image_url: { type: "string" } },
      },
    },
  }, (req, reply) => controller.uploadImage(req, reply));

  fastify.post("/ads/upload-image-file", {
    schema: { description: "Upload image file to Meta ad account", tags: ["ads"] },
  }, (req, reply) => controller.uploadImageFile(req, reply));

  // === AI GENERATION ===

  fastify.post("/ads/generate-copy", {
    schema: {
      description: "Generate ad copy using AI",
      tags: ["ads"],
      body: {
        type: "object",
        properties: {
          business_name: { type: "string" },
          business_type: { type: "string" },
          product_name: { type: "string" },
          product_description: { type: "string" },
          target_audience: { type: "string" },
          tone: { type: "string" },
          language: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.generateAdCopy(req, reply));

  // === CAMPAIGN DETAIL ===

  fastify.get("/ads/meta-campaigns/:meta_campaign_id/detail", {
    schema: { description: "Get campaign detail with ad sets", tags: ["ads"] },
  }, (req, reply) => controller.getMetaCampaignDetail(req, reply));

  // === AD SET DETAIL ===

  fastify.get("/ads/meta-adsets/:meta_adset_id/detail", {
    schema: { description: "Get ad set detail with ads", tags: ["ads"] },
  }, (req, reply) => controller.getMetaAdSetDetail(req, reply));

  // === AD INSIGHTS WITH DATE RANGE ===

  fastify.get("/ads/meta-ads/:meta_ad_id/insights", {
    schema: {
      description: "Get ad insights with date range",
      tags: ["ads"],
      querystring: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          date_preset: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.getMetaAdInsights(req, reply));

  // === AI ASSISTANT ===

  fastify.post("/ads/ai-assistant", {
    schema: {
      description: "AI campaign assistant",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string" },
          context: { type: "object" },
        },
      },
    },
  }, (req, reply) => controller.aiAssistant(req, reply));

  // === SINGLE AD DETAIL ===

  fastify.get("/ads/meta-ads/:meta_ad_id", {
    schema: { description: "Get single Meta ad with full details", tags: ["ads"] },
  }, (req, reply) => controller.getMetaAdDetail(req, reply));

  // === BUSINESS & FUNDING ===

  fastify.get("/ads/businesses", {
    schema: { description: "Get Facebook businesses for the connected account", tags: ["ads"] },
  }, (req, reply) => controller.getBusinesses(req, reply));

  fastify.post("/ads/create-ad-account", {
    schema: {
      description: "Create a new ad account under a Facebook business",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["business_id", "name"],
        properties: {
          business_id: { type: "string" },
          name: { type: "string" },
          currency: { type: "string" },
          timezone_id: { type: "number" },
        },
      },
    },
  }, (req, reply) => controller.createAdAccountOnMeta(req, reply));

  fastify.get("/ads/funding", {
    schema: { description: "Get ad account funding and balance details", tags: ["ads"] },
  }, (req, reply) => controller.getFundingDetails(req, reply));

  // === META LEADS ===

  fastify.get("/ads/leads/forms", {
    schema: { description: "Get lead gen forms from connected page", tags: ["ads"] },
  }, (req, reply) => controller.getLeadForms(req, reply));

  // Lead form CRUD — `/ads/lead-forms` is the cleaner path; `/ads/leads/forms`
  // (above) stays as the read alias used by the existing leads UI.
  fastify.get("/ads/lead-forms", {
    schema: { description: "Get lead gen forms from connected page (alias)", tags: ["ads"] },
  }, (req, reply) => controller.getLeadForms(req, reply));

  fastify.post("/ads/lead-forms", {
    schema: {
      description: "Create a Lead Gen form on the connected Facebook Page",
      tags: ["ads"],
      body: {
        type: "object",
        required: ["name", "questions", "privacy_policy"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          locale: { type: "string" },
          questions: { type: "array" },
          privacy_policy: {
            type: "object",
            required: ["url", "link_text"],
            properties: {
              url: { type: "string" },
              link_text: { type: "string" },
            },
          },
          follow_up_action_url: { type: "string" },
          thank_you_page: { type: "object" },
          context_card: { type: "object" },
        },
      },
    },
  }, (req, reply) => controller.createLeadForm(req, reply));

  fastify.get("/ads/leads/forms/:form_id/leads", {
    schema: {
      description: "Get leads from a specific form",
      tags: ["ads"],
      querystring: {
        type: "object",
        properties: {
          limit: { type: "number" },
          after: { type: "string" },
        },
      },
    },
  }, (req, reply) => controller.getLeadFormLeads(req, reply));

  fastify.get("/ads/leads", {
    schema: {
      description: "Get all leads from all forms on the connected page",
      tags: ["ads"],
      querystring: {
        type: "object",
        properties: {
          limit: { type: "number" },
          offset: { type: "number" },
        },
      },
    },
  }, (req, reply) => controller.getAllPageLeads(req, reply));

  fastify.post("/ads/leads/sync", {
    schema: { description: "Sync leads from Meta API to local cache", tags: ["ads"] },
  }, (req, reply) => controller.syncMetaLeads(req, reply));
}
