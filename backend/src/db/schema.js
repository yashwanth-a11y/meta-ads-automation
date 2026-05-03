import { sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  integer,
  bigint,
  numeric,
  jsonb,
  timestamp,
  date,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => varchar('id', { length: 36 }).primaryKey();
const orgId = () => varchar('organization_id', { length: 36 }).notNull();
const ts = (name) =>
  timestamp(name, { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

// --- Users ---
// Individual users; no organization concept — each user owns their own data.
// `organization_id` on the rest of the schema is set to `users.id` so the
// existing per-tenant scoping (every Meta Ads repo filters by organization_id)
// keeps working without modification.

export const users = pgTable(
  'users',
  {
    id: id(),
    first_name: varchar('first_name', { length: 100 }).notNull(),
    last_name: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    password_hash: text('password_hash').notNull(),
    last_login_at: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    // Case-insensitive uniqueness on email. We also lowercase + trim before
    // insert, but the index is the authoritative guard (and helps lookups).
    email_lower_uq: uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    // Phone is unique across all users (one account per phone number).
    phone_uq: uniqueIndex('users_phone_uq').on(t.phone),
  }),
);

// --- Password reset tokens (single-use, 1h expiry) ---
// We store SHA-256(token) so a DB leak doesn't yield usable reset links.
// `invalidate_at` lets us soft-revoke all tokens for a user when a new
// reset is requested (only the latest token works).

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    used_at: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    created_at: ts('created_at'),
  },
  (t) => ({
    token_hash_uq: uniqueIndex('password_reset_token_hash_uq').on(t.token_hash),
    user_idx: index('password_reset_user_idx').on(t.user_id),
    expires_idx: index('password_reset_expires_idx').on(t.expires_at),
  }),
);

// --- Meta ad account connections (one active per organization, can be more historical) ---

export const metaAdAccounts = pgTable(
  'meta_ad_accounts',
  {
    id: id(),
    organization_id: orgId(),
    ad_account_id: varchar('ad_account_id', { length: 64 }).notNull(),
    ad_account_name: varchar('ad_account_name', { length: 255 }),
    page_id: varchar('page_id', { length: 64 }),
    page_name: varchar('page_name', { length: 255 }),
    waba_id: varchar('waba_id', { length: 64 }),
    fb_user_id: varchar('fb_user_id', { length: 64 }),
    access_token_encrypted: text('access_token_encrypted').notNull(),
    page_access_token_encrypted: text('page_access_token_encrypted'),
    token_expiry: timestamp('token_expiry', { withTimezone: true, mode: 'date' }),
    pixel_id: varchar('pixel_id', { length: 64 }),
    oauth_app_id: varchar('oauth_app_id', { length: 64 }),
    currency: varchar('currency', { length: 8 }).default('INR'),
    status: varchar('status', { length: 32 }).default('active').notNull(),
    balance_cache: numeric('balance_cache', { precision: 18, scale: 4 }),
    balance_last_synced: timestamp('balance_last_synced', { withTimezone: true, mode: 'date' }),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('meta_ad_accounts_org_idx').on(t.organization_id),
    org_status_idx: index('meta_ad_accounts_org_status_idx').on(t.organization_id, t.status),
  }),
);

// --- Instagram Business accounts (one per Meta IG Business account, per org) ---
// Connected via Instagram Business Login (NOT the Ads OAuth flow). Each row
// holds a long-lived IG token; one IG account belongs to exactly one org but
// can be linked to many channels via channel_instagram_accounts.

