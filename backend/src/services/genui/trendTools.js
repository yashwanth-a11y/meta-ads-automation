// ─── Trend & channel tool implementations ─────────────────────────────────────
// Each export is a pure async function: (input, orgId) → { raw, eventType, payload }

import { desc, eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  channels,
  trendCandidates,
  trendScores,
  creativeBundles,
} from '../../db/schema.js';
import { sql } from 'drizzle-orm';

export async function getChannelList({ limit = 10 } = {}, orgId) {
  const rows = await db
    .select({
      id: channels.id,
      brand_name: channels.brand_name,
      niche: channels.niche,
      status: channels.status,
      language: channels.language,
      tone: channels.tone,
      posting_schedule: channels.posting_schedule,
    })
    .from(channels)
    .where(eq(channels.organization_id, orgId))
    .orderBy(channels.brand_name)
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Channels', value: '0', delta: 'No channels configured yet' }],
    };
  }

  const statItems = [
    { label: 'Total Channels', value: String(rows.length) },
    { label: 'Active', value: String(rows.filter((r) => r.status === 'active').length) },
    ...rows.map((r) => ({
      label: r.brand_name,
      value: r.niche ?? r.language ?? '—',
      delta: `${r.tone ?? 'Default tone'} · ${r.posting_schedule ?? '3x/week'}`,
    })),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

export async function getChannelPerformance({ limit = 5 } = {}, orgId) {
  const channelRows = await db
    .select({ id: channels.id, brand_name: channels.brand_name })
    .from(channels)
    .where(eq(channels.organization_id, orgId))
    .limit(Math.min(Number(limit) || 5, 10));

  if (!channelRows.length) return { raw: [], eventType: null, payload: null };

  const data = await Promise.all(
    channelRows.map(async (ch) => {
      const stats = await db
        .select({
          total: sql`count(*)`.mapWith(Number),
          published: sql`count(*) filter (where status = 'published')`.mapWith(Number),
          avgScore: sql`avg(score_composite)`.mapWith(Number),
        })
        .from(creativeBundles)
        .where(and(eq(creativeBundles.channel_id, ch.id), eq(creativeBundles.organization_id, orgId)));

      return {
        name: ch.brand_name,
        'Total Bundles': stats[0]?.total ?? 0,
        Published: stats[0]?.published ?? 0,
        'Avg Score': Math.round((stats[0]?.avgScore ?? 0) * 10) / 10,
      };
    }),
  );

  return {
    raw: data,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: 'Content Channel Performance',
      data,
      xKey: 'name',
      yKeys: ['Total Bundles', 'Published', 'Avg Score'],
    },
  };
}

export async function getChannelTrends({ channel_name, limit = 10, lifecycle_stage } = {}, orgId) {
  let channelId = null;
  let resolvedChannelName = channel_name ?? null;

  if (channel_name) {
    const found = await db
      .select({ id: channels.id, brand_name: channels.brand_name })
      .from(channels)
      .where(
        and(
          eq(channels.organization_id, orgId),
          or(
            ilike(channels.brand_name, `%${channel_name}%`),
            ilike(channels.name, `%${channel_name}%`),
          ),
        ),
      )
      .limit(1);

    if (found.length) {
      channelId = found[0].id;
      resolvedChannelName = found[0].brand_name;
    }
  }

  const conditions = [eq(trendScores.organization_id, orgId)];
  if (channelId) conditions.push(eq(trendScores.channel_id, channelId));
  if (lifecycle_stage) conditions.push(eq(trendCandidates.lifecycle_stage, lifecycle_stage));

  const rows = await db
    .select({
      title: trendCandidates.title,
      summary: trendCandidates.summary,
      source_type: trendCandidates.source_type,
      lifecycle_stage: trendCandidates.lifecycle_stage,
      velocity_score: trendCandidates.velocity_score,
      composite_score: trendScores.composite_score,
      emotional_alignment: trendScores.emotional_alignment,
      audience_fit: trendScores.audience_fit,
      adaptation_idea: trendScores.adaptation_idea,
    })
    .from(trendScores)
    .innerJoin(trendCandidates, eq(trendScores.trend_candidate_id, trendCandidates.id))
    .where(and(...conditions))
    .orderBy(desc(trendScores.composite_score))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Trends Found', value: '0', delta: `No scored trends for ${resolvedChannelName ?? 'this channel'} yet` }],
    };
  }

  const chartData = rows.map((r) => ({
    trend: r.title.length > 38 ? r.title.slice(0, 38) + '…' : r.title,
    'Brand Fit': Number(r.composite_score ?? 0),
    Velocity: Number(r.velocity_score ?? 0),
    stage: r.lifecycle_stage ?? 'seed',
  }));

  return {
    raw: rows,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: `Top Trends${resolvedChannelName ? ` for ${resolvedChannelName}` : ''}`,
      data: chartData,
      xKey: 'trend',
      yKeys: ['Brand Fit', 'Velocity'],
      unit: '/10',
    },
  };
}

