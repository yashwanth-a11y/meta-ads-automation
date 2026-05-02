import { http, unwrap, get, post, patch, del } from './client'
import type {
  AccountBalance,
  AvailableAdAccount,
  CampaignList,
  CampaignSummary,
  ConnectAdAccountInput,
  CreateCampaignInput,
  CreateCampaignResult,
  CreateLeadFormInput,
  ImageUploadResult,
  InterestSuggestion,
  LeadForm,
  LocationSuggestion,
  OAuthCallbackResult,
  OAuthUrlResponse,
  SetupStatus,
  SwitchAdAccountInput,
  ValidateCampaignResult,
  ApiResponse,
} from './types'

// === SETUP / OAUTH ===

export const adsApi = {
  // --- Setup / OAuth ---
  getSetupStatus: () => get<SetupStatus>('/ads/setup/status'),
  getOAuthUrl: () => get<OAuthUrlResponse>('/ads/setup/oauth-url'),
  // Backend exchanges the auth code for a long-lived token and returns the
  // user's ad accounts + pages so the user can pick which one to connect.
  handleOAuthCallback: (code: string, state: string) =>
    post<OAuthCallbackResult>('/ads/setup/callback', { code, state }),
  connectAdAccount: (input: ConnectAdAccountInput) =>
    post<{ ad_account_id: string; ad_account_name?: string }>('/ads/setup/connect', input),
  switchAdAccount: (input: SwitchAdAccountInput) =>
    post<{ ad_account_id: string }>('/ads/setup/switch', input),
  getAvailableAdAccounts: () => get<AvailableAdAccount[]>('/ads/setup/ad-accounts'),
  getBalance: () => get<AccountBalance>('/ads/setup/balance'),
  disconnect: () => del<void>('/ads/setup/disconnect'),
  listAdAccounts: () => get<AvailableAdAccount[]>('/ads/accounts'),

  // --- Campaigns ---
  getCampaigns: (params?: { status?: string; search?: string; page?: number; limit?: number }) =>
    get<CampaignList>('/ads/campaigns', { params }),
  getCampaign: (id: string) => get<CampaignSummary>(`/ads/campaigns/${id}`),
  createCampaign: (input: CreateCampaignInput) =>
    // Custom unwrap: the backend may return `warning` alongside `data`.
    unwrap<CreateCampaignResult>(
      http.post<ApiResponse<CreateCampaignResult>>('/ads/campaigns', input).then((res) => {
        const body = res.data
        if (body && typeof body === 'object' && 'success' in body && body.success && 'warning' in body) {
          ;(body.data as CreateCampaignResult).warning = (body as { warning?: string }).warning
        }
        return res
      }),
    ),
  validateCampaign: (input: CreateCampaignInput) =>
    post<ValidateCampaignResult>('/ads/campaigns/validate', input),
  updateCampaign: (
    id: string,
    body: { name?: string; status?: string; daily_budget?: number; end_date?: string },
  ) => patch<CampaignSummary>(`/ads/campaigns/${id}`, body),
  deleteCampaign: (id: string) => del<void>(`/ads/campaigns/${id}`),
  syncCampaign: (id: string) => post<CampaignSummary>(`/ads/campaigns/${id}/sync`),
  duplicateCampaign: (id: string) => post<CampaignSummary>(`/ads/campaigns/${id}/duplicate`),

  // Direct Meta-side status flip (pause/resume/edit) — uses Meta IDs, not our row IDs.
  updateMetaCampaignStatus: (metaCampaignId: string, status: 'ACTIVE' | 'PAUSED') =>
    post<unknown>(`/ads/meta-campaigns/${metaCampaignId}`, { status }),
  updateMetaAdSet: (metaAdSetId: string, body: { status?: 'ACTIVE' | 'PAUSED' }) =>
    post<unknown>(`/ads/meta-adsets/${metaAdSetId}`, body),
  updateMetaAd: (metaAdId: string, body: { status?: 'ACTIVE' | 'PAUSED'; name?: string }) =>
    post<unknown>(`/ads/meta-ads/${metaAdId}`, body),

  // --- Search ---
  searchInterests: (query: string) =>
    post<{ data: InterestSuggestion[] }>('/ads/search/interests', { query }),
  searchLocations: (query: string) =>
    post<{ data: LocationSuggestion[] }>('/ads/search/locations', { query }),

  // --- Lead Gen forms ---
  getLeadForms: () => get<{ data: LeadForm[] }>('/ads/leads/forms'),
  createLeadForm: (input: CreateLeadFormInput) => post<LeadForm>('/ads/lead-forms', input),

  // --- Image upload ---
  uploadAdImage: (imageUrl: string) =>
    post<ImageUploadResult>('/ads/upload-image', { image_url: imageUrl }),
  // Backend forwards Meta's raw response, which is nested:
  //   { images: { "<filename>": { hash, url, width, height, ... } } }
  // We flatten it here so callers always see the friendlier shape:
  //   { hash, url, width, height }
  // (If the backend ever flattens this server-side later, this code still
  // works — it just falls through to the already-flat object.)
  uploadAdImageFile: async (file: File): Promise<ImageUploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    const raw = await unwrap<
      | ImageUploadResult
      | { images: Record<string, ImageUploadResult & { name?: string }> }
    >(
      http.post('/ads/upload-image-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      }),
    )
    if (raw && typeof raw === 'object' && 'images' in raw && raw.images) {
      const first = Object.values(raw.images)[0]
      if (!first?.hash) {
        throw new Error('Upload succeeded but Meta did not return an image hash.')
      }
      return first
    }
    if ((raw as ImageUploadResult)?.hash) return raw as ImageUploadResult
    throw new Error('Upload succeeded but the response did not contain an image hash.')
  },

  // --- Misc ---
  getBusinesses: () => get<{ data: unknown[] }>('/ads/businesses'),
  getFundingDetails: () => get<unknown>('/ads/funding'),
  getCampaignInsights: (id: string, range?: { start_date?: string; end_date?: string }) =>
    get<unknown>(`/ads/campaigns/${id}/insights`, { params: range }),
}

export default adsApi
