import { decryptToken } from "../utils/encryption.js";
import { MetaAdsApiService } from "./MetaAdsApiService.js";

// Date presets the frontend may pass through. Anything else falls back to the
// `?days=N` numeric form, which we convert to a `time_range` (since/until).
// Mirrors the subset of values Meta's Marketing API accepts on the
// `date_preset` param of `/act_{id}/insights`.
const ALLOWED_DATE_PRESETS = new Set([
  "today",
  "yesterday",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "maximum",
]);

const PRESET_TO_DAYS = {
  today: 1,
  yesterday: 1,
  last_3d: 3,
  last_7d: 7,
  last_14d: 14,
  last_28d: 28,
  last_30d: 30,
  last_90d: 90,
};

const DAYS_TO_PRESET = {
  1: "today",
  3: "last_3d",
  7: "last_7d",
  14: "last_14d",
  28: "last_28d",
  30: "last_30d",
  90: "last_90d",
};

// Action types we surface as discrete KPIs. Anything else falls into the
// generic `total_results` bucket.
const RESULT_ACTION_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.messaging_conversation_started_7d",
  "purchase",
  "complete_registration",
  "link_click",
]);

/**
 * Live-fetch analytics service. Each request to /analytics/* hits Meta — there
 * is no DB cache layer here. The existing `ctwa_insights_cache` table is used
 * only by the legacy CTWA per-campaign sync flow elsewhere.
 *
 * Failure modes that are surfaced as structured responses (not throws):
 *  - No active Meta ad account connected → `{ hasAccount: false }`
 * Failure modes that throw (and are caught by the global error handler):
 *  - Token expired → 401 from Meta, surfaces as `Reconnect Meta account` toast
 *  - Rate limit → already retried 2× by `MetaAdsApiService._request`
 * Per-section failures (one breakdown call out of six rejecting) are tolerated:
 *  the dashboard still renders, the failed section reports `null` and the UI
 *  shows an inline "section unavailable" hint.
 */
export class AnalyticsService {
  constructor({ metaAdAccountRepository, ctwaConversationRepository, logger }) {
    this.metaAdAccountRepo = metaAdAccountRepository;
    this.conversationRepo = ctwaConversationRepository;
    this.logger = logger;
  }

  // === Public API ===

