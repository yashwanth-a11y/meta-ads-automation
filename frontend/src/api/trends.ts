import { get, post, patch, del } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChannelApprover = {
  email: string
  role: 'approver' | 'reviewer'
}

export type ChannelTrendSources = {
  rss: boolean
  google_trends: boolean
  reddit: boolean
  product_hunt: boolean
  youtube: boolean
  twitter: boolean
}

export type Channel = {
  id: string
  name: string
  brand_name: string
  brand_description: string | null
  industry: string | null
  niche: string | null
  tone: string | null
  language: string
  target_audience: string | null
  products: string[]
  competitors: string[]
  tracked_keywords: string[]
  blocked_topics: string[]
  brand_assets: {
    approvers?: ChannelApprover[]
    examples?: unknown[]
    tracked_x_accounts?: string[]
    watched_websites?: string[]
    [key: string]: unknown
  }
  instagram_account_id: string | null
  approval_mode: 'manual' | 'auto'
  auto_publish_threshold: string
  topic_cooldown_days: number
  posting_schedule: string
  trend_sources: Partial<ChannelTrendSources>
  custom_labels: string[]
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export type CreateChannelInput = {
  name: string
  brand_name: string
  brand_description?: string
  industry?: string
  niche?: string
  tone?: string
  language?: string
  target_audience?: string
  products?: string[]
  blocked_topics?: string[]
}

export type ChannelUpdateInput = Partial<{
  name: string
  brand_name: string
  brand_description: string
  industry: string
  niche: string
  tone: string
  language: string
  target_audience: string
  products: string[]
  competitors: string[]
  tracked_keywords: string[]
  blocked_topics: string[]
  brand_assets: Record<string, unknown>
  instagram_account_id: string
  approval_mode: 'manual' | 'auto'
  auto_publish_threshold: string
  topic_cooldown_days: number
  posting_schedule: string
  trend_sources: Partial<ChannelTrendSources>
  custom_labels: string[]
  status: 'active' | 'inactive'
}>

export type EmotionalDNA = {
  core_emotion: string
  visual_signature: string
  themes: string[]
  brand_fit_notes: string
}

export type TrendCandidate = {
  id: string
  title: string
  summary: string | null
  source_name: string
  source_type: string
  classification: 'topic' | 'format_template' | 'brand_news' | 'noise' | null
  lifecycle_stage: 'seed' | 'sprout' | 'peak' | 'saturated'
  emotional_dna: EmotionalDNA | null
  velocity_score: string | null
  custom_labels: string[]
  ingested_at: string
}

export type BrandFit = {
  composite_score: number
  emotional_alignment: number
  audience_fit: number
  adaptation_ease: number
  risk_score: number
  adaptation_idea: string | null
}

export type TrendWithScore = TrendCandidate & { brand_fit: BrandFit }

export type QualityScores = {
  trend_relevance: number
  viral_hook: number
  clarity: number
  audience_fit: number
  platform_fit: number
  brand_safety: number
  composite: number
  rationale: string
}

export type CreativeBundle = {
  id: string
  hook: string
  script: string
  voiceover_text: string
  caption: string
  hashtags: string[]
  scene_prompts: string[]
  cta: string
  status: string
  quality_scores: QualityScores | null
}

export type PipelineResult = {
  ingested: number
  skipped: number
  classified: number
  scored: number
  errors?: string[]
}

// ─── API functions ────────────────────────────────────────────────────────────

export type XHandleVerification = { valid: boolean; name?: string; username?: string }

export const trendsApi = {
  listChannels: () => get<Channel[]>('/channels'),
  verifyXHandle: (handle: string) =>
    get<XHandleVerification>(`/trends/verify-x-handle/${encodeURIComponent(handle)}`),
  createChannel: (data: CreateChannelInput) => post<Channel>('/channels', data),
  updateChannel: (id: string, data: ChannelUpdateInput) =>
    patch<Channel>(`/channels/${id}`, data),
  deleteChannel: (id: string) => del<void>(`/channels/${id}`),
  runPipeline: () => post<PipelineResult>('/trends/ingest/run'),
  getTopTrends: (channelId: string, minScore = 5, limit = 12) =>
    get<TrendWithScore[]>(`/trends/channels/${channelId}/top?min_score=${minScore}&limit=${limit}`),
  generateBundle: (channelId: string, trendCandidateId: string) =>
    post<CreativeBundle>(`/trends/channels/${channelId}/generate`, {
      trend_candidate_id: trendCandidateId,
    }),
  updateLabels: (candidateId: string, labels: string[]) =>
    patch<TrendCandidate>(`/trends/candidates/${candidateId}/labels`, { custom_labels: labels }),
  generateChannelLabels: (channelId: string) =>
    post<{ labels: string[] }>(`/channels/${channelId}/generate-labels`, {}),
  updateChannelLabels: (channelId: string, labels: string[]) =>
    patch<Channel>(`/channels/${channelId}`, { custom_labels: labels }),
}
