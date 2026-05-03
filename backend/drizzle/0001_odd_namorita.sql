CREATE TABLE IF NOT EXISTS "approvals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"creative_bundle_id" varchar(36),
	"approver_email" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"stage" varchar(32) DEFAULT 'content_review' NOT NULL,
	"action" varchar(32),
	"action_taken_at" timestamp with time zone,
	"rejection_reason" text,
	"metadata" jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_instagram_accounts" (
	"channel_id" varchar(36) NOT NULL,
	"instagram_account_id" varchar(36) NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channels" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand_name" varchar(255) NOT NULL,
	"brand_description" text,
	"industry" varchar(100),
	"niche" varchar(255),
	"tone" varchar(255),
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"target_audience" text,
	"products" jsonb DEFAULT '[]'::jsonb,
	"competitors" jsonb DEFAULT '[]'::jsonb,
	"tracked_keywords" jsonb DEFAULT '[]'::jsonb,
	"blocked_topics" jsonb DEFAULT '[]'::jsonb,
	"brand_assets" jsonb DEFAULT '{}'::jsonb,
	"instagram_account_id" varchar(64),
	"approval_mode" varchar(32) DEFAULT 'manual' NOT NULL,
	"auto_publish_threshold" numeric(4, 2) DEFAULT '8.5',
	"topic_cooldown_days" integer DEFAULT 14 NOT NULL,
	"posting_schedule" varchar(64) DEFAULT '3x/week',
	"trend_sources" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_bundles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"trend_candidate_id" varchar(36),
	"hook" text,
	"script" text,
	"caption" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"scene_prompts" jsonb DEFAULT '[]'::jsonb,
	"voiceover_text" text,
	"video_url" text,
	"thumbnail_url" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"score_composite" numeric(4, 2),
	"score_breakdown" jsonb,
	"render_job_id" varchar(128),
	"published_targets" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "genui_conversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"title" varchar(120) DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "genui_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"role" varchar(16) NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instagram_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"ig_business_id" varchar(64) NOT NULL,
	"ig_page_id" varchar(64),
	"ig_username" varchar(255),
	"ig_name" varchar(255),
	"ig_profile_picture_url" text,
	"account_type" varchar(32),
	"followers_count" integer DEFAULT 0,
	"follows_count" integer DEFAULT 0,
	"media_count" integer DEFAULT 0,
	"access_token_encrypted" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"ingested" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"classified" integer DEFAULT 0 NOT NULL,
	"scored" integer DEFAULT 0 NOT NULL,
	"bundles_generated" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_cooldowns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"topic_key" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_candidates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36),
	"source_type" varchar(32) NOT NULL,
	"source_name" varchar(128) NOT NULL,
	"external_id" varchar(512),
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"image_url" text,
	"published_at" timestamp with time zone,
	"classification" varchar(32),
	"emotional_dna" jsonb,
	"lifecycle_stage" varchar(16) DEFAULT 'seed',
	"velocity_score" numeric(18, 2) DEFAULT '0',
	"platform_count" integer DEFAULT 1 NOT NULL,
	"raw_data" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_scores" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"trend_candidate_id" varchar(36) NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"emotional_alignment" numeric(4, 2) DEFAULT '0',
	"audience_fit" numeric(4, 2) DEFAULT '0',
	"adaptation_ease" numeric(4, 2) DEFAULT '0',
	"risk_score" numeric(4, 2) DEFAULT '0',
	"composite_score" numeric(4, 2) DEFAULT '0',
	"adaptation_idea" text,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_token_hash_uq" ON "approvals" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_bundle_idx" ON "approvals" USING btree ("creative_bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_org_idx" ON "approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_expires_idx" ON "approvals" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_ig_accounts_pk" ON "channel_instagram_accounts" USING btree ("channel_id","instagram_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_ig_accounts_channel_idx" ON "channel_instagram_accounts" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_ig_accounts_ig_idx" ON "channel_instagram_accounts" USING btree ("instagram_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_ig_accounts_org_idx" ON "channel_instagram_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_org_idx" ON "channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_org_status_idx" ON "channels" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "creative_bundles" ADD COLUMN IF NOT EXISTS "published_targets" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_bundles_org_idx" ON "creative_bundles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_bundles_channel_idx" ON "creative_bundles" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_bundles_status_idx" ON "creative_bundles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_bundles_trend_idx" ON "creative_bundles" USING btree ("trend_candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genui_conversations_org_idx" ON "genui_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genui_conversations_org_updated_idx" ON "genui_conversations" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genui_messages_conversation_idx" ON "genui_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genui_messages_conv_created_idx" ON "genui_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instagram_accounts_org_idx" ON "instagram_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instagram_accounts_org_active_idx" ON "instagram_accounts" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instagram_accounts_org_business_unique" ON "instagram_accounts" USING btree ("organization_id","ig_business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_started_idx" ON "pipeline_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_cooldowns_channel_topic_uq" ON "topic_cooldowns" USING btree ("channel_id","topic_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_cooldowns_expires_idx" ON "topic_cooldowns" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trend_candidates_source_external_uq" ON "trend_candidates" USING btree ("source_type","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_candidates_classification_idx" ON "trend_candidates" USING btree ("classification");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_candidates_lifecycle_idx" ON "trend_candidates" USING btree ("lifecycle_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_candidates_ingested_idx" ON "trend_candidates" USING btree ("ingested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_candidates_org_idx" ON "trend_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trend_scores_trend_channel_uq" ON "trend_scores" USING btree ("trend_candidate_id","channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_scores_channel_score_idx" ON "trend_scores" USING btree ("channel_id","composite_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_scores_org_idx" ON "trend_scores" USING btree ("organization_id");