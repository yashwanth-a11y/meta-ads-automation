import { eq, and, gte, lte, desc, or, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { creativeBundles, channels, customEvents } from '../../db/schema.js';
import { getSpecialDaysInRange, getUpcomingSpecialDays } from '../../services/SpecialDaysService.js';

export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  // ── List calendar entries ─────────────────────────────────────────────────
  // GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&channel_id=xxx
  app.get('/', async (req) => {
    const { channel_id, from, to } = req.query ?? {};

    const conditions = [eq(creativeBundles.organization_id, orgId(req))];
    if (channel_id) conditions.push(eq(creativeBundles.channel_id, channel_id));

    if (from || to) {
      const fromDate = from ? new Date(from) : new Date('2000-01-01');
      const toDate = to ? new Date(to) : new Date('2099-12-31');
      conditions.push(
        or(
          and(gte(creativeBundles.scheduled_publish_at, fromDate), lte(creativeBundles.scheduled_publish_at, toDate)),
          and(gte(creativeBundles.created_at, fromDate), lte(creativeBundles.created_at, toDate)),
        ),
      );
    }

    const rows = await db
      .select()
      .from(creativeBundles)
      .where(and(...conditions))
      .orderBy(desc(creativeBundles.created_at))
      .limit(300);

    const channelIds = [...new Set(rows.map((r) => r.channel_id))];
    let channelMap = {};
    if (channelIds.length) {
      const chRows = await db
        .select({ id: channels.id, name: channels.name, brand_name: channels.brand_name })
        .from(channels)
        .where(eq(channels.organization_id, orgId(req)));
      channelMap = Object.fromEntries(chRows.map((c) => [c.id, c]));
    }

    return rows.map((r) => ({
      ...r,
      channel_name: channelMap[r.channel_id]?.brand_name || channelMap[r.channel_id]?.name || null,
      effective_date: r.scheduled_publish_at
        ? r.scheduled_publish_at.toISOString().split('T')[0]
        : r.created_at.toISOString().split('T')[0],
    }));
  });

  // ── Special days in a date range ─────────────────────────────────────────
  // GET /api/v1/calendar/special-days?from=YYYY-MM-DD&to=YYYY-MM-DD&channel_id=xxx&min_relevance=3
  app.get('/special-days', async (req, reply) => {
    const { from, to, channel_id, min_relevance } = req.query ?? {};

    if (!from || !to) {
      return reply.code(400).send({ error: 'from and to query params required' });
    }

    let channel = null;
    if (channel_id) {
      const [ch] = await db
        .select()
        .from(channels)
        .where(and(eq(channels.id, channel_id), eq(channels.organization_id, orgId(req))));
      channel = ch ?? null;
    }

    const minScore = min_relevance ? parseInt(min_relevance, 10) : 0;
    const days = await getSpecialDaysInRange(from, to, channel, minScore, orgId(req));
    return { special_days: days };
  });

  // ── Upcoming special days (next 60 days) for the alert strip ─────────────
  // GET /api/v1/calendar/upcoming-events?channel_id=xxx&days=60
  app.get('/upcoming-events', async (req) => {
    const { channel_id, days } = req.query ?? {};

    let channel = null;
    if (channel_id) {
      const [ch] = await db
        .select()
        .from(channels)
        .where(and(eq(channels.id, channel_id), eq(channels.organization_id, orgId(req))));
      channel = ch ?? null;
    }

    const upcoming = await getUpcomingSpecialDays(channel, parseInt(days ?? '60', 10), 3, orgId(req));
    return { upcoming };
  });

  // ── Sync holidays from external source ───────────────────────────────────
  // POST /api/v1/calendar/sync-holidays?year=2026&country=IN
  app.post('/sync-holidays', async (req, reply) => {
    const { year, country } = req.query ?? {};
    const { holidayFetchService } = await import('../../services/HolidayFetchService.js');
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const targetCountry = country ?? 'IN';

    try {
      const result = await holidayFetchService.syncForYear(targetCountry, targetYear);
      return reply.code(200).send({ success: true, ...result });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Reschedule a bundle ───────────────────────────────────────────────────
  app.patch('/:bundleId/schedule', async (req, reply) => {
    const { scheduled_publish_at } = req.body ?? {};
    const scheduledAt = scheduled_publish_at ? new Date(scheduled_publish_at) : null;

    const [updated] = await db
      .update(creativeBundles)
      .set({ scheduled_publish_at: scheduledAt, updated_at: new Date() })
      .where(
        and(
          eq(creativeBundles.id, req.params.bundleId),
          eq(creativeBundles.organization_id, orgId(req)),
        ),
      )
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Bundle not found' });
    return updated;
  });

  // ── Publish a bundle immediately ──────────────────────────────────────────
  app.post('/:bundleId/publish', async (req, reply) => {
    const [bundle] = await db
      .select()
      .from(creativeBundles)
      .where(
        and(
          eq(creativeBundles.id, req.params.bundleId),
          eq(creativeBundles.organization_id, orgId(req)),
        ),
      );

    if (!bundle) return reply.code(404).send({ error: 'Bundle not found' });

    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, bundle.channel_id));

    if (!channel) return reply.code(404).send({ error: 'Channel not found' });

    const { publishingService } = await import('../../services/PublishingService.js');
    const result = await publishingService.publishBundle(channel, bundle);

    await db
      .update(creativeBundles)
      .set({ published_at: new Date(), updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    return reply.code(200).send(result);
  });

  // ── Generate content idea for a special day ───────────────────────────────
  // POST /api/v1/calendar/special-days/generate-idea
  app.post('/special-days/generate-idea', async (req, reply) => {
    const { channel_id, special_day_name, content_ideas, date } = req.body ?? {};
    if (!channel_id) return reply.code(400).send({ error: 'channel_id required' });

    const [channel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.id, channel_id), eq(channels.organization_id, orgId(req))));

    if (!channel) return reply.code(404).send({ error: 'Channel not found' });

    const { env } = await import('../../config/env.js');
    if (!env.OPENAI_API_KEY) return reply.code(503).send({ error: 'OPENAI_API_KEY not set' });

    const ideasList = (content_ideas ?? []).slice(0, 5).join('; ');
    const prompt = `You are a social media content strategist for ${channel.brand_name} (${channel.niche || channel.industry || 'brand'}).
Create 3 specific content ideas for "${special_day_name}" on ${date}.
Brand tone: ${channel.tone || 'warm and professional'}.
Brand audience: ${channel.target_audience || 'general audience'}.
Seed ideas: ${ideasList || 'none'}.

Return JSON: { "ideas": [{ "title": string, "caption": string, "content_type": "reel|image_post|carousel", "hashtags": string[] }] }`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{"ideas":[]}');
    return reply.code(200).send({ ideas: parsed.ideas ?? [] });
  });

  // ── Custom events CRUD ────────────────────────────────────────────────────

  // GET /api/v1/calendar/custom-events?channel_id=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/custom-events', async (req) => {
    const { channel_id, from, to } = req.query ?? {};
    const conditions = [
      eq(customEvents.organization_id, orgId(req)),
      eq(customEvents.is_active, true),
    ];
    if (channel_id) {
      conditions.push(
        or(isNull(customEvents.channel_id), eq(customEvents.channel_id, channel_id)),
      );
    }
    if (from) conditions.push(gte(customEvents.date, from));
    if (to) conditions.push(lte(customEvents.date, to));

    return db.select().from(customEvents).where(and(...conditions)).orderBy(customEvents.date);
  });

  // POST /api/v1/calendar/custom-events
  app.post('/custom-events', async (req, reply) => {
    const { name, emoji, description, date, end_date, color, category, channel_id, is_recurring, content_ideas } = req.body ?? {};
    if (!name || !date) return reply.code(400).send({ error: 'name and date required' });

    const [row] = await db
      .insert(customEvents)
      .values({
        id: uuidv4(),
        organization_id: orgId(req),
        channel_id: channel_id ?? null,
        name,
        emoji: emoji ?? '📅',
        description: description ?? null,
        date,
        end_date: end_date ?? null,
        color: color ?? '#6366F1',
        category: category ?? 'custom',
        is_recurring: is_recurring ?? false,
        content_ideas: content_ideas ?? [],
        is_active: true,
      })
      .returning();

    return reply.code(201).send(row);
  });

  // PATCH /api/v1/calendar/custom-events/:id
  app.patch('/custom-events/:id', async (req, reply) => {
    const allowed = ['name', 'emoji', 'description', 'date', 'end_date', 'color', 'category', 'is_recurring', 'content_ideas', 'is_active'];
    const updates = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) updates[k] = req.body[k];
    }
    updates.updated_at = new Date();

    const [updated] = await db
      .update(customEvents)
      .set(updates)
      .where(and(eq(customEvents.id, req.params.id), eq(customEvents.organization_id, orgId(req))))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Event not found' });
    return updated;
  });

  // DELETE /api/v1/calendar/custom-events/:id
  app.delete('/custom-events/:id', async (req, reply) => {
    const [deleted] = await db
      .update(customEvents)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(customEvents.id, req.params.id), eq(customEvents.organization_id, orgId(req))))
      .returning();

    if (!deleted) return reply.code(404).send({ error: 'Event not found' });
    return reply.code(204).send();
  });
}
