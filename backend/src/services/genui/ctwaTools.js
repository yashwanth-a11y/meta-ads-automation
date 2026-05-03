// ─── CTWA (Click-to-WhatsApp) tool implementations ───────────────────────────
import { desc, eq, and, gte, sql, sum } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { ctwaCampaigns, ctwaConversations, ctwaInsightsCache } from '../../db/schema.js';

export async function getCtwaCampaigns({ status, limit = 10 } = {}, orgId) {
  const conditions = [eq(ctwaCampaigns.organization_id, orgId)];
  if (status) conditions.push(eq(ctwaCampaigns.status, status));

  const rows = await db
    .select({
      id: ctwaCampaigns.id,
      name: ctwaCampaigns.name,
      campaign_label: ctwaCampaigns.campaign_label,
      status: ctwaCampaigns.status,
      daily_budget: ctwaCampaigns.daily_budget,
      meta_campaign_id: ctwaCampaigns.meta_campaign_id,
      meta_ad_id: ctwaCampaigns.meta_ad_id,
      start_date: ctwaCampaigns.start_date,
      end_date: ctwaCampaigns.end_date,
    })
    .from(ctwaCampaigns)
    .where(and(...conditions))
    .orderBy(desc(ctwaCampaigns.created_at))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'CTWA Campaigns', value: '0', delta: 'No Click-to-WhatsApp campaigns found' }],
    };
  }

  const activeCount = rows.filter((r) => r.status === 'active').length;

  const statItems = [
    { label: 'CTWA Campaigns', value: String(rows.length), delta: `${activeCount} active` },
    ...rows.slice(0, 8).map((r) => ({
      label: r.campaign_label ?? r.name,
      value: r.status,
      delta: [
        r.daily_budget ? `₹${Number(r.daily_budget).toLocaleString('en-IN')}/day` : null,
        r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : null,
      ].filter(Boolean).join(' · '),
    })),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

export async function getCtwaPerformance({ days = 14, campaign_name } = {}, orgId) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Get org's CTWA campaign IDs
  const campaigns = await db
    .select({ id: ctwaCampaigns.id, name: ctwaCampaigns.name, campaign_label: ctwaCampaigns.campaign_label, meta_campaign_id: ctwaCampaigns.meta_campaign_id, meta_ad_id: ctwaCampaigns.meta_ad_id })
    .from(ctwaCampaigns)
    .where(eq(ctwaCampaigns.organization_id, orgId));

  if (!campaigns.length) {
    return { raw: {}, eventType: 'stat', payload: [{ label: 'CTWA Performance', value: 'No campaigns', delta: 'Set up a Click-to-WhatsApp campaign first' }] };
  }

  let filtered = campaigns;
  if (campaign_name) {
    const lc = campaign_name.toLowerCase();
    filtered = campaigns.filter((c) => (c.campaign_label ?? c.name ?? '').toLowerCase().includes(lc));
    if (!filtered.length) filtered = campaigns;
  }

  const metaAdIds = filtered.map((c) => c.meta_ad_id).filter(Boolean);
  const metaCampaignIds = filtered.map((c) => c.meta_campaign_id).filter(Boolean);

  // Aggregate insights from cache
  let insights = null;
  if (metaAdIds.length || metaCampaignIds.length) {
    const insightRows = await db
      .select({
        spend: sql`sum(${ctwaInsightsCache.spend})`.mapWith(Number),
        impressions: sql`sum(${ctwaInsightsCache.impressions})`.mapWith(Number),
        clicks: sql`sum(${ctwaInsightsCache.clicks})`.mapWith(Number),
        conversations: sql`sum(${ctwaInsightsCache.messaging_conversations_started})`.mapWith(Number),
        new_contacts: sql`sum(${ctwaInsightsCache.new_messaging_contacts})`.mapWith(Number),
      })
      .from(ctwaInsightsCache)
      .where(gte(ctwaInsightsCache.date, since));

    insights = insightRows[0] ?? null;
  }

  // Conversation counts
  const convRows = await db
    .select({ count: sql`count(*)`.mapWith(Number), converted: sql`count(*) filter (where converted_at is not null)`.mapWith(Number) })
    .from(ctwaConversations)
    .where(and(
      eq(ctwaConversations.organization_id, orgId),
      gte(ctwaConversations.initiated_at, new Date(Date.now() - days * 86400000)),
    ));

  const totalConvs = convRows[0]?.count ?? 0;
  const convertedConvs = convRows[0]?.converted ?? 0;
  const spend = insights?.spend ?? 0;
  const conversations = insights?.conversations ?? totalConvs;
  const cpConv = conversations > 0 && spend > 0 ? (spend / conversations).toFixed(2) : null;

  const statItems = [
    { label: 'CTWA Performance', value: `Last ${days} days`, delta: campaign_name ? `Campaign: ${filtered[0]?.campaign_label ?? filtered[0]?.name}` : `${filtered.length} campaign${filtered.length !== 1 ? 's' : ''}` },
    ...(insights ? [
      { label: 'Total Spend', value: `₹${spend.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, delta: `${(insights.impressions ?? 0).toLocaleString('en-IN')} impressions` },
      { label: 'Clicks', value: String(insights.clicks ?? 0), delta: `CTR: ${insights.impressions > 0 ? ((insights.clicks / insights.impressions) * 100).toFixed(2) : '0'}%` },
    ] : []),
    { label: 'WA Conversations Started', value: String(conversations), delta: cpConv ? `₹${cpConv} per conversation` : '' },
    { label: 'Conversions', value: String(convertedConvs), delta: `${totalConvs > 0 ? ((convertedConvs / totalConvs) * 100).toFixed(1) : '0'}% conversion rate` },
    ...(insights?.new_contacts ? [{ label: 'New Contacts', value: String(insights.new_contacts) }] : []),
  ];

  return {
    raw: { campaigns: filtered, insights, conversations: totalConvs, converted: convertedConvs },
    eventType: 'stat',
    payload: statItems,
  };
}
