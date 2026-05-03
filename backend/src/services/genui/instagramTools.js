// ─── Instagram account tool implementations ───────────────────────────────────
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { instagramAccounts, channelInstagramAccounts, channels } from '../../db/schema.js';

export async function getInstagramAccounts(_input, orgId) {
  const rows = await db
    .select({
      id: instagramAccounts.id,
      ig_username: instagramAccounts.ig_username,
      ig_name: instagramAccounts.ig_name,
      ig_business_id: instagramAccounts.ig_business_id,
      account_type: instagramAccounts.account_type,
      followers_count: instagramAccounts.followers_count,
      follows_count: instagramAccounts.follows_count,
      media_count: instagramAccounts.media_count,
      is_active: instagramAccounts.is_active,
      token_expires_at: instagramAccounts.token_expires_at,
      last_synced_at: instagramAccounts.last_synced_at,
    })
    .from(instagramAccounts)
    .where(and(eq(instagramAccounts.organization_id, orgId), eq(instagramAccounts.is_active, true)))
    .orderBy(instagramAccounts.ig_username)
    .limit(10);

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [
        { label: 'Instagram Accounts', value: '0 connected', delta: 'Connect your Instagram Business account via Settings → Integrations or type "connect instagram"' },
      ],
    };
  }

  const statItems = [
    { label: 'Instagram Accounts', value: String(rows.length), delta: 'Connected & active' },
    ...rows.map((r) => ({
      label: `@${r.ig_username ?? r.ig_business_id}`,
      value: `${(r.followers_count ?? 0).toLocaleString('en-IN')} followers`,
      delta: `${r.media_count ?? 0} posts · ${r.account_type ?? 'Business'} · ${r.is_active ? 'Active' : 'Inactive'}`,
    })),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

export async function getInstagramInsights({ account_username } = {}, orgId) {
  const conditions = [
    eq(instagramAccounts.organization_id, orgId),
    eq(instagramAccounts.is_active, true),
  ];

  const rows = await db
    .select({
      ig_username: instagramAccounts.ig_username,
      ig_name: instagramAccounts.ig_name,
      followers_count: instagramAccounts.followers_count,
      follows_count: instagramAccounts.follows_count,
      media_count: instagramAccounts.media_count,
      account_type: instagramAccounts.account_type,
      last_synced_at: instagramAccounts.last_synced_at,
      token_expires_at: instagramAccounts.token_expires_at,
    })
    .from(instagramAccounts)
    .where(and(...conditions))
    .limit(5);

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'No Instagram account connected', value: '—', delta: 'Connect one in Settings → Integrations' }] };
  }

  let target = rows[0];
  if (account_username) {
    const found = rows.find((r) => (r.ig_username ?? '').toLowerCase().includes(account_username.toLowerCase()));
    if (found) target = found;
  }

  const tokenExpiry = target.token_expires_at ? new Date(target.token_expires_at) : null;
  const daysToExpiry = tokenExpiry ? Math.ceil((tokenExpiry.getTime() - Date.now()) / 86400000) : null;

  const statItems = [
    { label: `@${target.ig_username ?? '—'}`, value: target.ig_name ?? '—', delta: target.account_type ?? 'Business' },
    { label: 'Followers', value: (target.followers_count ?? 0).toLocaleString('en-IN'), delta: `Following: ${(target.follows_count ?? 0).toLocaleString('en-IN')}` },
    { label: 'Total Posts', value: String(target.media_count ?? 0) },
    { label: 'Last Synced', value: target.last_synced_at ? new Date(target.last_synced_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never' },
    ...(daysToExpiry !== null ? [{ label: 'Token Status', value: daysToExpiry > 0 ? `Expires in ${daysToExpiry} days` : 'Expired', delta: daysToExpiry <= 7 ? '⚠️ Renew soon' : '✓ OK' }] : []),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

// Mutating — surface action buttons only
export async function connectInstagram(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function connectMetaAds(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
