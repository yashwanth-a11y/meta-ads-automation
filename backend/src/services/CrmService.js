import { eq, and, or, ilike, inArray, asc, desc, sql, isNull, isNotNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { crmPipelineStages, crmLeads, crmLeadActivities, metaAdLeads } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

const MODEL = 'gpt-4o-mini';

// Default stages seeded for new orgs
const DEFAULT_STAGES = [
  { name: 'New', color: '#6366F1', position: 0, is_terminal_win: false, is_terminal_loss: false },
  { name: 'Contacted', color: '#3B82F6', position: 1, is_terminal_win: false, is_terminal_loss: false },
  { name: 'Interested', color: '#F59E0B', position: 2, is_terminal_win: false, is_terminal_loss: false },
  { name: 'Demo Booked', color: '#8B5CF6', position: 3, is_terminal_win: false, is_terminal_loss: false },
  { name: 'Won', color: '#10B981', position: 4, is_terminal_win: true, is_terminal_loss: false },
  { name: 'Lost', color: '#EF4444', position: 5, is_terminal_win: false, is_terminal_loss: true },
];

// Simple lead score heuristic (0–100)
function _scoreSource(source) {
  const scores = {
    'Meta Lead Form': 60,
    'Partner Referral': 85,
    'Organic Search': 55,
    'Webinar': 70,
    'Cold Outreach': 30,
    'Direct': 65,
  };
  return scores[source] ?? 40;
}

async function _openaiJSON(systemPrompt, userPrompt) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

export class CrmService {
  // ─── Stages ───────────────────────────────────────────────────────────────

  async listStages(organizationId) {
    const stages = await db
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.organization_id, organizationId))
      .orderBy(asc(crmPipelineStages.position));

    // Seed defaults if org has no stages yet
    if (stages.length === 0) {
      return this._seedDefaultStages(organizationId);
    }
    return stages;
  }

  async _seedDefaultStages(organizationId) {
    const now = new Date();
    const rows = DEFAULT_STAGES.map((s) => ({
      id: uuidv4(),
      organization_id: organizationId,
      ...s,
      created_at: now,
      updated_at: now,
    }));
    await db.insert(crmPipelineStages).values(rows);
    return rows;
  }

  async createStage(organizationId, data) {
    const existing = await this.listStages(organizationId);
    const maxPos = existing.reduce((m, s) => Math.max(m, s.position), -1);
    const now = new Date();
    const row = {
      id: uuidv4(),
      organization_id: organizationId,
      name: data.name,
      color: data.color ?? '#6366F1',
      position: data.position ?? maxPos + 1,
      is_terminal_win: data.is_terminal_win ?? false,
      is_terminal_loss: data.is_terminal_loss ?? false,
      created_at: now,
      updated_at: now,
    };
    await db.insert(crmPipelineStages).values(row);
    return row;
  }

  async updateStage(organizationId, stageId, data) {
    const allowed = ['name', 'color', 'position', 'is_terminal_win', 'is_terminal_loss'];
    const patch = { updated_at: new Date() };
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    await db
      .update(crmPipelineStages)
      .set(patch)
      .where(and(eq(crmPipelineStages.organization_id, organizationId), eq(crmPipelineStages.id, stageId)));
    return this._getStage(organizationId, stageId);
  }

  async _getStage(organizationId, stageId) {
    const [row] = await db
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.organization_id, organizationId), eq(crmPipelineStages.id, stageId)));
    if (!row) throw notFound(`Stage ${stageId} not found`);
    return row;
  }

  async deleteStage(organizationId, stageId) {
    // Unassign leads in this stage before deleting
    await db
      .update(crmLeads)
      .set({ stage_id: null, updated_at: new Date() })
      .where(and(eq(crmLeads.organization_id, organizationId), eq(crmLeads.stage_id, stageId)));
    await db
      .delete(crmPipelineStages)
      .where(and(eq(crmPipelineStages.organization_id, organizationId), eq(crmPipelineStages.id, stageId)));
  }

  async reorderStages(organizationId, orderedIds) {
    const now = new Date();
    await Promise.all(
      orderedIds.map((id, position) =>
        db
          .update(crmPipelineStages)
          .set({ position, updated_at: now })
          .where(and(eq(crmPipelineStages.organization_id, organizationId), eq(crmPipelineStages.id, id))),
      ),
    );
    return this.listStages(organizationId);
  }

  // ─── Leads ────────────────────────────────────────────────────────────────

  async listLeads(organizationId, { page = 1, pageSize = 25, search, stageId, source, ownerEmail, followUpBefore, followUpAfter, sortBy = 'created_at', sortDir = 'desc' } = {}) {
    const conditions = [eq(crmLeads.organization_id, organizationId)];

    if (search) {
      conditions.push(
        or(
          ilike(crmLeads.name, `%${search}%`),
          ilike(crmLeads.email, `%${search}%`),
          ilike(crmLeads.phone, `%${search}%`),
          ilike(crmLeads.company, `%${search}%`),
        ),
      );
    }
    if (stageId) conditions.push(eq(crmLeads.stage_id, stageId));
    if (source) conditions.push(eq(crmLeads.source, source));
    if (ownerEmail) conditions.push(eq(crmLeads.owner_email, ownerEmail));
    if (followUpBefore) conditions.push(sql`${crmLeads.follow_up_at} <= ${new Date(followUpBefore)}`);
    if (followUpAfter) conditions.push(sql`${crmLeads.follow_up_at} >= ${new Date(followUpAfter)}`);

    const orderCol = {
      created_at: crmLeads.created_at,
      name: crmLeads.name,
      score: crmLeads.score,
      follow_up_at: crmLeads.follow_up_at,
    }[sortBy] ?? crmLeads.created_at;

    const orderFn = sortDir === 'asc' ? asc : desc;

    const offset = (page - 1) * pageSize;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(crmLeads)
        .where(and(...conditions))
        .orderBy(orderFn(orderCol))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql`count(*)::int` })
        .from(crmLeads)
        .where(and(...conditions)),
    ]);

    return {
      data: rows,
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    };
  }

  async getLead(organizationId, leadId) {
    const [row] = await db
      .select()
      .from(crmLeads)
      .where(and(eq(crmLeads.organization_id, organizationId), eq(crmLeads.id, leadId)));
    if (!row) throw notFound(`Lead ${leadId} not found`);
    return row;
  }

  async createLead(organizationId, data, actorEmail) {
    const now = new Date();
    const score = _scoreSource(data.source);
    const row = {
      id: uuidv4(),
      organization_id: organizationId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      company: data.company ?? null,
      source: data.source ?? null,
      stage_id: data.stage_id ?? null,
      owner_email: data.owner_email ?? null,
      tags: data.tags ?? [],
      score,
      follow_up_at: data.follow_up_at ? new Date(data.follow_up_at) : null,
      ai_summary: null,
      custom_fields: data.custom_fields ?? {},
      meta_lead_id: data.meta_lead_id ?? null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(crmLeads).values(row);

    await this._logActivity(row.id, organizationId, {
      type: 'created',
      body: `Lead created from source: ${data.source ?? 'manual'}`,
      actor_email: actorEmail ?? null,
    });

    return row;
  }

  async updateLead(organizationId, leadId, data, actorEmail) {
    await this.getLead(organizationId, leadId);

    const allowed = [
      'name', 'email', 'phone', 'company', 'source', 'stage_id', 'owner_email',
      'tags', 'score', 'follow_up_at', 'ai_summary', 'custom_fields',
    ];

    const patch = { updated_at: new Date() };
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    if (data.follow_up_at) patch.follow_up_at = new Date(data.follow_up_at);

    await db
      .update(crmLeads)
      .set(patch)
      .where(and(eq(crmLeads.organization_id, organizationId), eq(crmLeads.id, leadId)));

    return this.getLead(organizationId, leadId);
  }

  async deleteLead(organizationId, leadId) {
    await this.getLead(organizationId, leadId);
    await db.delete(crmLeadActivities).where(eq(crmLeadActivities.lead_id, leadId));
    await db
      .delete(crmLeads)
      .where(and(eq(crmLeads.organization_id, organizationId), eq(crmLeads.id, leadId)));
  }

  // ─── Notes & Activity ─────────────────────────────────────────────────────

  async addNote(organizationId, leadId, text, actorEmail) {
    await this.getLead(organizationId, leadId);
    return this._logActivity(leadId, organizationId, { type: 'note', body: text, actor_email: actorEmail });
  }

  async getActivities(organizationId, leadId) {
    await this.getLead(organizationId, leadId);
    return db
      .select()
      .from(crmLeadActivities)
      .where(and(eq(crmLeadActivities.lead_id, leadId), eq(crmLeadActivities.organization_id, organizationId)))
      .orderBy(desc(crmLeadActivities.created_at));
  }

  async _logActivity(leadId, organizationId, { type, body, actor_email, metadata }) {
    const row = {
      id: uuidv4(),
      lead_id: leadId,
      organization_id: organizationId,
      type,
      body: body ?? null,
      actor_email: actor_email ?? null,
      metadata: metadata ?? null,
      created_at: new Date(),
    };
    await db.insert(crmLeadActivities).values(row);
    return row;
  }

  // ─── Stage Change ──────────────────────────────────────────────────────────

  async changeStage(organizationId, leadId, stageId, actorEmail) {
    const lead = await this.getLead(organizationId, leadId);
    const [stage] = await db
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.organization_id, organizationId), eq(crmPipelineStages.id, stageId)));

    await this.updateLead(organizationId, leadId, { stage_id: stageId }, actorEmail);
    await this._logActivity(leadId, organizationId, {
      type: 'status_change',
      body: `Stage changed to "${stage?.name ?? stageId}"`,
      actor_email: actorEmail,
      metadata: { from_stage: lead.stage_id, to_stage: stageId },
    });
    return this.getLead(organizationId, leadId);
  }

  // ─── Assign ───────────────────────────────────────────────────────────────

  async assignLead(organizationId, leadId, ownerEmail, actorEmail) {
    await this.updateLead(organizationId, leadId, { owner_email: ownerEmail }, actorEmail);
    await this._logActivity(leadId, organizationId, {
      type: 'assign',
      body: `Assigned to ${ownerEmail}`,
      actor_email: actorEmail,
    });
    return this.getLead(organizationId, leadId);
  }

  // ─── Bulk Actions ──────────────────────────────────────────────────────────

  async bulkUpdateStage(organizationId, leadIds, stageId, actorEmail) {
    if (!leadIds?.length) return { updated: 0 };
    const now = new Date();
    await db
      .update(crmLeads)
      .set({ stage_id: stageId, updated_at: now })
      .where(and(eq(crmLeads.organization_id, organizationId), inArray(crmLeads.id, leadIds)));

    await Promise.all(
      leadIds.map((leadId) =>
        this._logActivity(leadId, organizationId, {
          type: 'status_change',
          body: `Stage changed (bulk action)`,
          actor_email: actorEmail,
        }),
      ),
    );
    return { updated: leadIds.length };
  }

  async bulkDelete(organizationId, leadIds) {
    if (!leadIds?.length) return { deleted: 0 };
    await db.delete(crmLeadActivities).where(inArray(crmLeadActivities.lead_id, leadIds));
    await db
      .delete(crmLeads)
      .where(and(eq(crmLeads.organization_id, organizationId), inArray(crmLeads.id, leadIds)));
    return { deleted: leadIds.length };
  }

  // ─── CSV Import ───────────────────────────────────────────────────────────

  async importCSV(organizationId, rows, actorEmail) {
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        if (!row.name) { skipped++; continue; }

        // Dedup check by phone or email within org
        if (row.phone || row.email) {
          const dupeConditions = [eq(crmLeads.organization_id, organizationId)];
          const matchConditions = [];
          if (row.phone) matchConditions.push(eq(crmLeads.phone, row.phone));
          if (row.email) matchConditions.push(ilike(crmLeads.email, row.email));
          if (matchConditions.length) dupeConditions.push(or(...matchConditions));

          const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads).where(and(...dupeConditions)).limit(1);
          if (existing) { skipped++; continue; }
        }

        await this.createLead(organizationId, {
          name: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          company: row.company ?? null,
          source: row.source ?? 'CSV Import',
          tags: row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [],
          owner_email: row.owner_email ?? null,
        }, actorEmail);
        imported++;
      } catch (err) {
        errors.push({ row: row.name, error: err.message });
      }
    }

    return { imported, skipped, errors };
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────

  async exportCSV(organizationId, filters = {}) {
    const result = await this.listLeads(organizationId, { ...filters, pageSize: 10000, page: 1 });
    const stages = await this.listStages(organizationId);
    const stageMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));

    const header = ['Name', 'Email', 'Phone', 'Company', 'Stage', 'Source', 'Owner', 'Tags', 'Score', 'Follow Up', 'Created'];
    const rows = result.data.map((l) => [
      l.name, l.email ?? '', l.phone ?? '', l.company ?? '',
      l.stage_id ? (stageMap[l.stage_id] ?? l.stage_id) : '',
      l.source ?? '', l.owner_email ?? '',
      Array.isArray(l.tags) ? l.tags.join('; ') : '',
      l.score,
      l.follow_up_at ? new Date(l.follow_up_at).toISOString().slice(0, 10) : '',
      new Date(l.created_at).toISOString().slice(0, 10),
    ]);

    return [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // ─── Meta Lead Sync ───────────────────────────────────────────────────────

  async syncFromMeta(organizationId, actorEmail) {
    const metaLeads = await db
      .select()
      .from(metaAdLeads)
      .where(eq(metaAdLeads.organization_id, organizationId));

    let imported = 0;
    let skipped = 0;

    for (const ml of metaLeads) {
      // Skip if already synced
      const [existing] = await db
        .select({ id: crmLeads.id })
        .from(crmLeads)
        .where(and(eq(crmLeads.organization_id, organizationId), eq(crmLeads.meta_lead_id, ml.id)))
        .limit(1);

      if (existing) { skipped++; continue; }

      // Extract name/email/phone from Meta lead fields jsonb
      const fields = ml.fields ?? {};
      const name = fields.full_name ?? fields.name ?? `Meta Lead ${ml.id.slice(-6)}`;
      const email = fields.email ?? null;
      const phone = fields.phone_number ?? fields.phone ?? null;

      await this.createLead(organizationId, {
        name,
        email,
        phone,
        source: 'Meta Lead Form',
        meta_lead_id: ml.id,
        custom_fields: {
          form_name: ml.form_name,
          ad_name: ml.ad_name,
          campaign_name: ml.campaign_name,
          adset_name: ml.adset_name,
        },
      }, actorEmail);
      imported++;
    }

    return { imported, skipped };
  }

  // ─── AI Summary ───────────────────────────────────────────────────────────

  async generateAISummary(organizationId, leadId, actorEmail) {
    const lead = await this.getLead(organizationId, leadId);
    const activities = await this.getActivities(organizationId, leadId);

    const context = [
      `Name: ${lead.name}`,
      lead.company && `Company: ${lead.company}`,
      lead.source && `Source: ${lead.source}`,
      lead.score && `Lead Score: ${lead.score}/100`,
      activities.length && `Recent activity:\n${activities.slice(0, 5).map((a) => `- [${a.type}] ${a.body}`).join('\n')}`,
    ].filter(Boolean).join('\n');

    const result = await _openaiJSON(
      'You are a sales assistant. Given a lead profile and recent activity, return a brief 2-3 sentence summary of the lead status and one specific recommended next action. Return JSON: { "summary": string, "next_action": string }',
      context,
    );

    const aiSummary = `${result.summary ?? ''}\n\n💡 Next action: ${result.next_action ?? ''}`.trim();

    await this.updateLead(organizationId, leadId, { ai_summary: aiSummary }, actorEmail);
    await this._logActivity(leadId, organizationId, {
      type: 'ai_summary',
      body: 'AI summary generated',
      actor_email: actorEmail,
    });

    return { summary: aiSummary };
  }

  // ─── Source Quality Stats ─────────────────────────────────────────────────

  async getSourceStats(organizationId) {
    const stages = await this.listStages(organizationId);
    const winStageIds = stages.filter((s) => s.is_terminal_win).map((s) => s.id);

    const all = await db
      .select({ source: crmLeads.source, stage_id: crmLeads.stage_id })
      .from(crmLeads)
      .where(and(eq(crmLeads.organization_id, organizationId), isNotNull(crmLeads.source)));

    const stats = {};
    for (const lead of all) {
      const src = lead.source;
      if (!stats[src]) stats[src] = { source: src, total: 0, won: 0 };
      stats[src].total++;
      if (winStageIds.includes(lead.stage_id)) stats[src].won++;
    }

    return Object.values(stats).map((s) => ({
      ...s,
      win_rate: s.total > 0 ? Math.round((s.won / s.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }
}

export const crmService = new CrmService();
