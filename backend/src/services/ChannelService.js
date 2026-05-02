import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { channels } from '../db/schema.js';
import { notFound, conflict } from '../lib/errors.js';

export class ChannelService {
  async list(organizationId) {
    return db
      .select()
      .from(channels)
      .where(eq(channels.organization_id, organizationId))
      .orderBy(channels.created_at);
  }

  async get(organizationId, channelId) {
    const [row] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.organization_id, organizationId), eq(channels.id, channelId)));
    if (!row) throw notFound(`Channel ${channelId} not found`);
    return row;
  }

  async create(organizationId, data) {
    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: organizationId,
      name: data.name,
      brand_name: data.brand_name,
      brand_description: data.brand_description ?? null,
      industry: data.industry ?? null,
      niche: data.niche ?? null,
      tone: data.tone ?? null,
      language: data.language ?? 'en',
      target_audience: data.target_audience ?? null,
      products: data.products ?? [],
      competitors: data.competitors ?? [],
      tracked_keywords: data.tracked_keywords ?? [],
      blocked_topics: data.blocked_topics ?? [],
      brand_assets: data.brand_assets ?? {},
      instagram_account_id: data.instagram_account_id ?? null,
      approval_mode: data.approval_mode ?? 'manual',
      auto_publish_threshold: data.auto_publish_threshold ?? '8.5',
      topic_cooldown_days: data.topic_cooldown_days ?? 14,
      posting_schedule: data.posting_schedule ?? '3x/week',
      trend_sources: data.trend_sources ?? {
        rss: true,
        google_trends: true,
        reddit: true,
        product_hunt: true,
        youtube: false,
        twitter: false,
      },
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    await db.insert(channels).values(row);
    return row;
  }

  async update(organizationId, channelId, data) {
    await this.get(organizationId, channelId);

    const allowed = [
      'name', 'brand_name', 'brand_description', 'industry', 'niche', 'tone',
      'language', 'target_audience', 'products', 'competitors', 'tracked_keywords',
      'blocked_topics', 'brand_assets', 'instagram_account_id', 'approval_mode',
      'auto_publish_threshold', 'topic_cooldown_days', 'posting_schedule',
      'trend_sources', 'status',
    ];

    const patch = { updated_at: new Date() };
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }

    await db
      .update(channels)
      .set(patch)
      .where(and(eq(channels.organization_id, organizationId), eq(channels.id, channelId)));

    return this.get(organizationId, channelId);
  }

  async delete(organizationId, channelId) {
    await this.get(organizationId, channelId);
    await db
      .delete(channels)
      .where(and(eq(channels.organization_id, organizationId), eq(channels.id, channelId)));
  }
}

export const channelService = new ChannelService();