export const instagramAccounts = pgTable(
  'instagram_accounts',
  {
    id: id(),
    organization_id: orgId(),
    user_id: varchar('user_id', { length: 36 }), // who first connected; nullable for audit
    ig_business_id: varchar('ig_business_id', { length: 64 }).notNull(),
    ig_page_id: varchar('ig_page_id', { length: 64 }),
    ig_username: varchar('ig_username', { length: 255 }),
    ig_name: varchar('ig_name', { length: 255 }),
    ig_profile_picture_url: text('ig_profile_picture_url'),
    account_type: varchar('account_type', { length: 32 }), // BUSINESS | CREATOR
    followers_count: integer('followers_count').default(0),
    follows_count: integer('follows_count').default(0),
    media_count: integer('media_count').default(0),
    access_token_encrypted: text('access_token_encrypted').notNull(),
    token_expires_at: timestamp('token_expires_at', { withTimezone: true, mode: 'date' }),
    last_synced_at: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('instagram_accounts_org_idx').on(t.organization_id),
    org_active_idx: index('instagram_accounts_org_active_idx').on(t.organization_id, t.is_active),
    org_business_unique: uniqueIndex('instagram_accounts_org_business_unique')
      .on(t.organization_id, t.ig_business_id),
  }),
);

// --- Channel ↔ Instagram account links (many-to-many) ---
// One channel can fan out posts to multiple IG accounts; one IG account can
// be linked to multiple channels. Cascade deletion is enforced in the
// repository layer (this codebase doesn't declare FK constraints in drizzle).

export const channelInstagramAccounts = pgTable(
  'channel_instagram_accounts',
  {
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    instagram_account_id: varchar('instagram_account_id', { length: 36 }).notNull(),
    organization_id: orgId(),
    created_at: ts('created_at'),
  },
  (t) => ({
    pk: uniqueIndex('channel_ig_accounts_pk').on(t.channel_id, t.instagram_account_id),
    channel_idx: index('channel_ig_accounts_channel_idx').on(t.channel_id),
    ig_idx: index('channel_ig_accounts_ig_idx').on(t.instagram_account_id),
    org_idx: index('channel_ig_accounts_org_idx').on(t.organization_id),
  }),
);

// --- Click-to-WhatsApp campaigns (PhotonX-side mirror of Meta campaign+adset+ad) ---

export const ctwaCampaigns = pgTable(
  'ctwa_campaigns',
  {
    id: id(),
    organization_id: orgId(),
    ad_account_id: varchar('ad_account_id', { length: 64 }).notNull(),
    business_account_id: varchar('business_account_id', { length: 64 }),
    meta_campaign_id: varchar('meta_campaign_id', { length: 64 }),
    meta_adset_id: varchar('meta_adset_id', { length: 64 }),
    meta_creative_id: varchar('meta_creative_id', { length: 64 }),
    meta_ad_id: varchar('meta_ad_id', { length: 64 }),
    name: varchar('name', { length: 255 }).notNull(),
    campaign_label: varchar('campaign_label', { length: 255 }),
    status: varchar('status', { length: 32 }).default('paused').notNull(),
    objective: varchar('objective', { length: 64 }),
    campaign_type: varchar('campaign_type', { length: 32 }),
    daily_budget: numeric('daily_budget', { precision: 18, scale: 4 }),
    lifetime_budget: numeric('lifetime_budget', { precision: 18, scale: 4 }),
    start_date: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    end_date: timestamp('end_date', { withTimezone: true, mode: 'date' }),
    flow_id: varchar('flow_id', { length: 64 }),
    targeting_spec: jsonb('targeting_spec'),
    placement_spec: jsonb('placement_spec'),
    creative_spec: jsonb('creative_spec'),
    opening_message: text('opening_message'),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('ctwa_campaigns_org_idx').on(t.organization_id),
    meta_ad_id_idx: index('ctwa_campaigns_meta_ad_idx').on(t.meta_ad_id),
    status_idx: index('ctwa_campaigns_status_idx').on(t.status),
  }),
);

// --- CTWA conversations (a WhatsApp conversation initiated from a CTWA ad) ---

