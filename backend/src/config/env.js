import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  APPROVAL_LINK_SECRET: z.string().min(16, 'APPROVAL_LINK_SECRET must be at least 16 chars'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(32, 'TOKEN_ENCRYPTION_KEY must be a 32-byte (64-hex-char) key for AES-256-GCM'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  // Postgres connection — prefer individual fields so passwords with special
  // characters (like '@') don't need URL-encoding. DATABASE_URL is honored
  // when set and overrides the individual fields.
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('Automation_Meta_Ads'),
  DB_SSL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  REDIS_URL: z.string().url().optional(),

  // Meta / Facebook
  META_API_VERSION: z.string().default('v21.0'),
  META_API_BASE_URL: z.string().default('https://graph.facebook.com'),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ADS_APP_ID: z.string().optional(),
  META_ADS_APP_SECRET: z.string().optional(),
  META_ADS_OAUTH_APP_ID: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_WEBHOOK_SECRET: z.string().optional(),
  META_ADS_REDIRECT_URI: z.string().default('http://localhost:5173/oauth/meta-ads/callback'),
  FACEBOOK_REDIRECT_URI: z.string().default('http://localhost:5173/oauth/facebook/callback'),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_CAPI_TEST_CODE: z.string().optional(),

  // Instagram Business Login (separate flow from Ads OAuth)
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().optional(),
  INSTAGRAM_FORCE_REAUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // Match the existing variable name in .env. Default covers the minimum
  // scopes for posting + insights.
  INSTAGRAM_SCOPES: z
    .string()
    .default('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'),
  INSTAGRAM_AUTH_BASE_URL: z
    .string()
    .default('https://www.instagram.com/oauth/authorize'),
  INSTAGRAM_GRAPH_API_BASE_URL: z.string().default('https://graph.instagram.com'),
  INSTAGRAM_API_VERSION: z.string().default('v21.0'),

  // LLM
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Chat Completions model id (e.g. gpt-4o-mini, gpt-4o, gpt-4-turbo) */
  OPENAI_MODEL: z
    .string()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'gpt-4o-mini')),

  // Trend intelligence
  TAVILY_API_KEY: z.string().optional(),
  PRODUCT_HUNT_TOKEN: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),    // YouTube Data API v3 (free 10K units/day)

  // Pipeline / scheduler
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Public origin of the backend, used to mint URLs for files we serve to
  // third parties (e.g. Instagram fetching uploaded media). Optional in
  // development — when unset, services derive from x-forwarded-host (ngrok).
  BACKEND_PUBLIC_URL: z.string().optional(),
  CRON_INTERVAL_HOURS: z.coerce.number().int().positive().default(6),
  MIN_BRAND_FIT_SCORE: z.coerce.number().min(0).max(10).default(6),

  // X / Twitter
  X_BEARER_TOKEN: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_TOKEN_SECRET: z.string().optional(),

  // Voice / TTS
  ELEVENLABS_API_KEY: z.string().optional(),
  AZURE_TTS_KEY: z.string().optional(),

  // AWS (IAM user keys — picked up by AWS SDK via env; optional if using instance/profile roles)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  USE_S3: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Email (Brevo / Sendinblue)
  BREVO_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().default('hussain@photonxtech.com'),

  // Holiday sync — optional, enhances special_days calendar
  // Free tier: 500 req/month at https://calendarific.com
  CALENDARIFIC_API_KEY: z.string().optional(),

  // Image generation providers
  REPLICATE_API_KEY: z.string().optional(),
  MODELSLAB_API_KEY: z.string().optional(),

  // Feature flags
  FEATURE_ADS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
