import { get } from './client'

// === Shared range / preset values (mirror backend ALLOWED_DATE_PRESETS) ===

export const ANALYTICS_DATE_PRESETS = [
  'today',
  'yesterday',
  'last_3d',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'last_90d',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'maximum',
] as const

export type AnalyticsDatePreset = (typeof ANALYTICS_DATE_PRESETS)[number]

export type AnalyticsRange = {
  date_preset: AnalyticsDatePreset | null
  days: number | null
  start: string
  end: string
} | null

// === Dashboard ===

export type AnalyticsTotals = {
  spend: number
  impressions: number
  reach: number
  clicks: number
  unique_clicks: number
  ctr: number
  cpc: number | null
  cpm: number | null
  frequency: number | null
  results: number
  leads: number
  messaging_conversations: number
  purchases: number
  registrations: number
  link_clicks: number
}

export type AnalyticsTrendPoint = {
  date: string
  spend: number
  impressions: number
  clicks: number
  results: number
}

export type AnalyticsCampaignBar = { name: string; spend: number }

export type AnalyticsCampaignRow = {
  campaign_id: string
  campaign_name: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number | null
  cpm: number | null
  frequency: number | null
  results: number
  leads: number
  messaging_conversations: number
  purchases: number
  registrations: number
  link_clicks: number
}

export type AnalyticsPlatformRow = {
  name: string
  spend: number
  impressions: number
  clicks: number
  share: number
}

export type AnalyticsPlacementRow = {
  platform: string
  position: string
  name: string
  spend: number
  impressions: number
  clicks: number
}

export type AnalyticsDemoRow = {
  age: string
  gender: string
  spend: number
  impressions: number
  clicks: number
  results: number
}

export type AnalyticsCtwaSource = { name: string; value: number; count: number }

export type AnalyticsSectionErrors = Partial<
  Record<'daily' | 'campaigns' | 'platform' | 'placement' | 'demographic' | 'ctwa', { message: string; code: string | number | null }>
>

export type AnalyticsDashboard = {
  hasAccount: boolean
  currency: string | null
  adAccount: { id: string; name: string | null } | null
  range: AnalyticsRange
  totals: AnalyticsTotals | null
  trend: AnalyticsTrendPoint[]
  campaignBars: AnalyticsCampaignBar[]
  topCampaigns: AnalyticsCampaignRow[]
  platformBreakdown: AnalyticsPlatformRow[] | null
  placementBreakdown: AnalyticsPlacementRow[] | null
  demographicBreakdown: AnalyticsDemoRow[] | null
  ctwaSources: AnalyticsCtwaSource[]
  hasData: boolean
  sectionErrors: AnalyticsSectionErrors
}

export type AnalyticsCampaignsResponse = {
  hasAccount: boolean
  currency?: string | null
  range: AnalyticsRange
  campaigns: AnalyticsCampaignRow[]
}

export type AnalyticsTopAd = AnalyticsCampaignRow & {
  ad_id: string
  ad_name: string
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  thumbnail_url: string | null
  instagram_permalink_url: string | null
}

export type AnalyticsTopAdsResponse = {
  hasAccount: boolean
  currency?: string | null
  range: AnalyticsRange
  ads: AnalyticsTopAd[]
}

// === API methods ===

export type AnalyticsRangeQuery = {
  date_preset?: AnalyticsDatePreset
  days?: number
}

function rangeParams(q?: AnalyticsRangeQuery): Record<string, string | number> | undefined {
  if (!q) return undefined
  const out: Record<string, string | number> = {}
  if (q.date_preset) out.date_preset = q.date_preset
  if (q.days != null) out.days = q.days
  return Object.keys(out).length > 0 ? out : undefined
}

export const analyticsApi = {
  getDashboard: (q?: AnalyticsRangeQuery) =>
    get<AnalyticsDashboard>('/analytics/dashboard', { params: rangeParams(q) }),
  getCampaigns: (q?: AnalyticsRangeQuery) =>
    get<AnalyticsCampaignsResponse>('/analytics/campaigns', { params: rangeParams(q) }),
  getTopAds: (q?: AnalyticsRangeQuery & { limit?: number }) => {
    const params = rangeParams(q) ?? {}
    if (q?.limit != null) params.limit = q.limit
    return get<AnalyticsTopAdsResponse>('/analytics/ads/top', {
      params: Object.keys(params).length > 0 ? params : undefined,
    })
  },
}
