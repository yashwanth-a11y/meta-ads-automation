import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { channels } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

const MODEL = 'gpt-4o-mini';

async function _openaiJSON(systemPrompt, userPrompt) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

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
      custom_labels: data.custom_labels ?? [],
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
      'trend_sources', 'custom_labels', 'status',
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

  // Generate brand labels from channel profile using LLM, save and return them
  async generateLabels(organizationId, channelId) {
    const channel = await this.get(organizationId, channelId);

    const profile = [
      channel.brand_name,
      channel.industry && `Industry: ${channel.industry}`,
      channel.niche && `Niche: ${channel.niche}`,
      channel.tone && `Tone: ${channel.tone}`,
      channel.target_audience && `Audience: ${channel.target_audience}`,
      channel.brand_description,
      (channel.products?.length) && `Products: ${channel.products.join(', ')}`,
    ].filter(Boolean).join('\n');

    const result = await _openaiJSON(
      `You are a brand strategist. Given a brand profile, return 8–12 short, specific labels (1–3 words each) that best describe the brand's positioning, content style, audience traits, and content themes. These labels will be used to tag and filter this brand's content pipeline. Return JSON: { "labels": string[] }`,
      profile,
    );

    const labels = Array.isArray(result.labels) ? result.labels.slice(0, 12) : [];
    await this.update(organizationId, channelId, { custom_labels: labels });
    return labels;
  }
}

export const channelService = new ChannelService();