export const ctwaConversations = pgTable(
  'ctwa_conversations',
  {
    id: id(),
    organization_id: orgId(),
    campaign_id: varchar('campaign_id', { length: 36 }),
    meta_ad_id: varchar('meta_ad_id', { length: 64 }),
    contact_id: varchar('contact_id', { length: 36 }),
    conversation_id: varchar('conversation_id', { length: 64 }),
    ctwa_clid: varchar('ctwa_clid', { length: 128 }),
    referral_source: varchar('referral_source', { length: 64 }),
    referral_headline: varchar('referral_headline', { length: 255 }),
    referral_body: text('referral_body'),
    referral_image_url: varchar('referral_image_url', { length: 1024 }),
    source_url: varchar('source_url', { length: 1024 }),
    is_new_contact: boolean('is_new_contact').default(false),
    initiated_at: timestamp('initiated_at', { withTimezone: true, mode: 'date' }).notNull(),
    converted_at: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    campaign_idx: index('ctwa_conv_campaign_idx').on(t.campaign_id),
    org_idx: index('ctwa_conv_org_idx').on(t.organization_id),
    clid_idx: index('ctwa_conv_clid_idx').on(t.ctwa_clid),
  }),
);

// --- CTWA conversion events (Lead, Purchase, etc.) sent to Meta CAPI ---

export const ctwaConversions = pgTable(
  'ctwa_conversions',
  {
    id: id(),
    ctwa_conversation_id: varchar('ctwa_conversation_id', { length: 36 }),
    event_type: varchar('event_type', { length: 64 }).notNull(),
    value: numeric('value', { precision: 18, scale: 4 }),
    currency: varchar('currency', { length: 8 }),
    meta_event_id: varchar('meta_event_id', { length: 64 }).notNull(),
    sent_to_meta: boolean('sent_to_meta').default(false).notNull(),
    sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    retry_count: integer('retry_count').default(0).notNull(),
    meta_response: jsonb('meta_response'),
    created_at: ts('created_at'),
  },
  (t) => ({
    conv_idx: index('ctwa_conversions_conv_idx').on(t.ctwa_conversation_id),
    sent_idx: index('ctwa_conversions_sent_idx').on(t.sent_to_meta, t.retry_count),
    meta_event_uq: uniqueIndex('ctwa_conversions_meta_event_uq').on(t.meta_event_id),
  }),
);

// --- Insights cache (per-day, per-campaign or per-ad) ---

export const ctwaInsightsCache = pgTable(
  'ctwa_insights_cache',
  {
    id: id(),
    meta_campaign_id: varchar('meta_campaign_id', { length: 64 }).notNull(),
    meta_ad_id: varchar('meta_ad_id', { length: 64 }),
    date: date('date').notNull(),
    spend: numeric('spend', { precision: 18, scale: 4 }).default('0'),
    impressions: bigint('impressions', { mode: 'number' }).default(0),
    reach: bigint('reach', { mode: 'number' }).default(0),
    clicks: bigint('clicks', { mode: 'number' }).default(0),
    unique_clicks: bigint('unique_clicks', { mode: 'number' }).default(0),
    ctr: numeric('ctr', { precision: 10, scale: 6 }).default('0'),
    cpc: numeric('cpc', { precision: 18, scale: 6 }).default('0'),
    messaging_conversations_started: bigint('messaging_conversations_started', { mode: 'number' }).default(0),
    new_messaging_contacts: bigint('new_messaging_contacts', { mode: 'number' }).default(0),
    quality_ranking: varchar('quality_ranking', { length: 32 }).default('UNKNOWN'),
    engagement_rate_ranking: varchar('engagement_rate_ranking', { length: 32 }).default('UNKNOWN'),
    synced_at: timestamp('synced_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    campaign_date_idx: index('insights_campaign_date_idx').on(t.meta_campaign_id, t.date),
    ad_date_idx: index('insights_ad_date_idx').on(t.meta_ad_id, t.date),
  }),
);

// --- Meta lead-ads cache (rows fetched from /{form}/leads + /{page}/leadgen_forms) ---

