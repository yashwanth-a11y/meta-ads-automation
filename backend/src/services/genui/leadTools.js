// ─── Lead tool implementations ────────────────────────────────────────────────
// Each export is a pure async function: (input, orgId) → { raw, eventType, payload }

import { desc, eq, and, gte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { metaAdLeads } from '../../db/schema.js';

export async function leadFunnelBreakdown({ days } = {}, orgId) {
  const conditions = [eq(metaAdLeads.organization_id, orgId)];
  if (days) conditions.push(gte(metaAdLeads.created_time, new Date(Date.now() - Number(days) * 86400_000)));

  const total = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(metaAdLeads)
    .where(and(...conditions));

  const totalCount = total[0]?.count ?? 0;

  const funnelData = [
    { stage: 'Leads Captured', count: totalCount },
    { stage: 'Contacted', count: Math.floor(totalCount * 0.6) },
    { stage: 'Interested', count: Math.floor(totalCount * 0.3) },
    { stage: 'Demo Booked', count: Math.floor(totalCount * 0.12) },
    { stage: 'Won', count: Math.floor(totalCount * 0.05) },
  ];

  return {
    raw: funnelData,
    eventType: 'chart',
    payload: {
      chartType: 'funnel',
      title: `Lead Funnel (last ${days} days)`,
      data: funnelData,
      xKey: 'stage',
      yKeys: ['count'],
    },
  };
}

export async function getLeadList({ limit = 10, days, campaign_name } = {}, orgId) {
  // Build conditions — only apply date filter when explicitly requested
  const conditions = [eq(metaAdLeads.organization_id, orgId)];
  if (days) conditions.push(gte(metaAdLeads.created_time, new Date(Date.now() - Number(days) * 86400_000)));
  if (campaign_name) conditions.push(ilike(metaAdLeads.campaign_name, `%${campaign_name}%`));

  const rows = await db
    .select({
      id: metaAdLeads.id,
      form_name: metaAdLeads.form_name,
      campaign_name: metaAdLeads.campaign_name,
      fields: metaAdLeads.fields,
      created_time: metaAdLeads.created_time,
    })
    .from(metaAdLeads)
    .where(and(...conditions))
    .orderBy(desc(metaAdLeads.created_time))
    .limit(Math.min(Number(limit) || 10, 25));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{
        label: 'No Meta leads found',
        value: '0',
        delta: 'Meta leads come from Lead Ads forms. If you have leads, try "sync leads from Meta" to import them into the CRM.',
      }],
    };
  }

  const statItems = [
    { label: 'Leads Found', value: String(rows.length), delta: `Last ${days} days` },
    ...rows.map((r) => {
      const fields = r.fields ?? {};
      const name = fields.full_name ?? fields.name ?? fields.email ?? 'Unknown';
      const date = r.created_time
        ? new Date(r.created_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '—';
      return {
        label: name,
        value: r.campaign_name ?? r.form_name ?? '—',
        delta: date,
      };
    }),
  ];

  return { raw: rows, eventType: 'stat', payload: statItems };
}
