import { get, post, del, http, unwrap } from './client'
import type { ApiResponse } from './types'

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

export type InstagramComment = {
  id: string
  text: string
  timestamp: string
  username?: string
  like_count?: number
  hidden?: boolean
  replies?: { data: InstagramComment[] }
}

export type InstagramCommentsResponse = {
  data: InstagramComment[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
    previous?: string
  }
}

// ---------------------------------------------------------------------------
// Composer / publishing
// ---------------------------------------------------------------------------

export type InstagramPostType = 'image' | 'video' | 'reels' | 'carousel' | 'story'

export type InstagramUpload = {
  url: string         // public URL Meta will fetch
  storedPath: string  // pass back in cleanup_paths so the file is removed after publish
  kind: 'image' | 'video'
  mimeType: string
  size: number
  backend: 's3' | 'local'  // diagnostic — confirms which storage path served the upload
}

// Spec shape mirrors PublishingService.MediaSpec on the backend. Only the
// fields the composer UI sets are listed; the backend tolerates extras.
export type InstagramCarouselChild = {
  kind: 'image' | 'video'
  image_url?: string
  video_url?: string
  alt_text?: string
}

export type InstagramPublishSpec =
  | { type: 'image'; image_url: string; caption?: string; hashtags?: string[]; alt_text?: string }
  | { type: 'video'; video_url: string; caption?: string; hashtags?: string[]; cover_url?: string }
  | { type: 'reels'; video_url: string; caption?: string; hashtags?: string[]; cover_url?: string; share_to_feed?: boolean }
  | { type: 'carousel'; children: InstagramCarouselChild[]; caption?: string; hashtags?: string[] }
  | { type: 'story'; image_url?: string; video_url?: string }

export type InstagramPublishResult = {
  media_id: string
  container_id: string
  type: InstagramPostType
  ig_username: string | null
  ig_business_id: string | null
  published_at: string
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
  // Top-level comments + one nested level of replies. The endpoint returns
  // 400 when the IG account lacks `instagram_manage_comments` (e.g. older
  // OAuth scopes); callers should treat that as "comments unavailable".
  getMediaComments: (
    accountId: string,
    mediaId: string,
    opts: { limit?: number; after?: string } = {},
  ) => {
    const qs = new URLSearchParams()
    if (opts.limit) qs.set('limit', String(opts.limit))
    if (opts.after) qs.set('after', opts.after)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get<InstagramCommentsResponse>(
      `/instagram/accounts/${accountId}/media/${mediaId}/comments${suffix}`,
    )
  },
  linkChannel: (accountId: string, channelId: string) =>
    post<undefined>(`/instagram/accounts/${accountId}/links`, { channel_id: channelId }),
  unlinkChannel: (accountId: string, channelId: string) =>
    del<undefined>(`/instagram/accounts/${accountId}/links/${channelId}`),
  // Multipart upload — one file per call. The composer chains 1..N of these
  // (a carousel posts up to 10 children) before calling publishMedia.
  uploadMedia: (
    accountId: string,
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<InstagramUpload> => {
    const form = new FormData()
    form.append('file', file, file.name)
    return unwrap<InstagramUpload>(
      http.post<ApiResponse<InstagramUpload>>(
        `/instagram/accounts/${accountId}/upload`,
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          // Larger ceiling than the global default; videos can take time
          // to push, especially over slower upstream links.
          timeout: 5 * 60 * 1000,
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(e.loaded, e.total)
          },
        },
      ),
    )
  },
  publishMedia: (
    accountId: string,
    spec: InstagramPublishSpec,
    cleanupPaths: string[] = [],
  ) =>
    unwrap<InstagramPublishResult>(
      http.post<ApiResponse<InstagramPublishResult>>(
        `/instagram/accounts/${accountId}/publish`,
        { spec, cleanup_paths: cleanupPaths },
        // Publish includes a 15s × up to 24 attempts (~6 min) container poll
        // for video/reels — the request stays open until the IG container
        // reaches FINISHED. Bump axios timeout above the worst-case poll
        // budget so we don't time out before the backend does.
        { timeout: 8 * 60 * 1000 },
      ),
    ),
}
