import { eq, and, desc, gte, isNull, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { trendCandidates, trendScores, channels, topicCooldowns } from '../db/schema.js';
import { env } from '../config/env.js';
import { generateJSON } from './agent/llmClient.js';
import { PROMPTS } from './agent/prompts.js';

export class ContentIntelligenceService {
  // Step 1: Classify unprocessed candidates (batch, runs after ingestion)
  async classifyPendingCandidates(limit = 50) {
    if (!env.OPENAI_API_KEY) {
      console.warn('[ContentIntelligence] Skipping classification — OPENAI_API_KEY not set');
      return { classified: 0 };
    }

    const pending = await db
      .select()
      .from(trendCandidates)
      .where(isNull(trendCandidates.classification))
      .orderBy(desc(trendCandidates.ingested_at))
      .limit(limit);

    let classified = 0;
    for (let i = 0; i < pending.length; i += 10) {
      const batch = pending.slice(i, i + 10);
      await this._classifyBatch(batch);
      classified += batch.length;
    }
    return { classified };
  }

  async _classifyBatch(candidates) {
    const items = candidates
      .map((c, idx) => `${idx + 1}. [${c.source_type}] ${c.title}\n   ${c.summary ?? ''}`)
      .join('\n\n');

    let result;
    try {
      result = await generateJSON({
        model: 'mini',
        system: PROMPTS.CLASSIFY_TRENDS,
        user: `Classify these ${candidates.length} items:\n\n${items}`,
        label: 'classify',
      });
    } catch (err) {
      console.error('[ContentIntelligence] classify batch failed:', err.message);
      return;
    }

    for (const r of (result.items ?? [])) {
      const candidate = candidates[r.index - 1];
      if (!candidate) continue;
      await db
        .update(trendCandidates)
        .set({
          classification: r.classification,
          lifecycle_stage: r.lifecycle_stage ?? candidate.lifecycle_stage,
          emotional_dna: r.emotional_dna ?? null,
        })
        .where(eq(trendCandidates.id, candidate.id));
    }
  }

  // Step 2: Score all active channels against new/unscored candidates
  async scoreCandidatesForAllChannels() {
    if (!env.OPENAI_API_KEY) {
      console.warn('[ContentIntelligence] Skipping scoring — OPENAI_API_KEY not set');
      return { totalScored: 0 };
    }

    const activeChannels = await db
      .select()
      .from(channels)
      .where(eq(channels.status, 'active'));

    let totalScored = 0;
    for (const channel of activeChannels) {
      const { scored } = await this.scoreCandidatesForChannel(channel);
      totalScored += scored;
    }
    return { totalScored };
  }

  async scoreCandidatesForChannel(channel) {
    const alreadyScored = await db
      .select({ trend_candidate_id: trendScores.trend_candidate_id })
      .from(trendScores)
      .where(eq(trendScores.channel_id, channel.id));

    const scoredIds = new Set(alreadyScored.map((r) => r.trend_candidate_id));

    const candidates = await db
      .select()
      .from(trendCandidates)
      .where(
        and(
          or(
            eq(trendCandidates.classification, 'topic'),
            eq(trendCandidates.classification, 'format_template'),
            eq(trendCandidates.classification, 'brand_news'),
          ),
          gte(trendCandidates.ingested_at, new Date(Date.now() - 72 * 60 * 60 * 1000)),
        ),
      )
      .limit(50);

    const unscored = candidates.filter((c) => !scoredIds.has(c.id));

    let scored = 0;
    for (let i = 0; i < unscored.length; i += 5) {
      const batch = unscored.slice(i, i + 5);
      await this._scoreBatchForChannel(channel, batch);
      scored += batch.length;
    }
    return { scored };
  }

  async _scoreBatchForChannel(channel, candidates) {
    const brandContext = this._buildBrandContext(channel);
    const items = candidates
      .map((c, idx) => `${idx + 1}. [${c.classification}] ${c.title}
   Emotional DNA: ${JSON.stringify(c.emotional_dna ?? {})}
   Summary: ${c.summary ?? ''}`)
      .join('\n\n');

    let result;
    try {
      result = await generateJSON({
        model: 'mini',
        system: PROMPTS.SCORE_TREND_BRAND_FIT,
        user: `Brand context:\n${brandContext}\n\nScore these ${candidates.length} trends:\n\n${items}`,
        label: 'score_trends',
      });
    } catch (err) {
      console.error('[ContentIntelligence] score batch failed:', err.message);
      return;
    }

    const now = new Date();
    const scored = result.items ?? [];
    for (let i = 0; i < scored.length; i++) {
      const r = scored[i];
      const candidate = candidates[r.index != null ? r.index - 1 : i];
      if (!candidate) continue;
      if ((r.composite_score ?? 0) === 0) continue;

      await db.insert(trendScores).values({
        id: uuidv4(),
        trend_candidate_id: candidate.id,
        channel_id: channel.id,
        organization_id: channel.organization_id,
        emotional_alignment: String(r.emotional_alignment ?? 0),
        audience_fit: String(r.audience_fit ?? 0),
        adaptation_ease: String(r.adaptation_ease ?? 0),
        risk_score: String(r.risk_score ?? 0),
        composite_score: String(r.composite_score ?? 0),
        adaptation_idea: r.adaptation_idea ?? null,
        scored_at: now,
      }).onConflictDoNothing();
    }
  }

  // Step 3: Get top-N scored candidates for a channel
  async getTopForChannel(channelId, organizationId, { limit = 5, minScore = 5 } = {}) {
    const activeCooldowns = await db
      .select({ topic_key: topicCooldowns.topic_key })
      .from(topicCooldowns)
      .where(and(
        eq(topicCooldowns.channel_id, channelId),
        gte(topicCooldowns.expires_at, new Date()),
      ));
    const cooledTopics = new Set(activeCooldowns.map((c) => c.topic_key));

    const rows = await db
      .select({ score: trendScores, trend: trendCandidates })
      .from(trendScores)
      .innerJoin(trendCandidates, eq(trendScores.trend_candidate_id, trendCandidates.id))
      .where(and(
        eq(trendScores.channel_id, channelId),
        eq(trendScores.organization_id, organizationId),
        gte(trendScores.composite_score, String(minScore)),
      ))
      .orderBy(desc(trendScores.composite_score))
      .limit(limit * 3);

    const filtered = rows.filter((r) => !cooledTopics.has(this._topicKey(r.trend.title)));

    return filtered.slice(0, limit).map((r) => ({
      ...r.trend,
      brand_fit: {
        composite_score: Number(r.score.composite_score),
        emotional_alignment: Number(r.score.emotional_alignment),
        audience_fit: Number(r.score.audience_fit),
        adaptation_ease: Number(r.score.adaptation_ease),
        risk_score: Number(r.score.risk_score),
        adaptation_idea: r.score.adaptation_idea,
      },
    }));
  }

  async markTopicUsed(channelId, organizationId, topicTitle, cooldownDays = 14) {
    const key = this._topicKey(topicTitle);
    await db.insert(topicCooldowns).values({
      id: uuidv4(),
      channel_id: channelId,
      organization_id: organizationId,
      topic_key: key,
      expires_at: new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000),
      created_at: new Date(),
    }).onConflictDoNothing();
  }

  _buildBrandContext(channel) {
    return [
      `Brand: ${channel.brand_name}`,
      channel.industry   ? `Industry: ${channel.industry}`             : null,
      channel.niche      ? `Niche: ${channel.niche}`                   : null,
      channel.tone       ? `Tone: ${channel.tone}`                     : null,
      channel.target_audience ? `Audience: ${channel.target_audience}` : null,
      channel.products?.length   ? `Products: ${channel.products.join(', ')}` : null,
      channel.blocked_topics?.length
        ? `BLOCKED topics (score=0 if touched): ${channel.blocked_topics.join(', ')}`
        : null,
    ].filter(Boolean).join('\n');
  }

  _topicKey(title) {
    return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '_').slice(0, 200);
  }
}

export const contentIntelligenceService = new ContentIntelligenceService();
