CREATE TABLE IF NOT EXISTS "audience_presets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"targeting_spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ctwa_campaigns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"ad_account_id" varchar(64) NOT NULL,
	"business_account_id" varchar(64),
	"meta_campaign_id" varchar(64),
	"meta_adset_id" varchar(64),
	"meta_creative_id" varchar(64),
	"meta_ad_id" varchar(64),
	"name" varchar(255) NOT NULL,
	"campaign_label" varchar(255),
	"status" varchar(32) DEFAULT 'paused' NOT NULL,
	"objective" varchar(64),
	"campaign_type" varchar(32),
	"daily_budget" numeric(18, 4),
	"lifetime_budget" numeric(18, 4),
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"flow_id" varchar(64),
	"targeting_spec" jsonb,
	"placement_spec" jsonb,
	"creative_spec" jsonb,
	"opening_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ctwa_conversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"campaign_id" varchar(36),
	"meta_ad_id" varchar(64),
	"contact_id" varchar(36),
	"conversation_id" varchar(64),
	"ctwa_clid" varchar(128),
	"referral_source" varchar(64),
	"referral_headline" varchar(255),
	"referral_body" text,
	"referral_image_url" varchar(1024),
	"source_url" varchar(1024),
	"is_new_contact" boolean DEFAULT false,
	"initiated_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ctwa_conversions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"ctwa_conversation_id" varchar(36),
	"event_type" varchar(64) NOT NULL,
	"value" numeric(18, 4),
	"currency" varchar(8),
	"meta_event_id" varchar(64) NOT NULL,
	"sent_to_meta" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"meta_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ctwa_insights_cache" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"meta_campaign_id" varchar(64) NOT NULL,
	"meta_ad_id" varchar(64),
	"date" date NOT NULL,
	"spend" numeric(18, 4) DEFAULT '0',
	"impressions" bigint DEFAULT 0,
	"reach" bigint DEFAULT 0,
	"clicks" bigint DEFAULT 0,
	"unique_clicks" bigint DEFAULT 0,
	"ctr" numeric(10, 6) DEFAULT '0',
	"cpc" numeric(18, 6) DEFAULT '0',
	"messaging_conversations_started" bigint DEFAULT 0,
	"new_messaging_contacts" bigint DEFAULT 0,
	"quality_ranking" varchar(32) DEFAULT 'UNKNOWN',
	"engagement_rate_ranking" varchar(32) DEFAULT 'UNKNOWN',
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ad_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"ad_account_id" varchar(64) NOT NULL,
	"ad_account_name" varchar(255),
	"page_id" varchar(64),
	"page_name" varchar(255),
	"waba_id" varchar(64),
	"fb_user_id" varchar(64),
	"access_token_encrypted" text NOT NULL,
	"page_access_token_encrypted" text,
	"token_expiry" timestamp with time zone,
	"pixel_id" varchar(64),
	"oauth_app_id" varchar(64),
	"currency" varchar(8) DEFAULT 'INR',
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"balance_cache" numeric(18, 4),
	"balance_last_synced" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ad_leads" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"form_id" varchar(64) NOT NULL,
	"form_name" varchar(255),
	"page_name" varchar(255),
	"ad_name" varchar(255),
	"campaign_name" varchar(255),
	"adset_name" varchar(255),
	"platform" varchar(32),
	"fields" jsonb,
	"created_time" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"state" varchar(128) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_presets_org_idx" ON "audience_presets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_campaigns_org_idx" ON "ctwa_campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_campaigns_meta_ad_idx" ON "ctwa_campaigns" USING btree ("meta_ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_campaigns_status_idx" ON "ctwa_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_conv_campaign_idx" ON "ctwa_conversations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_conv_org_idx" ON "ctwa_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_conv_clid_idx" ON "ctwa_conversations" USING btree ("ctwa_clid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_conversions_conv_idx" ON "ctwa_conversions" USING btree ("ctwa_conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ctwa_conversions_sent_idx" ON "ctwa_conversions" USING btree ("sent_to_meta","retry_count");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ctwa_conversions_meta_event_uq" ON "ctwa_conversions" USING btree ("meta_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_campaign_date_idx" ON "ctwa_insights_cache" USING btree ("meta_campaign_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_ad_date_idx" ON "ctwa_insights_cache" USING btree ("meta_ad_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_org_idx" ON "meta_ad_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_org_status_idx" ON "meta_ad_accounts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_leads_org_idx" ON "meta_ad_leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_leads_form_idx" ON "meta_ad_leads" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_leads_org_created_idx" ON "meta_ad_leads" USING btree ("organization_id","created_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_expires_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_token_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_uq" ON "users" USING btree ("phone");