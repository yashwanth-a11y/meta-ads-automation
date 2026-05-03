import { get, post } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStage = 'topic_selection' | 'content_review' | 'video_review'

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
  resend: (id: string) => post<{ resent: boolean }>(`/approvals/${id}/resend`),
  triggerPipeline: () => post<{ message: string }>('/approvals/pipeline/trigger'),
  sendTopics: (channelId: string) =>
    post<{ sent: boolean; approvalId: string; trends_count: number }>(
      `/approvals/send-topics/${channelId}`,
    ),
}
