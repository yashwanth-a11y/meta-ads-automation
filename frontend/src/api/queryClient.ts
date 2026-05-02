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
  leadForms: ['ads', 'lead-forms'] as const,
  audiences: ['ads', 'audiences'] as const,
  businesses: ['ads', 'businesses'] as const,
  funding: ['ads', 'funding'] as const,
  searchInterests: (q: string) => ['ads', 'search', 'interests', q] as const,
  searchLocations: (q: string) => ['ads', 'search', 'locations', q] as const,
}
