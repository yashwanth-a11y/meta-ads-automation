import { db } from '../../db/index.js';
import { specialDays, creativeBundles, channels } from '../../db/schema.js';
import { and, gte, lte, eq, inArray, desc } from 'drizzle-orm';

export async function getUpcomingEvents(input, _orgId) {
  const { days = 30, category } = input;
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const conditions = [
    gte(specialDays.date, today),
    lte(specialDays.date, until),
  ];
  if (category) conditions.push(eq(specialDays.category, category));

  const events = await db
    .select({
      id: specialDays.id,
      name: specialDays.name,
      emoji: specialDays.emoji,
      date: specialDays.date,
      end_date: specialDays.end_date,
      category: specialDays.category,
      content_ideas: specialDays.content_ideas,
      tags: specialDays.tags,
    })
    .from(specialDays)
    .where(and(...conditions))
    .orderBy(specialDays.date)
    .limit(25);

  return {
    raw: { events, count: events.length, days_ahead: days },
    eventType: null,
    payload: null,
  };
}

export async function getContentCalendar(input, orgId) {
  const { days = 14, status } = input;
  const now = new Date();
  const until = new Date(Date.now() + days * 86400000);

  const orgChannels = await db
    .select({ id: channels.id, name: channels.name, brand_name: channels.brand_name })
    .from(channels)
    .where(eq(channels.organization_id, orgId));

  if (!orgChannels.length) return { raw: { scheduled: [], published: [] }, eventType: null, payload: null };

  const channelIds = orgChannels.map((c) => c.id);
  const channelMap = Object.fromEntries(orgChannels.map((c) => [c.id, c.brand_name || c.name]));

  const conditions = [inArray(creativeBundles.channel_id, channelIds)];
  if (status) {
    conditions.push(eq(creativeBundles.status, status));
  } else {
    // Default: show scheduled (future) and recently published
    conditions.push(gte(creativeBundles.scheduled_publish_at, now));
    conditions.push(lte(creativeBundles.scheduled_publish_at, until));
  }

  const bundles = await db
    .select({
      id: creativeBundles.id,
      channel_id: creativeBundles.channel_id,
      content_type: creativeBundles.content_type,
      hook: creativeBundles.hook,
      status: creativeBundles.status,
      score_composite: creativeBundles.score_composite,
      scheduled_publish_at: creativeBundles.scheduled_publish_at,
      published_at: creativeBundles.published_at,
    })
    .from(creativeBundles)
    .where(and(...conditions))
    .orderBy(creativeBundles.scheduled_publish_at)
    .limit(30);

  const enriched = bundles.map((b) => ({ ...b, channel_name: channelMap[b.channel_id] ?? 'Unknown' }));

  return {
    raw: { scheduled: enriched, count: enriched.length },
    eventType: null,
    payload: null,
  };
}

export async function getRecentPublished(input, orgId) {
  const { limit = 10 } = input;

  const orgChannels = await db
    .select({ id: channels.id, brand_name: channels.brand_name })
    .from(channels)
    .where(eq(channels.organization_id, orgId));

  if (!orgChannels.length) return { raw: { posts: [] }, eventType: null, payload: null };

  const channelIds = orgChannels.map((c) => c.id);
  const channelMap = Object.fromEntries(orgChannels.map((c) => [c.id, c.brand_name]));

  const posts = await db
    .select({
      id: creativeBundles.id,
      channel_id: creativeBundles.channel_id,
      content_type: creativeBundles.content_type,
      hook: creativeBundles.hook,
      caption: creativeBundles.caption,
      score_composite: creativeBundles.score_composite,
      published_at: creativeBundles.published_at,
      published_targets: creativeBundles.published_targets,
    })
    .from(creativeBundles)
    .where(and(
      inArray(creativeBundles.channel_id, channelIds),
      eq(creativeBundles.status, 'published'),
    ))
    .orderBy(desc(creativeBundles.published_at))
    .limit(limit);

  return {
    raw: { posts: posts.map((p) => ({ ...p, channel_name: channelMap[p.channel_id] })), count: posts.length },
    eventType: null,
    payload: null,
  };
}