export const metaAdLeads = pgTable(
  'meta_ad_leads',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // Meta's lead id
    organization_id: orgId(),
    form_id: varchar('form_id', { length: 64 }).notNull(),
    form_name: varchar('form_name', { length: 255 }),
    page_name: varchar('page_name', { length: 255 }),
    ad_name: varchar('ad_name', { length: 255 }),
    campaign_name: varchar('campaign_name', { length: 255 }),
    adset_name: varchar('adset_name', { length: 255 }),
    platform: varchar('platform', { length: 32 }),
    fields: jsonb('fields'),
    created_time: timestamp('created_time', { withTimezone: true, mode: 'date' }),
    synced_at: timestamp('synced_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    org_idx: index('meta_ad_leads_org_idx').on(t.organization_id),
    form_idx: index('meta_ad_leads_form_idx').on(t.form_id),
    org_created_idx: index('meta_ad_leads_org_created_idx').on(t.organization_id, t.created_time),
  }),
);

// --- OAuth state (kept for future server-side state storage; we currently
// HMAC-sign state instead, but this table is here if you switch strategies) ---

export const oauthStates = pgTable(
  'oauth_states',
  {
    state: varchar('state', { length: 128 }).primaryKey(),
    organization_id: orgId(),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    created_at: ts('created_at'),
  },
  (t) => ({
    expires_idx: index('oauth_states_expires_idx').on(t.expires_at),
  }),
);

// --- Audience presets (saved targeting specs per org) ---

export const audiencePresets = pgTable(
  'audience_presets',
  {
    id: id(),
    organization_id: orgId(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    targeting_spec: jsonb('targeting_spec').notNull(),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('audience_presets_org_idx').on(t.organization_id),
  }),
);

// ---------------------------------------------------------------------------
// GrowthOS — Trend-to-Video (Microservice 1)
// ---------------------------------------------------------------------------

// --- Channels (brand profiles driving content generation) ---

export const channels = pgTable(
  'channels',
  {
    id: id(),
    organization_id: orgId(),
    name: varchar('name', { length: 255 }).notNull(),
    brand_name: varchar('brand_name', { length: 255 }).notNull(),
    brand_description: text('brand_description'),
    industry: varchar('industry', { length: 100 }),
    niche: varchar('niche', { length: 255 }),
    tone: varchar('tone', { length: 255 }),
    language: varchar('language', { length: 10 }).default('en').notNull(),
    target_audience: text('target_audience'),
    products: jsonb('products').default([]),
    competitors: jsonb('competitors').default([]),
    tracked_keywords: jsonb('tracked_keywords').default([]),
    blocked_topics: jsonb('blocked_topics').default([]),
    brand_assets: jsonb('brand_assets').default({}),
    // { logo_url, colors[], font, intro_video_url, outro_video_url }
    instagram_account_id: varchar('instagram_account_id', { length: 64 }),
    approval_mode: varchar('approval_mode', { length: 32 }).default('manual').notNull(),
    auto_publish_threshold: numeric('auto_publish_threshold', { precision: 4, scale: 2 }).default('8.5'),
    topic_cooldown_days: integer('topic_cooldown_days').default(14).notNull(),
    posting_schedule: varchar('posting_schedule', { length: 64 }).default('3x/week'),
    trend_sources: jsonb('trend_sources').default({}),
    // { rss: true, google_trends: true, reddit: true, product_hunt: true, youtube: true, twitter: false }
    status: varchar('status', { length: 32 }).default('active').notNull(),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('channels_org_idx').on(t.organization_id),
    org_status_idx: index('channels_org_status_idx').on(t.organization_id, t.status),
  }),
);

// --- Trend candidates (raw ingested items from all sources) ---

