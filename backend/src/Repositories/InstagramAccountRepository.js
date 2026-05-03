import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { instagramAccounts, channelInstagramAccounts } from '../db/schema.js';

export class InstagramAccountRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = data.id ?? uuidv4();
    const now = new Date();
    const row = {
      id,
      created_at: now,
      updated_at: now,
      is_active: true,
      ...data,
    };
    await this.db.insert(instagramAccounts).values(row);
    return this.findById(id);
  }

  async findById(id) {
    const [row] = await this.db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.id, id))
      .limit(1);
    return row || null;
  }

  async findByBusinessId(organizationId, igBusinessId) {
    const [row] = await this.db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.organization_id, organizationId),
          eq(instagramAccounts.ig_business_id, igBusinessId),
        ),
      )
      .limit(1);
    return row || null;
  }

  async findByOrganization(organizationId) {
    return this.db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.organization_id, organizationId));
  }

  async update(id, patch) {
    await this.db
      .update(instagramAccounts)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(instagramAccounts.id, id));
    return this.findById(id);
  }

  async hardDelete(id) {
    // Cascade: remove join rows first, then the account.
    await this.db
      .delete(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.instagram_account_id, id));
    await this.db
      .delete(instagramAccounts)
      .where(eq(instagramAccounts.id, id));
  }

  async linkChannel({ organization_id, channel_id, instagram_account_id }) {
    await this.db.insert(channelInstagramAccounts).values({
      channel_id,
      instagram_account_id,
      organization_id,
      created_at: new Date(),
    });
  }

  async unlinkChannel({ channel_id, instagram_account_id }) {
    await this.db
      .delete(channelInstagramAccounts)
      .where(
        and(
          eq(channelInstagramAccounts.channel_id, channel_id),
          eq(channelInstagramAccounts.instagram_account_id, instagram_account_id),
        ),
      );
  }

  async findChannelsForAccount(instagramAccountId) {
    return this.db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.instagram_account_id, instagramAccountId));
  }

  async findAccountsForChannel(channelId) {
    const links = await this.db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.channel_id, channelId));
    if (links.length === 0) return [];
    const ids = links.map((l) => l.instagram_account_id);
    return this.db
      .select()
      .from(instagramAccounts)
      .where(inArray(instagramAccounts.id, ids));
  }

  async findActiveAccountsForChannel(channelId) {
    const all = await this.findAccountsForChannel(channelId);
    return all.filter((a) => a.is_active);
  }

  async countActiveByOrganization(organizationId) {
    const rows = await this.db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.organization_id, organizationId),
          eq(instagramAccounts.is_active, true),
        ),
      );
    return rows.length;
  }
}
