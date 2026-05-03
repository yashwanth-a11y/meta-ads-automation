import { eq, and, between, sql, desc } from "drizzle-orm";
import { ctwaConversations } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

export class CtwaConversationRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = uuidv4();
    await this.db.insert(ctwaConversations).values({
      id,
      ...data,
      initiated_at: data.initiated_at || new Date(),
    });
    return this.findById(id);
  }

  async findById(id) {
    const [result] = await this.db
      .select()
      .from(ctwaConversations)
      .where(eq(ctwaConversations.id, id))
      .limit(1);
    return result || null;
  }

  async findByConversationId(conversationId) {
    const [result] = await this.db
      .select()
      .from(ctwaConversations)
      .where(eq(ctwaConversations.conversation_id, conversationId))
      .limit(1);
    return result || null;
  }

  async findByCampaign(campaignId, { startDate, endDate } = {}) {
    const conditions = [eq(ctwaConversations.campaign_id, campaignId)];
    if (startDate && endDate) {
      conditions.push(between(ctwaConversations.initiated_at, startDate, endDate));
    }

    return this.db
      .select()
      .from(ctwaConversations)
      .where(and(...conditions))
      .orderBy(desc(ctwaConversations.initiated_at));
  }

  async getLeadsChartData(campaignId, startDate, endDate) {
    const conditions = [eq(ctwaConversations.campaign_id, campaignId)];
    if (startDate && endDate) {
      conditions.push(between(ctwaConversations.initiated_at, startDate, endDate));
    }

    return this.db
      .select({
        date: sql`DATE(${ctwaConversations.initiated_at})`,
        total: sql`COUNT(*)`,
        new_contacts: sql`SUM(CASE WHEN ${ctwaConversations.is_new_contact} = true THEN 1 ELSE 0 END)`,
        existing_contacts: sql`SUM(CASE WHEN ${ctwaConversations.is_new_contact} = false THEN 1 ELSE 0 END)`,
      })
      .from(ctwaConversations)
      .where(and(...conditions))
      .groupBy(sql`DATE(${ctwaConversations.initiated_at})`)
      .orderBy(sql`DATE(${ctwaConversations.initiated_at})`);
  }

  async getCountByCampaign(campaignId) {
    const [result] = await this.db
      .select({
        total: sql`COUNT(*)`,
        new_contacts: sql`SUM(CASE WHEN ${ctwaConversations.is_new_contact} = true THEN 1 ELSE 0 END)`,
        existing_contacts: sql`SUM(CASE WHEN ${ctwaConversations.is_new_contact} = false THEN 1 ELSE 0 END)`,
        converted: sql`SUM(CASE WHEN ${ctwaConversations.converted_at} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(ctwaConversations)
      .where(eq(ctwaConversations.campaign_id, campaignId));
    return result;
  }

  async markConverted(id) {
    await this.db
      .update(ctwaConversations)
      .set({ converted_at: new Date() })
      .where(eq(ctwaConversations.id, id));
  }

  /** CTWA conversations grouped by referral_source for attribution-style charts. */
  async countByReferralSource(organizationId, startDate, endDate) {
    const conditions = [eq(ctwaConversations.organization_id, organizationId)];
    if (startDate && endDate) {
      conditions.push(between(ctwaConversations.initiated_at, startDate, endDate));
    }

    const sourceExpr = sql`COALESCE(NULLIF(TRIM(${ctwaConversations.referral_source}), ''), 'Direct / unknown')`;

    return this.db
      .select({
        source: sourceExpr,
        count: sql`COUNT(*)::int`,
      })
      .from(ctwaConversations)
      .where(and(...conditions))
      .groupBy(sourceExpr)
      .orderBy(desc(sql`COUNT(*)`));
  }
}
