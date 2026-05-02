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
