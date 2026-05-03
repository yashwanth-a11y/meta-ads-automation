import { get, post } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStage = 'topic_selection' | 'content_review' | 'video_review'

export type ApprovalHistoryItem = {
  id: string
  stage: ApprovalStage
  action: string | null
  action_taken_at: string | null
  rejection_reason: string | null
  created_at: string
  approver_email: string
}

export type ApprovalBundle = {
  id: string
  hook: string
  script: string
  caption: string
  hashtags: string[]
  status: string
  video_url: string | null
  score_composite: string | null
}

export type Approval = {
  id: string
  organization_id: string
  creative_bundle_id: string | null
  approver_email: string
  stage: ApprovalStage
  action: string | null
  action_taken_at: string | null
  metadata: Record<string, unknown>
  expires_at: string
  created_at: string
  rejection_reason: string | null
  channel_name: string | null
  brand_name: string | null
  bundle: Pick<ApprovalBundle, 'id' | 'hook' | 'status' | 'video_url'> | null
}

// ─── API functions ────────────────────────────────────────────────────────────

export const approvalsApi = {
  list: () => get<Approval[]>('/approvals'),
  triggerPipeline: () => post<{ message: string }>('/approvals/pipeline/trigger'),
  takeAction: (id: string, action: 'approve' | 'reject' | 'regenerate', feedback?: string) =>
    post<{ ok: boolean; message: string }>(`/approvals/${id}/action`, { action, feedback }),
  selectTopic: (id: string, trendId: string) =>
    post<{ ok: boolean; message: string }>(`/approvals/${id}/select-topic`, { trend_id: trendId }),
  getBundleHistory: (bundleId: string) =>
    get<ApprovalHistoryItem[]>(`/approvals/bundle/${bundleId}/history`),
}
