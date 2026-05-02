// Types mirror backend response shapes from AdsController + MetaAdsApiService.
// Kept hand-written for v1; revisit once we have OpenAPI codegen.

export type AdAccountStatus = 'active' | 'expired' | 'disconnected'

export type SetupStatus = {
  connected: boolean
  ad_account_id?: string
  ad_account_name?: string
  page_id?: string
  page_name?: string
  waba_id?: string | null
  currency?: string
  status?: AdAccountStatus
}

export type OAuthUrlResponse = {
  url: string
  state: string
}

export type AvailableAdAccount = {
  id: string                // 'act_<numeric>' or numeric — backend should normalize
  account_id: string        // numeric
  name: string
  currency: string
  account_status: number    // Meta enum: 1=ACTIVE
  balance?: string | number
  amount_spent?: string | number
}

export type AvailablePage = {
  id: string
  name: string
  access_token?: string
  picture?: { data?: { url: string } }
  whatsapp_business_account?: { id: string; name?: string } | null
}

export type AvailableBusiness = {
  id: string
  name: string
  verification_status?: string
}

export type OAuthCallbackResult = {
  ad_accounts: AvailableAdAccount[]
  pages: AvailablePage[]
  businesses?: AvailableBusiness[]
  // Long-lived user access token, minted by the backend's code-exchange step.
  // Field name matches the backend response (`access_token`), NOT `user_access_token`.
  access_token: string
  // Which FB app issued the token — pass back on /connect so the backend
  // saves the correct oauth_app_id (multi-app environments).
  oauth_app_id?: string
  fb_user_id?: string
  expires_in?: number
}

export type ConnectAdAccountInput = {
  ad_account_id: string
  ad_account_name?: string
  page_id?: string
  page_name?: string
  waba_id?: string | null
  fb_user_id?: string | null
  access_token: string
  page_access_token?: string | null
  expires_in?: number | null
  pixel_id?: string | null
  currency?: string | null
  // Which FB app issued the token; backend persists it on meta_ad_accounts.
  oauth_app_id?: string
}

export type SwitchAdAccountInput = {
  ad_account_id: string
  ad_account_name?: string
  page_id?: string
  page_name?: string
  page_access_token?: string
  currency?: string
}

export type AccountBalance = {
  balance: string | number
  currency: string
  spend_cap?: string | number | null
  amount_spent?: string | number
}

// --- Campaign types ---

export type CampaignObjective =
  | 'OUTCOME_TRAFFIC_CTWA'         // legacy CTWA path (no WABA needed)
  | 'OUTCOME_ENGAGEMENT_CTWA'      // true CTWA when WABA linked
  | 'OUTCOME_TRAFFIC_WEBSITE'      // Website Traffic
  | 'OUTCOME_LEADS_ON_AD'          // Lead Gen with native form
  | 'OUTCOME_SALES_CATALOG'        // Catalog Sales (existing)

export type CampaignStatus =
  | 'active'
  | 'paused'
  | 'pending_review'
  | 'with_issues'
  | 'disapproved'
  | 'archived'
  | 'deleted'

export type CampaignSummary = {
  id: string
  organization_id: string
  ad_account_id: string
  meta_campaign_id?: string
  meta_adset_id?: string
  meta_creative_id?: string
  meta_ad_id?: string
  name: string
  status: CampaignStatus
  effective_status?: string
  objective?: string
  campaign_type?: string
  daily_budget?: number | null
  lifetime_budget?: number | null
  start_date?: string | null
  end_date?: string | null
  created_at: string
  updated_at: string
}

export type CampaignList = {
  campaigns: CampaignSummary[]
  total: number
  page: number
  limit: number
}

export type GeoLocations = {
  countries?: string[]
  regions?: { key: string; name?: string }[]
  cities?: { key: string; name?: string; radius?: number; distance_unit?: 'mile' | 'kilometer' }[]
  zips?: { key: string; name?: string }[]
}

export type TargetingSpec = {
  geo_locations?: GeoLocations
  age_min?: number
  age_max?: number
  genders?: number[]                       // 1=male, 2=female; omit for all
  interests?: { id: string; name: string }[]
  publisher_platforms?: string[]
  facebook_positions?: string[]
  instagram_positions?: string[]
  device_platforms?: string[]
  targeting_automation?: { advantage_audience?: 0 | 1 }
}

export type CreativeSpec = {
  // Common
  primary_text?: string
  headline?: string
  description?: string
  cta_type?: string
  // Image attach (one of)
  image_hash?: string
  image_url?: string
  // Video attach
  video_id?: string
  // Per-objective
  destination_url?: string                 // Website Traffic
  whatsapp_number?: string                 // CTWA (defaults to org phone)
  lead_gen_form_id?: string                // Lead Gen
  website_url?: string                     // Catalog
}

export type SpecialAdCategory =
  | 'NONE'
  | 'CREDIT'
  | 'EMPLOYMENT'
  | 'HOUSING'
  | 'ISSUES_ELECTIONS_POLITICS'
  | 'ONLINE_GAMBLING_AND_GAMING'
  | 'FINANCIAL_PRODUCTS_SERVICES'

export type CreateCampaignInput = {
  name: string
  objective?: CampaignObjective
  campaign_type?: string
  daily_budget?: number
  lifetime_budget?: number
  start_date?: string                      // ISO 8601
  end_date?: string                        // ISO 8601
  targeting_spec?: TargetingSpec
  creative_spec?: CreativeSpec
  special_ad_categories?: SpecialAdCategory[]
  // Lead Gen
  lead_gen_form_id?: string
  // CTWA
  flow_id?: string
  business_account_id?: string
  opening_message?: string
  // Catalog
  catalog_id?: string
  product_set_id?: string
  // Publish behavior
  publish?: boolean
}

export type CreateCampaignResult = CampaignSummary & {
  warning?: string
}

export type ValidateCampaignResult =
  | { ok: true; validated: ('campaign' | 'adset' | 'creative' | 'ad')[]; warnings?: string[] }
  | {
      ok: false
      step: 'campaign' | 'adset' | 'creative' | 'ad' | 'preflight'
      error: { code: number | string; user_message: string; field?: string; raw?: unknown }
    }

// --- Search ---

export type InterestSuggestion = {
  id: string
  name: string
  audience_size_lower_bound?: number
  audience_size_upper_bound?: number
  path?: string[]
}

export type LocationSuggestion = {
  key: string
  name: string
  type: string
  country_code?: string
  country_name?: string
  region?: string
}

// --- Lead forms ---

export type LeadFormQuestion = {
  type: string
  key?: string
  label?: string
  options?: { key: string; value: string }[]
}

export type LeadForm = {
  id: string
  name: string
  status?: string
  leads_count?: number
  created_time?: string
  questions?: LeadFormQuestion[]
}

export type CreateLeadFormInput = {
  name: string
  locale?: string
  questions: LeadFormQuestion[]
  privacy_policy: { url: string; link_text: string }
  follow_up_action_url?: string
  thank_you_page?: {
    title: string
    body?: string
    button_type?: string
    website_url?: string
  }
  context_card?: {
    title: string
    content?: string[]
    style?: string
    button_text?: string
  }
}

// --- Image upload ---

export type ImageUploadResult = {
  hash: string
  url?: string
  width?: number
  height?: number
}

// --- Generic API envelope ---

export type ApiSuccess<T> = { success: true; data: T; warning?: string; message?: string }
export type ApiFailure = {
  success: false
  error?: string
  message?: string
  details?: unknown
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
