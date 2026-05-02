import { eq, and, between, sql, desc } from "drizzle-orm";
import { ctwaInsightsCache } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

export class CtwaInsightsRepository {
  constructor(db) {
    this.db = db;
  }

  async upsert(data) {
    const existing = await this.db
      .select()
      .from(ctwaInsightsCache)
      .where(
        and(
          eq(ctwaInsightsCache.meta_campaign_id, data.meta_campaign_id),
          eq(ctwaInsightsCache.date, data.date),
          data.meta_ad_id
            ? eq(ctwaInsightsCache.meta_ad_id, data.meta_ad_id)
            : sql`${ctwaInsightsCache.meta_ad_id} IS NULL`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(ctwaInsightsCache)
        .set({ ...data, synced_at: new Date() })
        .where(eq(ctwaInsightsCache.id, existing[0].id));
      return existing[0].id;
    }

    const id = uuidv4();
    await this.db.insert(ctwaInsightsCache).values({
      id,
      ...data,
      synced_at: new Date(),
    });
    return id;
  }

  async findByCampaign(metaCampaignId, startDate, endDate) {
    const conditions = [eq(ctwaInsightsCache.meta_campaign_id, metaCampaignId)];
    if (startDate && endDate) {
      conditions.push(between(ctwaInsightsCache.date, startDate, endDate));
    }

    return this.db
      .select()
      .from(ctwaInsightsCache)
      .where(and(...conditions))
      .orderBy(desc(ctwaInsightsCache.date));
  }

  async getAggregated(metaCampaignId, startDate, endDate) {
    const conditions = [eq(ctwaInsightsCache.meta_campaign_id, metaCampaignId)];
    if (startDate && endDate) {
      conditions.push(between(ctwaInsightsCache.date, startDate, endDate));
    }

    const [result] = await this.db
      .select({
        total_spend: sql`COALESCE(SUM(${ctwaInsightsCache.spend}), 0)`,
        total_impressions: sql`COALESCE(SUM(${ctwaInsightsCache.impressions}), 0)`,
        total_reach: sql`COALESCE(SUM(${ctwaInsightsCache.reach}), 0)`,
        total_clicks: sql`COALESCE(SUM(${ctwaInsightsCache.clicks}), 0)`,
        total_unique_clicks: sql`COALESCE(SUM(${ctwaInsightsCache.unique_clicks}), 0)`,
        avg_ctr: sql`COALESCE(AVG(${ctwaInsightsCache.ctr}), 0)`,
        avg_cpc: sql`COALESCE(AVG(${ctwaInsightsCache.cpc}), 0)`,
        total_conversations: sql`COALESCE(SUM(${ctwaInsightsCache.messaging_conversations_started}), 0)`,
        total_new_contacts: sql`COALESCE(SUM(${ctwaInsightsCache.new_messaging_contacts}), 0)`,
      })
      .from(ctwaInsightsCache)
      .where(and(...conditions));

    return result;
  }

  async getLatestRankings(metaCampaignId) {
    const [result] = await this.db
      .select({
        quality_ranking: ctwaInsightsCache.quality_ranking,
        engagement_rate_ranking: ctwaInsightsCache.engagement_rate_ranking,
      })
      .from(ctwaInsightsCache)
      .where(eq(ctwaInsightsCache.meta_campaign_id, metaCampaignId))
      .orderBy(desc(ctwaInsightsCache.date))
      .limit(1);
    return result || { quality_ranking: "UNKNOWN", engagement_rate_ranking: "UNKNOWN" };
  }
}
