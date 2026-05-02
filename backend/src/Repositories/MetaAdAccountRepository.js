import { eq, and } from "drizzle-orm";
import { metaAdAccounts } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

export class MetaAdAccountRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = uuidv4();
    await this.db.insert(metaAdAccounts).values({ id, ...data });
    return this.findById(id);
  }

  async findById(id) {
    const [result] = await this.db
      .select()
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.id, id))
      .limit(1);
    return result || null;
  }

  async findByOrganizationId(organizationId) {
    return this.db
      .select()
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.organization_id, organizationId));
  }

  async findActiveByOrganizationId(organizationId) {
    const [result] = await this.db
      .select()
      .from(metaAdAccounts)
      .where(
        and(
          eq(metaAdAccounts.organization_id, organizationId),
          eq(metaAdAccounts.status, "active")
        )
      )
      .limit(1);
    return result || null;
  }

  async update(id, data) {
    await this.db
      .update(metaAdAccounts)
      .set(data)
      .where(eq(metaAdAccounts.id, id));
    return this.findById(id);
  }

  async updateBalance(id, balance) {
    await this.db
      .update(metaAdAccounts)
      .set({
        balance_cache: balance,
        balance_last_synced: new Date(),
      })
      .where(eq(metaAdAccounts.id, id));
  }

  async disconnect(id) {
    await this.db
      .update(metaAdAccounts)
      .set({ status: "disconnected" })
      .where(eq(metaAdAccounts.id, id));
  }

  async deleteByOrganizationId(organizationId) {
    await this.db
      .delete(metaAdAccounts)
      .where(eq(metaAdAccounts.organization_id, organizationId));
  }

  async findAllActive() {
    return this.db
      .select()
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.status, "active"));
  }
}
