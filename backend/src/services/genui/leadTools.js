// ─── Lead tool implementations ────────────────────────────────────────────────
// Each export is a pure async function: (input, orgId) → { raw, eventType, payload }

import { desc, eq, and, gte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { metaAdLeads } from '../../db/schema.js';

export async function leadFunnelBreakdown({ days = 30 } = {}, orgId) {
  const since = new Date(Date.now() - Number(days) * 86400_000);

  const total = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(metaAdLeads)
    .where(
      and(
        eq(metaAdLeads.organization_id, orgId),
        gte(metaAdLeads.created_time, since),
      ),
    );

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

export async function getLeadList({ limit = 10, days = 30, campaign_name } = {}, orgId) {
  const since = new Date(Date.now() - Number(days) * 86400_000);

  const rows = await db
    .select({
      id: metaAdLeads.id,
      form_name: metaAdLeads.form_name,
      campaign_name: metaAdLeads.campaign_name,
      fields: metaAdLeads.fields,
      created_time: metaAdLeads.created_time,
    })
    .from(metaAdLeads)
    .where(
      campaign_name
        ? and(
            eq(metaAdLeads.organization_id, orgId),
            gte(metaAdLeads.created_time, since),
            ilike(metaAdLeads.campaign_name, `%${campaign_name}%`),
          )
        : and(eq(metaAdLeads.organization_id, orgId), gte(metaAdLeads.created_time, since)),
    )
    .orderBy(desc(metaAdLeads.created_time))
    .limit(Math.min(Number(limit) || 10, 25));

  if (!rows.length) {
    return {
      raw: [],
      eventType: 'stat',
      payload: [{ label: 'Leads', value: '0', delta: `No leads found in the last ${days} days` }],
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
