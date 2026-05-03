// ─── Platform health / status tool implementation ─────────────────────────────
import { desc, eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  metaAdAccounts,
  instagramAccounts,
  channels,
  pipelineRuns,
  approvals,
  creativeBundles,
} from '../../db/schema.js';
import { env } from '../../config/env.js';

export async function getPlatformStatus(_input, orgId) {
  const [metaAccounts, igAccounts, channelRows, lastRun, pendingApprovals, pendingBundles] = await Promise.all([
    db.select({ id: metaAdAccounts.id, ad_account_name: metaAdAccounts.ad_account_name, status: metaAdAccounts.status, balance_cache: metaAdAccounts.balance_cache, token_expiry: metaAdAccounts.token_expiry, pixel_id: metaAdAccounts.pixel_id })
      .from(metaAdAccounts).where(and(eq(metaAdAccounts.organization_id, orgId), eq(metaAdAccounts.status, 'active'))).limit(1),

    db.select({ id: instagramAccounts.id, ig_username: instagramAccounts.ig_username, is_active: instagramAccounts.is_active, token_expires_at: instagramAccounts.token_expires_at })
      .from(instagramAccounts).where(and(eq(instagramAccounts.organization_id, orgId), eq(instagramAccounts.is_active, true))).limit(5),

    db.select({ id: channels.id, brand_name: channels.brand_name, status: channels.status })
      .from(channels).where(eq(channels.organization_id, orgId)).limit(10),

    db.select({ status: pipelineRuns.status, started_at: pipelineRuns.started_at, completed_at: pipelineRuns.completed_at, scored: pipelineRuns.scored })
      .from(pipelineRuns).orderBy(desc(pipelineRuns.started_at)).limit(1),

    db.select({ count: metaAdAccounts.id })
      .from(approvals)
      .where(and(eq(approvals.organization_id, orgId), isNull(approvals.action_taken_at)))
      .limit(1),

    db.select({ count: creativeBundles.id })
      .from(creativeBundles)
      .where(and(eq(creativeBundles.organization_id, orgId), eq(creativeBundles.status, 'ready')))
      .limit(1),
  ]);

  // Meta Ads connection
  const meta = metaAccounts[0] ?? null;
  const metaTokenExpiry = meta?.token_expiry ? new Date(meta.token_expiry) : null;
  const metaDaysToExpiry = metaTokenExpiry ? Math.ceil((metaTokenExpiry.getTime() - Date.now()) / 86400000) : null;
  const metaStatus = !meta ? '✗ Not connected' : metaDaysToExpiry !== null && metaDaysToExpiry <= 0 ? '⚠️ Token expired' : metaDaysToExpiry !== null && metaDaysToExpiry <= 7 ? `⚠️ Token expires in ${metaDaysToExpiry}d` : '✓ Connected';

  // Instagram connections
  const igConnected = igAccounts.length;
  const igExpiringSoon = igAccounts.filter((a) => {
    if (!a.token_expires_at) return false;
    const days = Math.ceil((new Date(a.token_expires_at).getTime() - Date.now()) / 86400000);
    return days <= 14;
  }).length;
  const igStatus = igConnected === 0 ? '✗ Not connected' : igExpiringSoon > 0 ? `⚠️ ${igExpiringSoon} token(s) expiring soon` : `✓ ${igConnected} account${igConnected !== 1 ? 's' : ''} connected`;

  // AI services
  const aiStatus = env.OPENAI_API_KEY ? '✓ Configured' : '✗ OPENAI_API_KEY not set';

  // Pipeline
  const lr = lastRun[0] ?? null;
  let pipelineStatus = 'No runs yet';
  if (lr) {
    const hoursAgo = lr.completed_at ? Math.floor((Date.now() - new Date(lr.completed_at).getTime()) / 3600000) : null;
    pipelineStatus = lr.status === 'done'
      ? `✓ Last run ${hoursAgo !== null ? hoursAgo + 'h ago' : ''} · ${lr.scored ?? 0} trends scored`
      : lr.status === 'running' ? '⏳ Currently running'
      : '✗ Last run failed';
  }

  // Active channels
  const activeChannels = channelRows.filter((c) => c.status === 'active').length;

  // Action items
  const actionItems = [
    !meta && 'Connect your Meta Ads account',
    metaDaysToExpiry !== null && metaDaysToExpiry <= 7 && metaDaysToExpiry > 0 && `Renew Meta token (expires in ${metaDaysToExpiry} days)`,
    igExpiringSoon > 0 && `Renew ${igExpiringSoon} Instagram token(s)`,
    !env.OPENAI_API_KEY && 'Set OPENAI_API_KEY to enable AI features',
  ].filter(Boolean);

  const statItems = [
    { label: '🔗 Meta Ads', value: metaStatus, delta: meta ? [meta.ad_account_name ?? '', meta.balance_cache ? `Balance: ₹${Number(meta.balance_cache).toLocaleString('en-IN')}` : '', meta.pixel_id ? 'Pixel ✓' : 'No pixel'].filter(Boolean).join(' · ') : 'Go to Settings → Integrations' },
    { label: '📸 Instagram', value: igStatus, delta: igAccounts.length ? igAccounts.map((a) => `@${a.ig_username ?? '—'}`).join(', ') : '' },
    { label: '🤖 AI Services', value: aiStatus },
    { label: '⚙️ Channels', value: `${activeChannels} active`, delta: `${channelRows.length} total configured` },
    { label: '🔄 Pipeline', value: pipelineStatus },
    ...(actionItems.length ? [{ label: '⚠️ Action Required', value: `${actionItems.length} item${actionItems.length !== 1 ? 's' : ''}`, delta: actionItems.join(' · ') }] : [{ label: '✅ All Systems', value: 'Healthy', delta: 'No action needed' }]),
  ];

  return {
    raw: { meta: !!meta, ig_count: igConnected, ai: !!env.OPENAI_API_KEY, active_channels: activeChannels, last_pipeline: lr, action_items: actionItems },
    eventType: 'stat',
    payload: statItems,
  };
}
