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

  // LLM
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // X / Twitter
  X_BEARER_TOKEN: z.string().optional(),

  // Voice / TTS
  ELEVENLABS_API_KEY: z.string().optional(),
  AZURE_TTS_KEY: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

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
