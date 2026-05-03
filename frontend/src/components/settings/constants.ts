import type { ChannelTrendSources } from '../../api/trends'

export const SCHEDULE_OPTIONS = ['1x/week', '2x/week', '3x/week', '5x/week', 'daily']

export const DEFAULT_SOURCES: ChannelTrendSources = {
  rss: true,
  google_trends: true,
  reddit: true,
  product_hunt: true,
  youtube: false,
  twitter: false,
}
