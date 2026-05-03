import { get } from './client'

export type AnalyticsDashboard = {
  range: { start: string; end: string; days: number }
  weeklyPerformance: { name: string; spend: number; conversations: number; v: number }[]
  campaignBars: { name: string; spend: number }[]
  leadSources: { name: string; value: number }[]
  totals: {
    spend: number
    clicks: number
    impressions: number
    messaging_conversations_from_insights: number
    ctwa_conversations_in_period: number
    avg_cpc: number | null
  }
  hasData: boolean
}

export const analyticsApi = {
  getDashboard: (days?: number) =>
    get<AnalyticsDashboard>('/analytics/dashboard', {
      params: days != null ? { days } : undefined,
    }),
}