export const trendCandidates = pgTable(
  'trend_candidates',
  {
    id: id(),
    // null = universal trend (not brand-specific); set = brand-own trend
    organization_id: varchar('organization_id', { length: 36 }),
    source_type: varchar('source_type', { length: 32 }).notNull(),
    // rss | google_trends | reddit | product_hunt | youtube | twitter | know_your_meme
    source_name: varchar('source_name', { length: 128 }).notNull(),
    external_id: varchar('external_id', { length: 512 }),
    title: text('title').notNull(),
    summary: text('summary'),
    url: text('url'),
    image_url: text('image_url'),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    classification: varchar('classification', { length: 32 }),
    // topic | format_template | brand_news | noise
    emotional_dna: jsonb('emotional_dna'),
    // { core_emotion, visual_signature, themes[], brand_fit_notes }
    lifecycle_stage: varchar('lifecycle_stage', { length: 16 }).default('seed'),
    // seed | sprout | peak | saturated
    velocity_score: numeric('velocity_score', { precision: 18, scale: 2 }).default('0'),
    platform_count: integer('platform_count').default(1).notNull(),
    raw_data: jsonb('raw_data'),
    ingested_at: ts('ingested_at'),
    created_at: ts('created_at'),
  },
  (t) => ({
    source_external_uq: uniqueIndex('trend_candidates_source_external_uq').on(t.source_type, t.external_id),
    classification_idx: index('trend_candidates_classification_idx').on(t.classification),
    lifecycle_idx: index('trend_candidates_lifecycle_idx').on(t.lifecycle_stage),
    ingested_idx: index('trend_candidates_ingested_idx').on(t.ingested_at),
    org_idx: index('trend_candidates_org_idx').on(t.organization_id),
  }),
);

// --- Trend scores (per-channel brand fit scoring for each candidate) ---

export const trendScores = pgTable(
  'trend_scores',
  {
    id: id(),
    trend_candidate_id: varchar('trend_candidate_id', { length: 36 }).notNull(),
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    organization_id: orgId(),
    emotional_alignment: numeric('emotional_alignment', { precision: 4, scale: 2 }).default('0'),
    audience_fit: numeric('audience_fit', { precision: 4, scale: 2 }).default('0'),
    adaptation_ease: numeric('adaptation_ease', { precision: 4, scale: 2 }).default('0'),
    risk_score: numeric('risk_score', { precision: 4, scale: 2 }).default('0'),
    composite_score: numeric('composite_score', { precision: 4, scale: 2 }).default('0'),
    adaptation_idea: text('adaptation_idea'),
    scored_at: ts('scored_at'),
  },
  (t) => ({
    trend_channel_uq: uniqueIndex('trend_scores_trend_channel_uq').on(t.trend_candidate_id, t.channel_id),
    channel_score_idx: index('trend_scores_channel_score_idx').on(t.channel_id, t.composite_score),
    org_idx: index('trend_scores_org_idx').on(t.organization_id),
  }),
);

// --- Creative bundles (generated content per channel per trend) ---

export const creativeBundles = pgTable(
  'creative_bundles',
  {
    id: id(),
    organization_id: orgId(),
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    trend_candidate_id: varchar('trend_candidate_id', { length: 36 }),
    hook: text('hook'),
    script: text('script'),
    caption: text('caption'),
    hashtags: jsonb('hashtags').default([]),
    scene_prompts: jsonb('scene_prompts').default([]),
    voiceover_text: text('voiceover_text'),
    video_url: text('video_url'),
    thumbnail_url: text('thumbnail_url'),
    status: varchar('status', { length: 32 }).default('draft').notNull(),
    // draft | rendering | ready | approved | rejected | published
    score_composite: numeric('score_composite', { precision: 4, scale: 2 }),
    score_breakdown: jsonb('score_breakdown'),
    // { trend_relevance, viral_hook, clarity, audience_fit, platform_fit, brand_safety, rationale }
    render_job_id: varchar('render_job_id', { length: 128 }),
    // Per-account fan-out result for IG cross-posting:
    // [{ instagram_account_id, ig_username, ig_business_id, media_id, error, published_at }]
    published_targets: jsonb('published_targets').default([]),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('creative_bundles_org_idx').on(t.organization_id),
    channel_idx: index('creative_bundles_channel_idx').on(t.channel_id),
    status_idx: index('creative_bundles_status_idx').on(t.status),
    trend_idx: index('creative_bundles_trend_idx').on(t.trend_candidate_id),
  }),
);

