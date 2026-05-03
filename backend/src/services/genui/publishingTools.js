// ─── Publishing / creative bundle tool implementations ────────────────────────
import { desc, eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeBundles, channels } from '../../db/schema.js';

export async function listCreativeBundles({ status, limit = 10, channel_name } = {}, orgId) {
  const orgChannels = await db
    .select({ id: channels.id, brand_name: channels.brand_name, name: channels.name })
    .from(channels)
    .where(eq(channels.organization_id, orgId));

  if (!orgChannels.length) return { raw: [], eventType: 'stat', payload: [{ label: 'Bundles', value: '0', delta: 'No channels configured' }] };

  let channelIds = orgChannels.map((c) => c.id);
  const channelMap = Object.fromEntries(orgChannels.map((c) => [c.id, c.brand_name ?? c.name]));

  if (channel_name) {
    const lc = channel_name.toLowerCase();
    const matched = orgChannels.filter((c) => (c.brand_name ?? c.name ?? '').toLowerCase().includes(lc));
    if (matched.length) channelIds = matched.map((c) => c.id);
  }

  const conditions = [
    inArray(creativeBundles.channel_id, channelIds),
    eq(creativeBundles.organization_id, orgId),
  ];
  if (status) conditions.push(eq(creativeBundles.status, status));

  const rows = await db
    .select({
      id: creativeBundles.id,
      channel_id: creativeBundles.channel_id,
      content_type: creativeBundles.content_type,
      hook: creativeBundles.hook,
      status: creativeBundles.status,
      score_composite: creativeBundles.score_composite,
      scheduled_publish_at: creativeBundles.scheduled_publish_at,
      published_at: creativeBundles.published_at,
      created_at: creativeBundles.created_at,
    })
    .from(creativeBundles)
    .where(and(...conditions))
    .orderBy(desc(creativeBundles.created_at))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'Bundles', value: '0', delta: status ? `No bundles with status '${status}'` : 'No bundles yet' }] };
  }

  const statusCounts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});

  const statItems = [
    { label: 'Bundles Found', value: String(rows.length), delta: Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(' · ') },
    ...rows.slice(0, 8).map((r) => ({
      label: channelMap[r.channel_id] ?? 'Unknown Channel',
      value: r.hook ? (r.hook.length > 60 ? r.hook.slice(0, 57) + '…' : r.hook) : `${r.content_type} bundle`,
      delta: `${r.status} · Score: ${r.score_composite ?? '—'} · ${r.scheduled_publish_at ? 'Scheduled: ' + new Date(r.scheduled_publish_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : r.published_at ? 'Published: ' + new Date(r.published_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Draft'}`,
    })),
  ];

  return { raw: rows.map((r) => ({ ...r, channel_name: channelMap[r.channel_id] ?? 'Unknown' })), eventType: 'stat', payload: statItems };
}

// Mutating tools — surface action buttons only
export async function publishToInstagram(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function scheduleInstagramPost(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
