// ─── Campaign analytics tool implementations ──────────────────────────────────
// Each export is a pure async function: (input, orgId) → { raw, eventType, payload }

import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  ctwaCampaigns,
  ctwaInsightsCache,
  metaAdAccounts,
} from '../../db/schema.js';

export async function listCampaigns({ status = 'all', limit = 10 } = {}, orgId) {
  const rows = await db
    .select({
      id: ctwaCampaigns.id,
      name: ctwaCampaigns.name,
      status: ctwaCampaigns.status,
      objective: ctwaCampaigns.objective,
      daily_budget: ctwaCampaigns.daily_budget,
      meta_campaign_id: ctwaCampaigns.meta_campaign_id,
    })
    .from(ctwaCampaigns)
    .where(
      status === 'all'
        ? eq(ctwaCampaigns.organization_id, orgId)
        : and(eq(ctwaCampaigns.organization_id, orgId), eq(ctwaCampaigns.status, status)),
    )
    .orderBy(desc(ctwaCampaigns.created_at))
    .limit(Math.min(Number(limit) || 10, 50));

  const statItems = [
    { label: 'Total', value: String(rows.length) },
    { label: 'Active', value: String(rows.filter((r) => r.status === 'active').length) },
    { label: 'Paused', value: String(rows.filter((r) => r.status === 'paused').length) },
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}

export async function getCampaignPerformance({ campaign_id, days = 14 } = {}, orgId) {
  if (!campaign_id) return { raw: [], eventType: null, payload: null };

  const campaign = await db
    .select({ meta_campaign_id: ctwaCampaigns.meta_campaign_id, name: ctwaCampaigns.name })
    .from(ctwaCampaigns)
    .where(and(eq(ctwaCampaigns.id, campaign_id), eq(ctwaCampaigns.organization_id, orgId)))
    .limit(1);

  if (!campaign.length) return { raw: [], eventType: null, payload: null };

  const metaCampaignId = campaign[0].meta_campaign_id;
  const since = new Date(Date.now() - Number(days) * 86400_000);

  let rows = [];
  if (metaCampaignId) {
    rows = await db
      .select({
        date: ctwaInsightsCache.date,
        spend: ctwaInsightsCache.spend,
        clicks: ctwaInsightsCache.clicks,
        impressions: ctwaInsightsCache.impressions,
        ctr: ctwaInsightsCache.ctr,
      })
      .from(ctwaInsightsCache)
      .where(
        and(
          eq(ctwaInsightsCache.meta_campaign_id, metaCampaignId),
          gte(ctwaInsightsCache.date, since.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(ctwaInsightsCache.date);
  }

  return {
    raw: rows,
    eventType: 'chart',
    payload: {
      chartType: 'line',
      title: `Performance: ${campaign[0].name}`,
      data: rows.map((r) => ({
        date: r.date,
        Spend: Number(r.spend ?? 0),
        Clicks: Number(r.clicks ?? 0),
      })),
      xKey: 'date',
      yKeys: ['Spend', 'Clicks'],
      unit: '₹ / clicks',
    },
  };
}

export async function compareCampaigns({ campaign_ids = [], days = 14 } = {}, orgId) {
  const ids = Array.isArray(campaign_ids) ? campaign_ids.slice(0, 3) : [];
  if (ids.length < 2) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Compare Campaigns', value: '—', delta: 'Please provide at least 2 campaign IDs' }],
    };
  }

  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString().slice(0, 10);

  const chartData = await Promise.all(
    ids.map(async (id) => {
      const camp = await db
        .select({ name: ctwaCampaigns.name, meta_campaign_id: ctwaCampaigns.meta_campaign_id })
        .from(ctwaCampaigns)
        .where(and(eq(ctwaCampaigns.id, id), eq(ctwaCampaigns.organization_id, orgId)))
        .limit(1);

      if (!camp.length) return null;

      const { name, meta_campaign_id } = camp[0];
      if (!meta_campaign_id) return { name, Spend: 0, Clicks: 0 };

      const agg = await db
        .select({
          spend: sql`sum(spend)`.mapWith(Number),
          clicks: sql`sum(clicks)`.mapWith(Number),
        })
        .from(ctwaInsightsCache)
        .where(and(eq(ctwaInsightsCache.meta_campaign_id, meta_campaign_id), gte(ctwaInsightsCache.date, since)));

      return {
        name: name.length > 22 ? name.slice(0, 22) + '…' : name,
        Spend: Math.round(Number(agg[0]?.spend ?? 0)),
        Clicks: Number(agg[0]?.clicks ?? 0),
      };
    }),
  );

  const filtered = chartData.filter(Boolean);

  return {
    raw: filtered,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: `Campaign Comparison (last ${days} days)`,
      data: filtered,
      xKey: 'name',
      yKeys: ['Spend', 'Clicks'],
      unit: '₹ / clicks',
    },
  };
}

export async function getSpendSummary({ days = 30 } = {}, orgId) {
  const campaigns = await db
    .select({ meta_campaign_id: ctwaCampaigns.meta_campaign_id })
    .from(ctwaCampaigns)
    .where(eq(ctwaCampaigns.organization_id, orgId));

  const metaIds = campaigns.map((c) => c.meta_campaign_id).filter(Boolean);

  if (!metaIds.length) {
    return {
      raw: {},
      eventType: 'stat',
      payload: [{ label: 'Total Spend', value: '₹0', delta: 'No campaigns with Meta IDs found' }],
    };
  }

  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString().slice(0, 10);

  let totalSpend = 0;
  const daySet = new Set();
  for (const mid of metaIds) {
    const rows = await db
      .select({ spend: ctwaInsightsCache.spend, date: ctwaInsightsCache.date })
      .from(ctwaInsightsCache)
      .where(and(eq(ctwaInsightsCache.meta_campaign_id, mid), gte(ctwaInsightsCache.date, since)));
    for (const r of rows) {
      totalSpend += Number(r.spend ?? 0);
      daySet.add(r.date);
    }
  }
  const activeDays = daySet.size;
  const dailyAvg = activeDays > 0 ? totalSpend / activeDays : 0;
  const forecast30 = dailyAvg * 30;
  const sym = '₹';

  const statItems = [
    { label: `Total Spend (${days}d)`, value: `${sym}${totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, delta: `${activeDays} days with data` },
    { label: 'Daily Average', value: `${sym}${dailyAvg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, delta: 'based on active days' },
    { label: '30-day Forecast', value: `${sym}${forecast30.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, delta: 'at current daily avg' },
    { label: 'Campaigns Tracked', value: String(metaIds.length) },
  ];

  return { raw: { totalSpend, dailyAvg, forecast30, activeDays }, eventType: 'stat', payload: statItems };
}

export async function anomalyDetect({ metric = 'spend' } = {}, orgId) {
  const campaigns = await db
    .select({ id: ctwaCampaigns.id, name: ctwaCampaigns.name, meta_campaign_id: ctwaCampaigns.meta_campaign_id })
    .from(ctwaCampaigns)
    .where(and(eq(ctwaCampaigns.organization_id, orgId), eq(ctwaCampaigns.status, 'active')))
    .limit(10);

  if (!campaigns.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Anomalies Detected', value: '0', delta: 'No active campaigns' }],
    };
  }

  const metricCol = metric === 'ctr' ? ctwaInsightsCache.ctr
    : metric === 'cpc' ? ctwaInsightsCache.cpc
    : ctwaInsightsCache.spend;

  const anomalies = [];
  for (const campaign of campaigns) {
    if (!campaign.meta_campaign_id) continue;

    const rows = await db
      .select({ date: ctwaInsightsCache.date, value: metricCol })
      .from(ctwaInsightsCache)
      .where(
        and(
          eq(ctwaInsightsCache.meta_campaign_id, campaign.meta_campaign_id),
          gte(ctwaInsightsCache.date, new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10)),
        ),
      )
      .orderBy(ctwaInsightsCache.date);

    if (rows.length < 3) continue;

    const values = rows.map((r) => Number(r.value ?? 0));
    const baseline = values.slice(0, -2);
    const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
    const std = Math.sqrt(baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length) || 1;
    const recent = values[values.length - 1];

    if (Math.abs(recent - mean) > 2 * std) {
      anomalies.push({
        campaign: campaign.name,
        metric,
        recent: recent.toFixed(2),
        baseline: mean.toFixed(2),
        direction: recent > mean ? '↑' : '↓',
      });
    }
  }

  return {
    raw: anomalies,
    eventType: 'stat',
    payload: [
      { label: 'Anomalies Detected', value: String(anomalies.length) },
      ...anomalies.map((a) => ({
        label: a.campaign,
        value: `${a.direction} ${a.metric}: ${a.recent}`,
        delta: `Baseline: ${a.baseline}`,
      })),
    ],
  };
}

export async function getMetaAccountStatus(orgId) {
  const accounts = await db
    .select({
      ad_account_id: metaAdAccounts.ad_account_id,
      ad_account_name: metaAdAccounts.ad_account_name,
      currency: metaAdAccounts.currency,
      status: metaAdAccounts.status,
      balance_cache: metaAdAccounts.balance_cache,
      balance_last_synced: metaAdAccounts.balance_last_synced,
      token_expiry: metaAdAccounts.token_expiry,
      pixel_id: metaAdAccounts.pixel_id,
    })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.organization_id, orgId))
    .orderBy(desc(metaAdAccounts.created_at))
    .limit(1);

  if (!accounts.length) {
    return {
      raw: null,
      eventType: 'stat',
      payload: [{ label: 'Meta Account', value: 'Not Connected', delta: 'Go to Settings → Integrations to connect' }],
    };
  }

  const acc = accounts[0];
  const now = new Date();
  const expiry = acc.token_expiry ? new Date(acc.token_expiry) : null;
  const daysToExpiry = expiry ? Math.ceil((expiry - now) / 86400_000) : null;
  const currency = acc.currency ?? 'INR';
  const symbol = currency === 'INR' ? '₹' : `${currency} `;

  const statItems = [
    {
      label: 'Account',
      value: acc.ad_account_name ?? acc.ad_account_id,
      delta: acc.status === 'active' ? '✓ Connected' : '⚠ Inactive',
    },
    {
      label: 'Balance',
      value: acc.balance_cache != null
        ? `${symbol}${Number(acc.balance_cache).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
        : 'Not synced',
      delta: acc.balance_last_synced
        ? `Synced ${new Date(acc.balance_last_synced).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        : 'Sync pending',
    },
    {
      label: 'Token Expiry',
      value: expiry
        ? expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Unknown',
      delta: daysToExpiry != null
        ? daysToExpiry > 0 ? `Expires in ${daysToExpiry} days` : '⚠ Token expired'
        : '—',
    },
    {
      label: 'Meta Pixel',
      value: acc.pixel_id ?? 'Not set',
      delta: acc.pixel_id ? '✓ Configured' : 'Add pixel ID in Settings',
    },
  ];

  return { raw: acc, eventType: 'stat', payload: statItems };
}