// --- Approvals (JWT-signed single-use action links) ---

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    organization_id: orgId(),
    // null at topic_selection stage (no bundle yet)
    creative_bundle_id: varchar('creative_bundle_id', { length: 36 }),
    approver_email: varchar('approver_email', { length: 255 }).notNull(),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    // topic_selection | content_review | video_review
    stage: varchar('stage', { length: 32 }).default('content_review').notNull(),
    action: varchar('action', { length: 32 }),
    // approve | reject | regenerate | select_topic — null until acted on
    action_taken_at: timestamp('action_taken_at', { withTimezone: true, mode: 'date' }),
    rejection_reason: text('rejection_reason'),
    // stores: top trends list (topic_selection), user feedback (content/video review)
    metadata: jsonb('metadata'),
    ip_address: varchar('ip_address', { length: 64 }),
    user_agent: text('user_agent'),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    reminder_sent_at: timestamp('reminder_sent_at', { withTimezone: true, mode: 'date' }),
    created_at: ts('created_at'),
  },
  (t) => ({
    token_hash_uq: uniqueIndex('approvals_token_hash_uq').on(t.token_hash),
    bundle_idx: index('approvals_bundle_idx').on(t.creative_bundle_id),
    org_idx: index('approvals_org_idx').on(t.organization_id),
    expires_idx: index('approvals_expires_idx').on(t.expires_at),
  }),
);

// --- Topic cooldowns (prevents same trend hitting same channel twice within window) ---

export const topicCooldowns = pgTable(
  'topic_cooldowns',
  {
    id: id(),
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    organization_id: orgId(),
    topic_key: varchar('topic_key', { length: 512 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    created_at: ts('created_at'),
  },
  (t) => ({
    channel_topic_uq: uniqueIndex('topic_cooldowns_channel_topic_uq').on(t.channel_id, t.topic_key),
    expires_idx: index('topic_cooldowns_expires_idx').on(t.expires_at),
  }),
);

// --- GenUI conversation history ---
// Stores AI assistant chat sessions per org. Each conversation has a title
// derived from the first user message and an ordered list of messages.

export const genuiConversations = pgTable(
  'genui_conversations',
  {
    id: id(),
    organization_id: orgId(),
    title: varchar('title', { length: 120 }).notNull().default('New conversation'),
    created_at: ts('created_at'),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    org_idx: index('genui_conversations_org_idx').on(t.organization_id),
    org_updated_idx: index('genui_conversations_org_updated_idx').on(t.organization_id, t.updated_at),
  }),
);

export const genuiMessages = pgTable(
  'genui_messages',
  {
    id: id(),
    conversation_id: varchar('conversation_id', { length: 36 }).notNull(),
    role: varchar('role', { length: 16 }).notNull(), // 'user' | 'assistant'
    parts: jsonb('parts').notNull().default([]),
    created_at: ts('created_at'),
  },
  (t) => ({
    conversation_idx: index('genui_messages_conversation_idx').on(t.conversation_id),
    conversation_created_idx: index('genui_messages_conv_created_idx').on(t.conversation_id, t.created_at),
  }),
);

// --- Pipeline runs (DB-backed scheduler state; restart-safe run history) ---
// Each automated ingestion→classify→score→generate→email cycle creates one row.
// On startup the scheduler checks the latest completed_at to decide whether to
// run immediately. This replaces a naive setInterval with no persistence.

export const pipelineRuns = pgTable(
  'pipeline_runs',
  {
    id: id(),
    status: varchar('status', { length: 16 }).default('running').notNull(),
    // running | done | failed
    started_at: ts('started_at'),
    completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    ingested: integer('ingested').default(0).notNull(),
    skipped: integer('skipped').default(0).notNull(),
    classified: integer('classified').default(0).notNull(),
    scored: integer('scored').default(0).notNull(),
    bundles_generated: integer('bundles_generated').default(0).notNull(),
    emails_sent: integer('emails_sent').default(0).notNull(),
    errors: jsonb('errors').default([]),
  },
  (t) => ({
    status_idx: index('pipeline_runs_status_idx').on(t.status),
    started_idx: index('pipeline_runs_started_idx').on(t.started_at),
  }),
);
