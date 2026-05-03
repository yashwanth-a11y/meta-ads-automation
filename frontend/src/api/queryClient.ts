import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

// Single QueryClient for the whole app. Defaults tuned for an admin/CRM
// workload — most data is mildly stale-tolerant; we only refetch on user
// action, not on window focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry 4xx (auth / validation / not-found).
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})

// Stable cache keys so multiple components fetching the same data share it.
export const qk = {
  setupStatus: ['ads', 'setup-status'] as const,
  balance: ['ads', 'balance'] as const,
  adAccounts: ['ads', 'ad-accounts'] as const,
  campaigns: (filters?: Record<string, unknown>) => ['ads', 'campaigns', filters] as const,
  campaign: (id: string) => ['ads', 'campaign', id] as const,
  campaignInsights: (id: string, range?: { start_date?: string; end_date?: string }) =>
    ['ads', 'campaign', id, 'insights', range] as const,
  metaCampaignAds: (metaCampaignId: string, datePreset?: string) =>
    ['ads', 'meta-campaign', metaCampaignId, 'ads', datePreset ?? null] as const,
  metaAdInsights: (
    metaAdId: string,
    range?: { date_preset?: string; start_date?: string; end_date?: string },
  ) =>
    [
      'ads',
      'meta-ad',
      metaAdId,
      'insights',
      range?.date_preset ?? null,
      range?.start_date ?? null,
      range?.end_date ?? null,
    ] as const,
  leadForms: ['ads', 'lead-forms'] as const,
  audiences: ['ads', 'audiences'] as const,
  businesses: ['ads', 'businesses'] as const,
  funding: ['ads', 'funding'] as const,
  searchInterests: (q: string) => ['ads', 'search', 'interests', q] as const,
  searchLocations: (q: string) => ['ads', 'search', 'locations', q] as const,
  channels: ['channels'] as const,
  bundleHistory: (bundleId: string) => ['approvals', 'history', bundleId] as const,
  approvals: ['approvals'] as const,
  topTrends: (channelId: string, minScore?: number) =>
    ['trends', 'top', channelId, minScore] as const,
  analyticsDashboard: (range?: { date_preset?: string; days?: number }) =>
    ['analytics', 'dashboard', range?.date_preset ?? null, range?.days ?? null] as const,
  analyticsTopAds: (range?: { date_preset?: string; days?: number; limit?: number }) =>
    [
      'analytics',
      'top-ads',
      range?.date_preset ?? null,
      range?.days ?? null,
      range?.limit ?? null,
    ] as const,
  analyticsCampaigns: (range?: { date_preset?: string; days?: number }) =>
    ['analytics', 'campaigns', range?.date_preset ?? null, range?.days ?? null] as const,
  crmStages: ['crm', 'stages'] as const,
  crmLeads: (filters?: Record<string, unknown>) => ['crm', 'leads', filters] as const,
  crmLead: (id: string) => ['crm', 'lead', id] as const,
  crmActivities: (leadId: string) => ['crm', 'activities', leadId] as const,
  crmSourceStats: ['crm', 'source-stats'] as const,
}
