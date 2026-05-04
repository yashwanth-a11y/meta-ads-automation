import { post } from './client'

export interface MediaBundle {
  id: string
  content_type: 'image_post' | 'carousel' | 'reel'
  image_urls: string[]
  caption: string
  hashtags: string[]
  hook: string
  status: string
  channel_id: string
}

export const creativesApi = {
  generateImage: (channelId: string, trendId?: string, prompt?: string) =>
    post<{ bundle: MediaBundle }>('/creatives/generate-image', {
      channel_id: channelId,
      trend_id: trendId,
      ...(prompt ? { prompt } : {}),
    }),

  generateCarousel: (channelId: string, trendId?: string, slideCount = 5, prompt?: string) =>
    post<{ bundle: MediaBundle }>('/creatives/generate-carousel', {
      channel_id: channelId,
      trend_id: trendId,
      slide_count: slideCount,
      ...(prompt ? { prompt } : {}),
    }),
}
