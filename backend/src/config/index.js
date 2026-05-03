import { env } from './env.js';

// Compatibility shim: the imported Meta Ads code reads `config.meta.apiVersion`
// and `config.redirectUris.{facebook,metaAds}`. Group env values under those
// shapes so we don't have to rewrite every callsite.
export const config = {
  meta: {
    apiVersion: env.META_API_VERSION,
    baseUrl: env.META_API_BASE_URL,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    adsAppId: env.META_ADS_APP_ID,
    adsAppSecret: env.META_ADS_APP_SECRET,
    capiTestCode: env.META_CAPI_TEST_CODE,
  },
  facebook: {
    appId: env.FACEBOOK_APP_ID,
    appSecret: env.FACEBOOK_APP_SECRET,
    webhookVerifyToken: env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
  },
  redirectUris: {
    metaAds: env.META_ADS_REDIRECT_URI,
    facebook: env.FACEBOOK_REDIRECT_URI,
    instagram: env.INSTAGRAM_REDIRECT_URI,
  },
  instagram: {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    scopes: env.INSTAGRAM_SCOPES,
    forceReauth: env.INSTAGRAM_FORCE_REAUTH,
    authBaseUrl: env.INSTAGRAM_AUTH_BASE_URL,
    graphApiBaseUrl: env.INSTAGRAM_GRAPH_API_BASE_URL,
    apiVersion: env.INSTAGRAM_API_VERSION,
  },
  features: {
    adsEnabled: env.FEATURE_ADS_ENABLED,
  },
  encryption: {
    key: env.TOKEN_ENCRYPTION_KEY,
  },
};

export { env };
