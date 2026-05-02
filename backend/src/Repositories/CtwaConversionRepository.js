import { eq, and, lt, sql } from "drizzle-orm";
import { ctwaConversions } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

export class CtwaConversionRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = uuidv4();
    const meta_event_id = data.meta_event_id || uuidv4();
    await this.db.insert(ctwaConversions).values({ id, meta_event_id, ...data });
    return this.findById(id);
  }

  async findById(id) {
    const [result] = await this.db
      .select()
      .from(ctwaConversions)
      .where(eq(ctwaConversions.id, id))
      .limit(1);
    return result || null;
  }

  async findUnsentForRetry(maxRetries = 3) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.db
      .select()
      .from(ctwaConversions)
      .where(
        and(
          eq(ctwaConversions.sent_to_meta, false),
          lt(ctwaConversions.retry_count, maxRetries),
          sql`${ctwaConversions.created_at} > ${sevenDaysAgo}`
        )
      );
  }

  async markSent(id, metaResponse) {
    await this.db
      .update(ctwaConversions)
      .set({
        sent_to_meta: true,
        sent_at: new Date(),
        meta_response: metaResponse,
      })
      .where(eq(ctwaConversions.id, id));
  }

  async incrementRetry(id) {
    await this.db
      .update(ctwaConversions)
      .set({
        retry_count: sql`${ctwaConversions.retry_count} + 1`,
      })
      .where(eq(ctwaConversions.id, id));
  }

  async getConversionsByCampaign(ctwaConversationIds) {
    if (!ctwaConversationIds.length) return [];
    return this.db
      .select()
      .from(ctwaConversions)
      .where(
        sql`${ctwaConversions.ctwa_conversation_id} IN (${sql.join(
          ctwaConversationIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
  }

  async getRevenueByCampaignConversations(ctwaConversationIds) {
    if (!ctwaConversationIds.length) {
      return { total_revenue: 0, total_orders: 0, avg_order_value: 0 };
    }
    const [result] = await this.db
      .select({
        total_revenue: sql`COALESCE(SUM(${ctwaConversions.value}), 0)`,
        total_orders: sql`COUNT(CASE WHEN ${ctwaConversions.event_type} = 'Purchase' THEN 1 END)`,
        avg_order_value: sql`COALESCE(AVG(CASE WHEN ${ctwaConversions.event_type} = 'Purchase' THEN ${ctwaConversions.value} END), 0)`,
      })
      .from(ctwaConversions)
      .where(
        sql`${ctwaConversions.ctwa_conversation_id} IN (${sql.join(
          ctwaConversationIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    return result;
  }
}