export async function getTopTrends({ limit = 10, lifecycle_stage } = {}, orgId) {
  const conditions = [eq(trendScores.organization_id, orgId)];
  if (lifecycle_stage) conditions.push(eq(trendCandidates.lifecycle_stage, lifecycle_stage));

  const rows = await db
    .select({
      title: trendCandidates.title,
      source_type: trendCandidates.source_type,
      lifecycle_stage: trendCandidates.lifecycle_stage,
      velocity_score: trendCandidates.velocity_score,
      composite_score: trendScores.composite_score,
      adaptation_idea: trendScores.adaptation_idea,
    })
    .from(trendScores)
    .innerJoin(trendCandidates, eq(trendScores.trend_candidate_id, trendCandidates.id))
    .where(and(...conditions))
    .orderBy(desc(trendScores.composite_score))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Trends Found', value: '0', delta: 'No scored trends yet — run the pipeline first' }],
    };
  }

  const chartData = rows.map((r) => ({
    trend: r.title.length > 38 ? r.title.slice(0, 38) + '…' : r.title,
    'Brand Fit': Number(r.composite_score ?? 0),
    Velocity: Number(r.velocity_score ?? 0),
    stage: r.lifecycle_stage ?? 'seed',
  }));

  return {
    raw: rows,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: `Top ${rows.length} Trends Across All Channels`,
      data: chartData,
      xKey: 'trend',
      yKeys: ['Brand Fit', 'Velocity'],
      unit: '/10',
    },
  };
}

export async function getTrendDetails({ trend_title } = {}, orgId) {
  if (!trend_title) return { raw: null, eventType: null, payload: null };

  const candidate = await db
    .select()
    .from(trendCandidates)
    .where(ilike(trendCandidates.title, `%${trend_title}%`))
    .limit(1);

  if (!candidate.length) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Trend Not Found', value: trend_title, delta: 'Try a broader search term' }],
    };
  }

  const tc = candidate[0];

  const score = await db
    .select()
    .from(trendScores)
    .where(
      and(
        eq(trendScores.trend_candidate_id, tc.id),
        eq(trendScores.organization_id, orgId),
      ),
    )
    .orderBy(desc(trendScores.composite_score))
    .limit(1);

  const ts0 = score[0] ?? {};
  const dna = tc.emotional_dna ?? {};

  const statItems = [
    { label: 'Trend', value: tc.title, delta: tc.source_type ?? '—' },
    { label: 'Lifecycle', value: tc.lifecycle_stage ?? 'seed', delta: `Velocity: ${Number(tc.velocity_score ?? 0).toFixed(1)}` },
    { label: 'Brand Fit Score', value: ts0.composite_score ? `${Number(ts0.composite_score).toFixed(1)}/10` : '—', delta: `Audience: ${ts0.audience_fit ?? '—'} · Ease: ${ts0.adaptation_ease ?? '—'}` },
    ...(dna.core_emotion ? [{ label: 'Core Emotion', value: dna.core_emotion, delta: dna.visual_signature ?? '' }] : []),
    ...(ts0.adaptation_idea ? [{ label: 'Adaptation Idea', value: ts0.adaptation_idea }] : []),
    ...(tc.summary ? [{ label: 'Summary', value: tc.summary.length > 120 ? tc.summary.slice(0, 120) + '…' : tc.summary }] : []),
  ];

  return { raw: { candidate: tc, score: ts0 }, eventType: 'stat', payload: statItems };
}
