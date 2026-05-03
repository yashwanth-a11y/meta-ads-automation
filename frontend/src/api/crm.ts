import { get, post, patch, del, http } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrmStage = {
  id: string
  organization_id: string
  name: string
  color: string
  position: number
  is_terminal_win: boolean
  is_terminal_loss: boolean
  created_at: string
  updated_at: string
}

export type CrmLead = {
  id: string
  organization_id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  stage_id: string | null
  owner_email: string | null
  tags: string[]
  score: number
  follow_up_at: string | null
  ai_summary: string | null
  custom_fields: Record<string, unknown>
  meta_lead_id: string | null
  created_at: string
  updated_at: string
}

export type CrmActivity = {
  id: string
  lead_id: string
  organization_id: string
  type: 'note' | 'status_change' | 'assign' | 'score' | 'ai_summary' | 'meta_sync' | 'created'
  body: string | null
  actor_email: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type LeadsPage = {
  data: CrmLead[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type SourceStat = {
  source: string
  total: number
  won: number
  win_rate: number
}

export type LeadFilters = {
  page?: number
  page_size?: number
  search?: string
  stage_id?: string
  source?: string
  owner_email?: string
  follow_up_before?: string
  follow_up_after?: string
  sort_by?: 'created_at' | 'name' | 'score' | 'follow_up_at'
  sort_dir?: 'asc' | 'desc'
}

export type CreateLeadInput = {
  name: string
  email?: string
  phone?: string
  company?: string
  source?: string
  stage_id?: string
  owner_email?: string
  tags?: string[]
  follow_up_at?: string
  custom_fields?: Record<string, unknown>
}

// ─── API ──────────────────────────────────────────────────────────────────────

const qs = (params: Record<string, unknown>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

export const crmApi = {
  // Stages
  listStages: () => get<CrmStage[]>('/leads/stages'),
  createStage: (data: Partial<CrmStage>) => post<CrmStage>('/leads/stages', data),
  updateStage: (id: string, data: Partial<CrmStage>) => patch<CrmStage>(`/leads/stages/${id}`, data),
  deleteStage: (id: string) => del<void>(`/leads/stages/${id}`),
  reorderStages: (orderedIds: string[]) => post<CrmStage[]>('/leads/stages/reorder', { ordered_ids: orderedIds }),

  // Leads
  listLeads: (filters: LeadFilters = {}) => get<LeadsPage>(`/leads${qs(filters as Record<string, unknown>)}`),
  getLead: (id: string) => get<CrmLead>(`/leads/${id}`),
  createLead: (data: CreateLeadInput) => post<CrmLead>('/leads', data),
  updateLead: (id: string, data: Partial<CrmLead>) => patch<CrmLead>(`/leads/${id}`, data),
  deleteLead: (id: string) => del<void>(`/leads/${id}`),

  // Activities & Notes
  getActivities: (leadId: string) => get<CrmActivity[]>(`/leads/${leadId}/activities`),
  addNote: (leadId: string, text: string) => post<CrmActivity>(`/leads/${leadId}/notes`, { text }),

  // Stage / Assign
  changeStage: (leadId: string, stageId: string) => post<CrmLead>(`/leads/${leadId}/status`, { stage_id: stageId }),
  assignLead: (leadId: string, ownerEmail: string) => post<CrmLead>(`/leads/${leadId}/assign`, { owner_email: ownerEmail }),

  // AI
  generateAISummary: (leadId: string) => post<{ summary: string }>(`/leads/${leadId}/ai-summary`, {}),

  // Bulk
  bulkStage: (leadIds: string[], stageId: string) => post<{ updated: number }>('/leads/bulk', { action: 'stage', lead_ids: leadIds, stage_id: stageId }),
  bulkDelete: (leadIds: string[]) => post<{ deleted: number }>('/leads/bulk', { action: 'delete', lead_ids: leadIds }),

  // Import / Export / Sync
  importCSV: (rows: Record<string, string>[]) => post<{ imported: number; skipped: number; errors: unknown[] }>('/leads/import', { rows }),
  syncFromMeta: () => post<{ imported: number; skipped: number }>('/leads/sync-meta', {}),
  getSourceStats: () => get<SourceStat[]>('/leads/source-stats'),

  exportCSV: async (filters: LeadFilters = {}) => {
    const res = await http.get(`/leads/export${qs(filters as Record<string, unknown>)}`, { responseType: 'blob' })
    return res.data as Blob
  },
}
