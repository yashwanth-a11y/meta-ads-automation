import { eq, and, desc, like, inArray, sql } from "drizzle-orm";
import { ctwaCampaigns } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

export class CtwaCampaignRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = uuidv4();
    await this.db.insert(ctwaCampaigns).values({ id, ...data });
    return this.findById(id);
  }

  async findById(id) {
    const [result] = await this.db
      .select()
      .from(ctwaCampaigns)
      .where(eq(ctwaCampaigns.id, id))
      .limit(1);
    return result || null;
  }

  async findByMetaAdId(metaAdId, organizationId) {
    const [result] = await this.db
      .select()
      .from(ctwaCampaigns)
      .where(
        and(
          eq(ctwaCampaigns.meta_ad_id, metaAdId),
          eq(ctwaCampaigns.organization_id, organizationId)
        )
      )
      .limit(1);
    return result || null;
  }

  async findAll(organizationId, { status, search, page = 1, limit = 20 } = {}) {
    const conditions = [eq(ctwaCampaigns.organization_id, organizationId)];

    if (status && status !== "all") {
      conditions.push(eq(ctwaCampaigns.status, status));
    }
    if (search) {
      conditions.push(like(ctwaCampaigns.name, `%${search}%`));
    }

    const offset = (page - 1) * limit;

    const [items, [countResult]] = await Promise.all([
      this.db
        .select()
        .from(ctwaCampaigns)
        .where(and(...conditions))
        .orderBy(desc(ctwaCampaigns.created_at))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)` })
        .from(ctwaCampaigns)
        .where(and(...conditions)),
    ]);

    return {
      items,
      totalCount: Number(countResult?.count || 0),
      page,
      limit,
    };
  }

  async findActiveByAdAccount(adAccountId) {
    const statusFilter = inArray(ctwaCampaigns.status, ["active", "paused"]);
    const condition = adAccountId
      ? and(eq(ctwaCampaigns.ad_account_id, adAccountId), statusFilter)
      : statusFilter;
    return this.db.select().from(ctwaCampaigns).where(condition);
  }

  async update(id, data) {
    await this.db
      .update(ctwaCampaigns)
      .set(data)
      .where(eq(ctwaCampaigns.id, id));
    return this.findById(id);
  }

  async delete(id) {
    await this.db
      .update(ctwaCampaigns)
      .set({ status: "deleted" })
      .where(eq(ctwaCampaigns.id, id));
  }
}
