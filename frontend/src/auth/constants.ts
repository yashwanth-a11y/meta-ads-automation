/** Route path segments for `<Route path={...} />` (no leading slash). */
export const AUTH_ROUTE = 'auth'
export const DASHBOARD_ROUTE = 'dashboard'

/** Absolute paths for `navigate()`, links, and redirects. */
export const paths = {
  auth: `/${AUTH_ROUTE}`,
  dashboard: `/${DASHBOARD_ROUTE}`,
  channels: '/channels',
  trends: '/trends',
  creatives: '/creatives',
  ads: '/ads',
  crm: '/crm',
  analytics: '/analytics',
  settings: '/settings',
} as const
