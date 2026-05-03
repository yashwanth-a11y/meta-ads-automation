/**
 * SpecialDaysService — queries special_days + custom_events DB tables and
 * scores each event against the channel's brand profile.
 *
 * Scoring uses the channel's event_relevance_profile (stored in
 * brand_assets.event_relevance_profile) when available, otherwise falls back
 * to tag matching against the channel's niche/industry/keywords.
 */

import { db } from '../db/index.js';
import { specialDays, customEvents } from '../db/schema.js';
import { and, eq, gte, lte, or, isNull } from 'drizzle-orm';

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreWithProfile(day, profile) {
  let score = 0;

  // Category weight from profile (e.g., "festival": 8)
  const catScore = profile[day.category] ?? profile.festival ?? 3;
  score += catScore;

  // Industry category bonus
  const catProfiles = profile.categories ?? {};
  for (const ic of day.industry_categories ?? []) {
    if (catProfiles[ic]) score += catProfiles[ic] * 0.5;
  }

  return Math.min(10, Math.round(score));
}

function scoreWithTags(day, channel) {
  if (!channel) return 3;

  const corpus = [
    channel.niche,
    channel.industry,
    channel.brand_description,
    channel.target_audience,
    ...(channel.products ?? []),
    ...(channel.tracked_keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let score = 0;
  let matchCount = 0;

  for (const tag of day.tags ?? []) {
    if (corpus.includes(tag.toLowerCase())) {
      score += 2;
      matchCount++;
    }
  }
  // Industry categories also count
  for (const ic of day.industry_categories ?? []) {
    if (corpus.includes(ic.toLowerCase())) {
      score += 1.5;
      matchCount++;
    }
  }

  if (day.category === 'national') score += 1;
  if (day.category === 'festival') score += 0.5;

  return matchCount === 0 ? 1 : Math.min(10, Math.round(score + (matchCount > 0 ? 2 : 0)));
}

function scoreRelevance(day, channel) {
  const profile = channel?.brand_assets?.event_relevance_profile;
  if (profile && typeof profile === 'object') {
    return scoreWithProfile(day, profile);
  }
  return scoreWithTags(day, channel);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get special days + custom events in a date range, scored against a channel.
 */
export async function getSpecialDaysInRange(from, to, channel = null, minRelevance = 0, orgId = null) {
  const fromDate = from;
  const toDate = to;

  // Query special_days table
  const sdRows = await db
    .select()
    .from(specialDays)
    .where(
      and(
        eq(specialDays.is_active, true),
        gte(specialDays.date, fromDate),
        lte(specialDays.date, toDate),
      ),
    )
    .limit(500);

  // Query custom_events for this org
  let ceRows = [];
  if (orgId) {
    ceRows = await db
      .select()
      .from(customEvents)
      .where(
        and(
          eq(customEvents.organization_id, orgId),
          eq(customEvents.is_active, true),
          gte(customEvents.date, fromDate),
          lte(customEvents.date, toDate),
          channel
            ? or(isNull(customEvents.channel_id), eq(customEvents.channel_id, channel.id))
            : isNull(customEvents.channel_id),
        ),
      )
      .limit(200);
  }

  const results = [];

  for (const row of sdRows) {
    const relevance = scoreRelevance(row, channel);
    if (relevance < minRelevance) continue;
    results.push({
      key: row.key,
      name: row.name,
      emoji: row.emoji ?? '📅',
      category: row.category,
      date: row.date,
      end_date: row.end_date ?? row.date,
      color: row.color ?? '#F59E0B',
      tags: row.tags ?? [],
      region: row.region ?? 'IN',
      industry_categories: row.industry_categories ?? [],
      content_ideas: row.content_ideas ?? [],
      relevance_score: relevance,
      source: row.source,
      is_custom: false,
    });
  }

  for (const row of ceRows) {
    results.push({
      key: `custom_${row.id}`,
      name: row.name,
      emoji: row.emoji ?? '📅',
      category: row.category ?? 'custom',
      date: row.date,
      end_date: row.end_date ?? row.date,
      color: row.color ?? '#6366F1',
      tags: [],
      region: 'custom',
      industry_categories: [],
      content_ideas: row.content_ideas ?? [],
      relevance_score: 10, // custom events are always max relevance
      source: 'custom',
      is_custom: true,
      id: row.id,
    });
  }

  return results.sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;
    return b.relevance_score - a.relevance_score;
  });
}

/**
 * Get upcoming special days (next N days) for alert strip.
 */
export async function getUpcomingSpecialDays(channel = null, daysAhead = 60, minRelevance = 3, orgId = null) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + daysAhead * 86400000);
  return getSpecialDaysInRange(
    from.toISOString().split('T')[0],
    to.toISOString().split('T')[0],
    channel,
    minRelevance,
    orgId,
  );
}

export const specialDaysService = { getSpecialDaysInRange, getUpcomingSpecialDays };
