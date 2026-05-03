/** Route path segments for `<Route path={...} />` (no leading slash). */
export const AUTH_ROUTE = 'auth'
export const DASHBOARD_ROUTE = 'dashboard'

/** Absolute paths for `navigate()`, links, and redirects. */
export const paths = {
  auth: `/${AUTH_ROUTE}`,
  dashboard: `/${DASHBOARD_ROUTE}`,
  channels: '/channels',
  trends: '/trends',
  approvals: '/approvals',
  creatives: '/creatives',
  ads: '/ads',
  adsSetup: '/ads/setup',
  adsCreate: '/ads/create',
  adsDetail: (id: string) => `/ads/${id}`,
  oauthMetaAdsCallback: '/oauth/meta-ads/callback',
  crm: '/crm',
  analytics: '/analytics',
  genui: '/genui',
  settings: '/settings',
} as const
