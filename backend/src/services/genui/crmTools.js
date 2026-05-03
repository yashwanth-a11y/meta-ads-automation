// ─── CRM tool implementations ─────────────────────────────────────────────────
import { desc, eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { crmLeads, crmPipelineStages, crmLeadActivities } from '../../db/schema.js';

export async function getCrmPipeline(_input, orgId) {
  const [stages, leads] = await Promise.all([
    db
      .select({ id: crmPipelineStages.id, name: crmPipelineStages.name, color: crmPipelineStages.color, position: crmPipelineStages.position, is_terminal_win: crmPipelineStages.is_terminal_win, is_terminal_loss: crmPipelineStages.is_terminal_loss })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.organization_id, orgId))
      .orderBy(crmPipelineStages.position),
    db
      .select({ stage_id: crmLeads.stage_id, count: sql`count(*)`.mapWith(Number) })
      .from(crmLeads)
      .where(eq(crmLeads.organization_id, orgId))
      .groupBy(crmLeads.stage_id),
  ]);

  if (!stages.length) {
    return {
      raw: { stages: [], leads: [] },
      eventType: 'stat',
      payload: [{ label: 'CRM Pipeline', value: 'Not configured', delta: 'Add pipeline stages in the CRM settings' }],
    };
  }

  const countMap = Object.fromEntries(leads.map((l) => [l.stage_id ?? 'unassigned', l.count]));
  const totalLeads = leads.reduce((s, l) => s + l.count, 0);

  const chartData = stages.map((s) => ({
    stage: s.name,
    Leads: countMap[s.id] ?? 0,
    terminal: s.is_terminal_win ? 'won' : s.is_terminal_loss ? 'lost' : 'active',
  }));

  const statItems = [
    { label: 'Total CRM Leads', value: String(totalLeads) },
    ...stages.map((s) => ({
      label: s.name + (s.is_terminal_win ? ' 🏆' : s.is_terminal_loss ? ' ✗' : ''),
      value: String(countMap[s.id] ?? 0),
      delta: s.is_terminal_win ? 'Won deals' : s.is_terminal_loss ? 'Lost deals' : 'In progress',
    })),
  ];

  return {
    raw: { stages, counts: countMap, total: totalLeads },
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: 'CRM Pipeline',
      data: chartData,
      xKey: 'stage',
      yKeys: ['Leads'],
    },
  };
}

export async function getCrmLeads({ limit = 10, stage_name, owner_email, overdue_followup } = {}, orgId) {
  const stages = await db
    .select({ id: crmPipelineStages.id, name: crmPipelineStages.name })
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.organization_id, orgId));
  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));

  let stageId = null;
  if (stage_name) {
    const found = stages.find((s) => s.name.toLowerCase().includes(stage_name.toLowerCase()));
    if (found) stageId = found.id;
  }

  const conditions = [eq(crmLeads.organization_id, orgId)];
  if (stageId) conditions.push(eq(crmLeads.stage_id, stageId));
  if (owner_email) conditions.push(eq(crmLeads.owner_email, owner_email));
  if (overdue_followup) conditions.push(sql`follow_up_at < now()`);

  const rows = await db
    .select({
      id: crmLeads.id,
      name: crmLeads.name,
      email: crmLeads.email,
      phone: crmLeads.phone,
      company: crmLeads.company,
      source: crmLeads.source,
      stage_id: crmLeads.stage_id,
      owner_email: crmLeads.owner_email,
      score: crmLeads.score,
      follow_up_at: crmLeads.follow_up_at,
      ai_summary: crmLeads.ai_summary,
      created_at: crmLeads.created_at,
    })
    .from(crmLeads)
    .where(and(...conditions))
    .orderBy(desc(crmLeads.created_at))
    .limit(Math.min(Number(limit) || 10, 25));

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'CRM Leads', value: '0', delta: stage_name ? `No leads in "${stage_name}" stage` : 'No leads found' }] };
  }

  const statItems = [
    { label: 'CRM Leads', value: String(rows.length), delta: stage_name ? `In stage: ${stage_name}` : 'Most recent first' },
    ...rows.slice(0, 8).map((r) => {
      const followUpStr = r.follow_up_at
        ? (new Date(r.follow_up_at) < new Date() ? '⚠️ Overdue: ' : 'Follow up: ') + new Date(r.follow_up_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : null;
      return {
        label: r.name + (r.company ? ` · ${r.company}` : ''),
        value: stageMap[r.stage_id] ?? 'Unassigned',
        delta: [r.email ?? r.phone ?? null, followUpStr, r.score ? `Score: ${r.score}` : null].filter(Boolean).join(' · '),
      };
    }),
  ];

  return { raw: rows.map((r) => ({ ...r, stage_name: stageMap[r.stage_id] ?? 'Unassigned' })), eventType: 'stat', payload: statItems };
}

// Mutating — surface action buttons only
export async function moveLeadStage(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}

export async function addLeadNote(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
