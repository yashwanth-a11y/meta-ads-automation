/** Route path segments for `<Route path={...} />` (no leading slash). */
export const AUTH_ROUTE = 'auth'
export const FORGOT_PASSWORD_ROUTE = 'forgot-password'
export const DASHBOARD_ROUTE = 'dashboard'

/** Absolute paths for `navigate()`, links, and redirects. */
export const paths = {
  // The public landing page is the home / default destination — until the
  // user explicitly logs out, every "go home" redirect lands here.
  home: '/',
  auth: `/${AUTH_ROUTE}`,
  forgotPassword: `/${FORGOT_PASSWORD_ROUTE}`,
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
  instagram: '/instagram',
  instagramCallback: '/instagram-callback',
  calendar: '/calendar',
} as const
