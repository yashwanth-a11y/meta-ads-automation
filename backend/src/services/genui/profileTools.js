// ─── Profile & channel config tool implementations ────────────────────────────
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, channels } from '../../db/schema.js';

export async function getUserProfile(_input, orgId) {
  // orgId === userId in this single-tenant setup
  const rows = await db
    .select({
      id: users.id,
      first_name: users.first_name,
      last_name: users.last_name,
      email: users.email,
      phone: users.phone,
      created_at: users.created_at,
      last_login_at: users.last_login_at,
    })
    .from(users)
    .where(eq(users.id, orgId))
    .limit(1);

  if (!rows.length) {
    return { raw: null, eventType: 'stat', payload: [{ label: 'Profile', value: 'Not found', delta: 'No user record found' }] };
  }

  const u = rows[0];
  const statItems = [
    { label: 'Name', value: `${u.first_name} ${u.last_name}` },
    { label: 'Email', value: u.email },
    { label: 'Phone', value: u.phone ?? '—' },
    { label: 'Member Since', value: u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
    { label: 'Last Login', value: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never' },
  ];

  return { raw: u, eventType: 'stat', payload: statItems };
}

export async function getChannelConfig({ channel_name } = {}, orgId) {
  let query = db
    .select({
      id: channels.id,
      name: channels.name,
      brand_name: channels.brand_name,
      niche: channels.niche,
      status: channels.status,
      language: channels.language,
      tone: channels.tone,
      posting_schedule: channels.posting_schedule,
      brand_assets: channels.brand_assets,
      audience_profile: channels.audience_profile,
      trend_sources: channels.trend_sources,
      content_guidelines: channels.content_guidelines,
    })
    .from(channels)
    .where(eq(channels.organization_id, orgId));

  const rows = await query.orderBy(channels.brand_name).limit(10);

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'Channels', value: '0', delta: 'No channels configured yet. Add one in Settings → Channels.' }] };
  }

  let filtered = rows;
  if (channel_name) {
    const lc = channel_name.toLowerCase();
    filtered = rows.filter((r) => (r.brand_name ?? r.name ?? '').toLowerCase().includes(lc));
    if (!filtered.length) filtered = rows;
  }

  const target = filtered[0];
  const src = target.trend_sources ?? {};
  const assets = target.brand_assets ?? {};

  const statItems = [
    { label: 'Channel', value: target.brand_name ?? target.name, delta: `Status: ${target.status ?? 'active'}` },
    { label: 'Niche', value: target.niche ?? '—', delta: `Language: ${target.language ?? 'en'} · Tone: ${target.tone ?? 'professional'}` },
    { label: 'Posting Schedule', value: target.posting_schedule ?? '3x / week' },
    { label: 'Trend Sources', value: [src.google_news !== false ? 'Google News ✓' : null, src.reddit !== false ? 'Reddit ✓' : null, src.twitter !== false ? 'Twitter ✓' : null, src.website !== false ? 'Website ✓' : null].filter(Boolean).join(' · ') || 'None' },
    ...(assets.logo_url ? [{ label: 'Brand Logo', value: assets.logo_url.length > 60 ? assets.logo_url.slice(0, 57) + '…' : assets.logo_url }] : []),
    { label: 'Content Guidelines', value: target.content_guidelines ? (target.content_guidelines.length > 100 ? target.content_guidelines.slice(0, 97) + '…' : target.content_guidelines) : '—' },
  ];

  return { raw: filtered, eventType: 'stat', payload: statItems };
}

// Mutating — surfaced as action buttons, never executed server-side
export async function updateUserProfile(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function updateChannelConfig(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