  /** Org-wide analytics dashboard (KPIs, time series, breakdowns, top campaigns). */
  async getDashboard(organizationId, opts = {}) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) return this._notConnected();

    const range = this._resolveRange(opts);
    const metaApi = this._getMetaApi(account);
    const adAccountId = account.ad_account_id;

    const [
      dailyRes,
      campaignsRes,
      platformRes,
      placementRes,
      demoRes,
      ctwaRefsRes,
    ] = await Promise.allSettled([
      metaApi.getAccountInsights(adAccountId, {
        ...range.metaParams,
        level: "account",
        time_increment: 1,
        fields:
          "date_start,date_stop,spend,impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,frequency,actions",
      }),
      metaApi.getAccountInsights(adAccountId, {
        ...range.metaParams,
        level: "campaign",
        fields:
          "campaign_id,campaign_name,spend,impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,actions",
        sort: "spend_descending",
        limit: 50,
      }),
      metaApi.getAccountInsights(adAccountId, {
        ...range.metaParams,
        level: "account",
        breakdowns: "publisher_platform",
        fields: "spend,impressions,clicks,actions",
      }),
      metaApi.getAccountInsights(adAccountId, {
        ...range.metaParams,
        level: "account",
        breakdowns: "publisher_platform,platform_position",
        fields: "spend,impressions,clicks",
      }),
      metaApi.getAccountInsights(adAccountId, {
        ...range.metaParams,
        level: "account",
        breakdowns: "age,gender",
        fields: "spend,impressions,clicks,actions",
      }),
      this._getCtwaReferralBreakdown(organizationId, range),
    ]);

    this._logSettled(
      ["daily", "campaigns", "platform", "placement", "demographic", "ctwa"],
      [dailyRes, campaignsRes, platformRes, placementRes, demoRes, ctwaRefsRes],
    );

    const dailyRows = dailyRes.status === "fulfilled" ? dailyRes.value?.data ?? [] : [];
    const campaignRows =
      campaignsRes.status === "fulfilled" ? campaignsRes.value?.data ?? [] : [];

    const totals = this._aggregateTotals(dailyRows);
    const trend = this._buildTrend(dailyRows);
    const campaignBars = this._buildCampaignBars(campaignRows);
    const topCampaigns = this._buildTopCampaigns(campaignRows, 10);

    const platformBreakdown =
      platformRes.status === "fulfilled"
        ? this._buildPlatformBreakdown(platformRes.value?.data ?? [])
        : null;

    const placementBreakdown =
      placementRes.status === "fulfilled"
        ? this._buildPlacementBreakdown(placementRes.value?.data ?? [])
        : null;

    const demographicBreakdown =
      demoRes.status === "fulfilled"
        ? this._buildDemographicBreakdown(demoRes.value?.data ?? [])
        : null;

    const ctwaSources =
      ctwaRefsRes.status === "fulfilled" ? ctwaRefsRes.value : [];

    const sectionErrors = this._collectSectionErrors({
      daily: dailyRes,
      campaigns: campaignsRes,
      platform: platformRes,
      placement: placementRes,
      demographic: demoRes,
      ctwa: ctwaRefsRes,
    });

    const hasData =
      totals.spend > 0 ||
      totals.impressions > 0 ||
      totals.clicks > 0 ||
      campaignBars.length > 0 ||
      ctwaSources.length > 0;

    return {
      hasAccount: true,
      currency: account.currency || "USD",
      adAccount: {
        id: account.ad_account_id,
        name: account.ad_account_name || null,
      },
      range: range.response,
      totals,
      trend,
      campaignBars,
      topCampaigns,
      platformBreakdown,
      placementBreakdown,
      demographicBreakdown,
      ctwaSources,
      hasData,
      sectionErrors,
    };
  }

  /** Per-campaign rows for the campaigns table view. */
  async getCampaigns(organizationId, opts = {}) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) return { hasAccount: false, campaigns: [], range: null };

    const range = this._resolveRange(opts);
    const metaApi = this._getMetaApi(account);

    const insights = await metaApi.getAccountInsights(account.ad_account_id, {
      ...range.metaParams,
      level: "campaign",
      fields:
        "campaign_id,campaign_name,spend,impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,frequency,actions",
      sort: "spend_descending",
      limit: 200,
    });

    const rows = (insights?.data ?? [])
      .map((row) => {
        const totals = this._coerceMetricRow(row);
        return {
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name || row.campaign_id,
          ...totals,
        };
      })
      // Defensive re-sort — Meta honors `sort=spend_descending` but we don't
      // want a route response to depend on that being set correctly.
      .sort((a, b) => b.spend - a.spend);

    return {
      hasAccount: true,
      currency: account.currency || "USD",
      range: range.response,
      campaigns: rows,
    };
  }

  /** Top N ads by spend, joined with creative thumbnails when available. */
  async getTopAds(organizationId, opts = {}) {
    const account = await this.metaAdAccountRepo.findActiveByOrganizationId(organizationId);
    if (!account) return { hasAccount: false, ads: [], range: null };

    const limit = Math.max(1, Math.min(50, Number(opts.limit) || 10));
    const range = this._resolveRange(opts);
    const metaApi = this._getMetaApi(account);

    const [insightsRes, adsRes] = await Promise.allSettled([
      metaApi.getAccountInsights(account.ad_account_id, {
        ...range.metaParams,
        level: "ad",
        fields:
          "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,actions",
        sort: "spend_descending",
        limit: 200,
      }),
      metaApi
        .getAds(account.ad_account_id, { limit: 200 })
        .catch((err) => {
          this.logger?.warn({ err: err?.message }, "Top ads creative join failed");
          return { data: [] };
        }),
    ]);

    if (insightsRes.status !== "fulfilled") {
      // Hard fail — without insights there are no top ads to return.
      throw insightsRes.reason;
    }

    const adsByMetaId = new Map();
    if (adsRes.status === "fulfilled") {
      for (const ad of adsRes.value?.data ?? []) {
        adsByMetaId.set(String(ad.id), ad);
      }
    }

    const sorted = (insightsRes.value?.data ?? [])
      .map((row) => ({ row, spend: Number(row.spend || 0) }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, limit);

    const ads = sorted.map(({ row }) => {
      const meta = adsByMetaId.get(String(row.ad_id));
      const creative = meta?.creative || {};
      return {
        ad_id: row.ad_id,
        ad_name: row.ad_name || row.ad_id,
        adset_id: row.adset_id || null,
        adset_name: row.adset_name || null,
        campaign_id: row.campaign_id || null,
        campaign_name: row.campaign_name || null,
        thumbnail_url:
          creative.thumbnail_url ||
          creative.image_url ||
          null,
        instagram_permalink_url: creative.instagram_permalink_url || null,
        ...this._coerceMetricRow(row),
      };
    });

    return {
      hasAccount: true,
      currency: account.currency || "USD",
      range: range.response,
      ads,
    };
  }

  // === Aggregation helpers ===

  _aggregateTotals(rows) {
    let spend = 0;
    let impressions = 0;
    let reach = 0;
    let clicks = 0;
    let uniqueClicks = 0;
    const actionTotals = {};

    for (const row of rows) {
      spend += Number(row.spend || 0);
      impressions += Number(row.impressions || 0);
      reach += Number(row.reach || 0);
      clicks += Number(row.clicks || 0);
      uniqueClicks += Number(row.unique_clicks || 0);
      this._sumActions(actionTotals, row.actions);
    }

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : null;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
    // Aggregating frequency from daily rows is approximate (Meta's `frequency`
    // dedupes within the row's time window). Using impressions/reach gives the
    // commonly-quoted aggregate value. Reach can be 0 when there's no data.
    const frequency = reach > 0 ? impressions / reach : null;

    const results = this._summarizeResults(actionTotals);

    return {
      spend,
      impressions,
      reach,
      clicks,
      unique_clicks: uniqueClicks,
      ctr,
      cpc,
      cpm,
      frequency,
      ...results,
    };
  }

  _coerceMetricRow(row) {
    const spend = Number(row.spend || 0);
    const impressions = Number(row.impressions || 0);
    const reach = Number(row.reach || 0);
    const clicks = Number(row.clicks || 0);
    const actionTotals = {};
    this._sumActions(actionTotals, row.actions);
    const results = this._summarizeResults(actionTotals);
    return {
      spend,
      impressions,
      reach,
      clicks,
      // Prefer Meta-provided rate metrics when present; recompute from totals
      // otherwise so single-row aggregates remain useful.
      ctr: row.ctr != null ? Number(row.ctr) : impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: row.cpc != null ? Number(row.cpc) : clicks > 0 ? spend / clicks : null,
      cpm: row.cpm != null ? Number(row.cpm) : impressions > 0 ? (spend / impressions) * 1000 : null,
      frequency: row.frequency != null ? Number(row.frequency) : reach > 0 ? impressions / reach : null,
      ...results,
    };
  }

  _sumActions(target, actions) {
    if (!Array.isArray(actions)) return;
    for (const action of actions) {
      if (!action?.action_type) continue;
      const value = Number(action.value || 0);
      if (!Number.isFinite(value)) continue;
      target[action.action_type] = (target[action.action_type] || 0) + value;
    }
  }

  _summarizeResults(actionTotals) {
    const leads =
      (actionTotals["lead"] || 0) +
      (actionTotals["onsite_conversion.lead_grouped"] || 0);
    const messaging_conversations =
      actionTotals["onsite_conversion.messaging_conversation_started_7d"] || 0;
    const purchases = actionTotals["purchase"] || 0;
    const registrations = actionTotals["complete_registration"] || 0;
    const link_clicks = actionTotals["link_click"] || 0;
    const total_results = leads + messaging_conversations + purchases + registrations;
    return {
      results: total_results,
      leads,
      messaging_conversations,
      purchases,
      registrations,
      link_clicks,
    };
  }

  _buildTrend(dailyRows) {
    return [...dailyRows]
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))
      .map((row) => {
        const m = this._coerceMetricRow(row);
        return {
          date: row.date_start,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          results: m.results,
        };
      });
  }

  _buildCampaignBars(campaignRows) {
    return campaignRows
      .map((row) => ({
        name: row.campaign_name || row.campaign_id,
        spend: Number(row.spend || 0),
      }))
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);
  }

  _buildTopCampaigns(campaignRows, limit) {
    return campaignRows
      .map((row) => ({
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name || row.campaign_id,
        ...this._coerceMetricRow(row),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, limit);
  }

  _buildPlatformBreakdown(rows) {
    const byPlatform = new Map();
    let total = 0;
    for (const row of rows) {
      const key = row.publisher_platform || "unknown";
      const spend = Number(row.spend || 0);
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const cur = byPlatform.get(key) || { spend: 0, impressions: 0, clicks: 0 };
      cur.spend += spend;
      cur.impressions += impressions;
      cur.clicks += clicks;
      byPlatform.set(key, cur);
      total += spend;
    }
    return [...byPlatform.entries()]
      .map(([name, v]) => ({
        name,
        spend: v.spend,
        impressions: v.impressions,
        clicks: v.clicks,
        share: total > 0 ? Math.round((v.spend / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }

  _buildPlacementBreakdown(rows) {
    return rows
      .map((row) => ({
        platform: row.publisher_platform || "unknown",
        position: row.platform_position || "unknown",
        name: `${row.publisher_platform || "unknown"} · ${row.platform_position || "unknown"}`,
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
      }))
      .filter((p) => p.spend > 0 || p.impressions > 0)
      .sort((a, b) => b.spend - a.spend);
  }

  _buildDemographicBreakdown(rows) {
    return rows
      .map((row) => {
        const actionTotals = {};
        this._sumActions(actionTotals, row.actions);
        const results = this._summarizeResults(actionTotals);
        return {
          age: row.age || "unknown",
          gender: row.gender || "unknown",
          spend: Number(row.spend || 0),
          impressions: Number(row.impressions || 0),
          clicks: Number(row.clicks || 0),
          results: results.results,
        };
      })
      .filter((r) => r.spend > 0 || r.impressions > 0);
  }

  // === CTWA conversation breakdown (legacy DB-side data, kept alongside Meta) ===

  async _getCtwaReferralBreakdown(organizationId, range) {
    if (!this.conversationRepo?.countByReferralSource) return [];
    const rows = await this.conversationRepo.countByReferralSource(
      organizationId,
      range.start,
      range.end,
    );
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const total = rows.reduce((s, r) => s + Number(r.count || 0), 0);
    if (total <= 0) return [];
    const sorted = [...rows].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
    const head = sorted.slice(0, 6);
    const headSum = head.reduce((s, r) => s + Number(r.count || 0), 0);
    const rest = total - headSum;
    const pct = (n) => Math.round((n / total) * 1000) / 10;
    const out = head.map((r) => ({
      name: r.source || "Unknown",
      value: pct(Number(r.count || 0)),
      count: Number(r.count || 0),
    }));
    if (rest > 0) {
      out.push({ name: "Other", value: pct(rest), count: rest });
    }
    return out;
  }

  // === Range / preset resolution ===

  _resolveRange(opts) {
    let preset = null;
    let days = null;

    if (opts.date_preset && ALLOWED_DATE_PRESETS.has(String(opts.date_preset))) {
      preset = String(opts.date_preset);
    }
    if (opts.days != null) {
      const n = Number(opts.days);
      if (Number.isFinite(n) && n > 0 && n <= 366) days = Math.floor(n);
    }
    if (!preset && days != null) {
      preset = DAYS_TO_PRESET[days] || null;
    }
    if (!preset && days == null) {
      preset = "last_28d";
    }

    // Always compute concrete start/end dates for callers that need them
    // (CTWA conversations DB query). Approximated for range presets that don't
    // map cleanly to a single day count (this_month, this_quarter, etc.) —
    // fallback to last_28d for those when computing the DB window.
    const fallbackDays =
      days != null
        ? days
        : preset && PRESET_TO_DAYS[preset] != null
        ? PRESET_TO_DAYS[preset]
        : 28;
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - fallbackDays + 1);
    start.setUTCHours(0, 0, 0, 0);

    const metaParams = preset
      ? { date_preset: preset }
      : {
          time_range: {
            since: start.toISOString().slice(0, 10),
            until: end.toISOString().slice(0, 10),
          },
        };

    return {
      metaParams,
      start,
      end,
      response: {
        date_preset: preset,
        days: days ?? PRESET_TO_DAYS[preset] ?? null,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  _getMetaApi(account) {
    const token = decryptToken(account.access_token_encrypted);
    return new MetaAdsApiService(token, this.logger);
  }

  _notConnected() {
    return {
      hasAccount: false,
      currency: null,
      adAccount: null,
      range: null,
      totals: null,
      trend: [],
      campaignBars: [],
      topCampaigns: [],
      platformBreakdown: null,
      placementBreakdown: null,
      demographicBreakdown: null,
      ctwaSources: [],
      hasData: false,
      sectionErrors: {},
    };
  }

  _logSettled(labels, settled) {
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        this.logger?.warn(
          { section: labels[i], err: r.reason?.message || r.reason },
          "Analytics section failed",
        );
      }
    });
  }

  _collectSectionErrors(map) {
    const out = {};
    for (const [key, settled] of Object.entries(map)) {
      if (settled.status === "rejected") {
        const err = settled.reason || {};
        out[key] = {
          message: err.message || "Section failed to load",
          code: err.code || null,
        };
      }
    }
    return out;
  }
}
