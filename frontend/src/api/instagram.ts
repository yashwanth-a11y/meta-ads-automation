import { get, post, del } from './client'

export type InstagramAccount = {
  id: string
  organization_id: string
  ig_business_id: string
  ig_page_id: string | null
  ig_username: string | null
  ig_name: string | null
  ig_profile_picture_url: string | null
  account_type: string | null
  followers_count: number
  follows_count: number
  media_count: number
  token_expires_at: string | null
  last_synced_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type InstagramMediaChild = {
  id: string
  media_type: 'IMAGE' | 'VIDEO'
  media_url?: string
  permalink?: string
  thumbnail_url?: string
}

export type InstagramMediaItem = {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url?: string
  permalink: string
  timestamp: string
  thumbnail_url?: string
  media_product_type?: 'AD' | 'FEED' | 'STORY' | 'REELS'
  like_count?: number
  comments_count?: number
  is_comment_enabled?: boolean
  children?: { data: InstagramMediaChild[] }
}

export type InstagramMediaResponse = {
  data: InstagramMediaItem[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
    previous?: string
  }
}

// Normalized to a flat name→value map server-side. Values are numeric
// counts (or `null` when the metric is supported but no value was returned).
export type InstagramInsightValues = Record<string, number | null>

export type InstagramMediaInsightsResponse = {
  media_id: string
  media_type: InstagramMediaItem['media_type']
  media_product_type?: InstagramMediaItem['media_product_type']
  metrics: string[]
  insights: InstagramInsightValues
}

export const instagramApi = {
  getAuthUrl: () => {
    const origin = window.location.origin
    return get<{ authUrl: string; state: string; redirectUri: string }>(
      `/instagram/oauth/url?origin=${encodeURIComponent(origin)}`,
    )
  },
  // We deliberately do NOT pass redirect_uri here: Meta requires the
  // EXACT same URI used at /oauth/authorize, which is the env-configured
  // value the backend already knows. If we passed window.location.origin,
  // it'd mismatch (e.g. localhost:5173 after a ngrok→localhost bounce vs
  // the ngrok URL Meta actually saw).
  exchangeCode: (code: string) =>
    post<{ id: string; username: string; name: string; isNew: boolean }>(
      '/instagram/oauth/exchange',
      { code },
    ),
  listAccounts: () => get<InstagramAccount[]>('/instagram/accounts'),
  disconnectAccount: (accountId: string) =>
    del<undefined>(`/instagram/accounts/${accountId}`),
  refreshAccount: (accountId: string) =>
    post<undefined>(`/instagram/accounts/${accountId}/refresh`),
  getMedia: (accountId: string, opts: { limit?: number; after?: string } = {}) => {
    const qs = new URLSearchParams()
    if (opts.limit) qs.set('limit', String(opts.limit))
    if (opts.after) qs.set('after', opts.after)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get<InstagramMediaResponse>(`/instagram/accounts/${accountId}/media${suffix}`)
  },
  // Pass `mediaType`/`mediaProductType` if you already have them — the
  // backend uses them to skip an extra Graph API meta lookup. The endpoint
  // returns 400 when Meta refuses the metric set (older posts, account
  // downgraded from Business, etc.); callers should treat that as
  // "insights unavailable" rather than a hard failure.
  getMediaInsights: (
    accountId: string,
    mediaId: string,
    hint: {
      mediaType?: InstagramMediaItem['media_type']
      mediaProductType?: InstagramMediaItem['media_product_type']
    } = {},
  ) => {
    const qs = new URLSearchParams()
    if (hint.mediaType) qs.set('mediaType', hint.mediaType)
    if (hint.mediaProductType) qs.set('mediaProductType', hint.mediaProductType)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get<InstagramMediaInsightsResponse>(
      `/instagram/accounts/${accountId}/media/${mediaId}/insights${suffix}`,
    )
  },
  linkChannel: (accountId: string, channelId: string) =>
    post<undefined>(`/instagram/accounts/${accountId}/links`, { channel_id: channelId }),
  unlinkChannel: (accountId: string, channelId: string) =>
    del<undefined>(`/instagram/accounts/${accountId}/links/${channelId}`),
}
