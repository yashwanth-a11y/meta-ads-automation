# EXECUTIVE SUMMARY
## PhotonX
### AI Operating System for Business & Teams
**Projects 1, 2, 3 — Requirements & Success Criteria**

## HOW THE OS FITS TOGETHER

PhotonX WorkOS (Project 1) is the workplace surface — a WhatsApp-first HRMS and project management system. PhotonX GrowthOS (Project 2) is the growth surface — trend ingestion, AI content publishing, Meta ads, and CRM. PhotonX AI Core (Project 3) is the spine — every LLM call from every product routes through it for cost control, observability, prompt optimization, and quality enforcement. PhotonX Prompt Engine (Project 4) is documented separately when its inputs are provided.

---

## PROJECT 2 • PhotonX GrowthOS
**AI marketing automation: trends → content → ads → leads**

### WHAT IT DOES

GrowthOS is two coupled engines. The first ingests AI and tech trends — with Twitter/X as the primary signal for company launches — generates Instagram Reels with hook, script, voiceover, scenes, captions, and hashtags, scores each creative against a rubric, and gates publication on email approval. The second connects a tenant's Meta account, generates ads from a natural-language brief, pushes campaigns to Meta after approval, syncs leads into a built-in CRM, and answers performance questions through a GenUI dashboard with auto-attached charts.

---

## MICROSERVICE 1 — TREND-TO-VIDEO ENGINE

### Channel setup and configuration

Channel definition includes name, niche, target audience, content tone, language, posting schedule (cron-style or N/week), and connected Instagram Business account.

Brand assets: logo, color palette, font, intro and outro video templates.

Approval mode is either Manual (always email) or Auto-publish-if-score-above (configurable threshold, default 8.5/10). Approver list with role (approver/reviewer) per email.

Per-channel few-shot example library of reference reels biases generation style; topic-cooldown window (default 14 days) prevents the same trend producing two reels.

Negative-topic filter for blocked keywords, competitors, and NSFW exclusions; trend-source toggles per channel.

### Trend ingestion — Twitter/X is the primary signal

Authenticated X API v2 with streaming filtered rules across a curated list of ~500 AI company handles (OpenAI, Anthropic, xAI, Mistral, etc.), tracked launch keywords ('launching', 'introducing', 'shipped', 'GA today'), and tracked hashtags.

Recent-search backfill every 15 minutes for accounts not on streaming. Tweet thread reconstruction so multi-tweet launches are ingested as a unit.

Engagement signal capture (likes, reposts, replies) plus author authority scoring (verified status, follower count, prior accuracy).

LLM sub-classifier labels each candidate as launch, funding, opinion, meme, or unrelated.

Other sources: Google Trends rising queries, Product Hunt daily AI launches, RSS feeds (default bundle of ~20 publications), AI directories, and per-channel custom URLs.

Compliance guardrail: tweet content is never quoted verbatim in generated reels — a transformation step is enforced in the script generator.

### Ranking, generation, rendering, and scoring

Deduplication clusters candidates by title-embedding cosine similarity above 0.88. Freshness gate rejects items older than 48 hours (configurable).

Verification pass flags vapor launches and unsourced claims; cross-source corroboration (e.g., Product Hunt + press article) boosts rank.

Per top-N idea (default 5), the system generates a complete creative bundle: hook (first 3 seconds), script body, CTA, Instagram caption (≤2200 chars), hashtag set, voiceover with pause and emphasis markers, and per-scene visual prompts.

Reels rendered at 1080×1920 H.264/AAC, 15–45 seconds, ≤90 MB, using Remotion or FFmpeg with stock footage and Ken-Burns image pans, ElevenLabs or Azure TTS voiceover, burned-in subtitles, and brand intro/outro.

Scoring engine rates 6 dimensions (trend relevance, viral hook, clarity, audience fit, platform fit, brand safety) 0–10 each with rationale, plus a weighted composite. Hard threshold below 7 auto-discards; 7–8.5 requires manual approval; above 8.5 may auto-publish if the channel allows.

### Approval and publishing

Approval email includes inline video preview, hook, full script, caption, hashtags, score breakdown table, and source links — plus three signed action links (Approve / Reject / Regenerate).

Action links are JWT-signed, single-use, expire in 48 hours, and log IP and user-agent for audit. A 24-hour reminder is sent if no action; auto-expire at 48 hours.

Reject can take a free-text reason that is fed back into the regeneration prompt.

On approval, Instagram Content Publishing API is invoked: container creation with caption + hosted video URL, polling until FINISHED, then publish. Failures retry with exponential backoff.

Music licensing handled via Meta Sound Collection (the only licensed source for Business accounts).

---

## MICROSERVICE 2 — META ADS + CRM INTELLIGENCE

### Connection and ingestion

Meta OAuth with required scopes — ads_management, ads_read, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_metadata, business_management, and instagram_content_publish where reused.

Selection UI walks Business → Ad Account → Page → Instagram Account. Tokens are stored encrypted with per-tenant DEK; System User tokens preferred for production stability.

Token health monitor pings daily and surfaces a re-auth prompt 7 days before expiry. Permission validation runs on connect and every scheduled sync.

Backfill of 90 days of campaigns, ad sets, ads, creatives, and insights on connect. Hourly incremental sync for active campaigns; 6-hourly for paused. Insight metrics: spend, impressions, reach, clicks, CTR, CPM, CPC, conversions, conversion value, frequency.

Lead Ads delivered via Meta webhook (preferred over polling) with signature verification and idempotency on lead_id.

### Ad generation and campaign creation

Conversational input (e.g., 'create ad for WhatsApp automation, D2C brands India, ₹1000/day'). GenUI Ad Builder asks targeted follow-ups only for missing fields.

Output per generation: campaign objective, audience definition (location, age, interests, custom audiences), placements, daily budget, schedule, ad format, three primary text variants, three headline variants, description, CTA, creative brief, landing-page suggestion, and risk flag.

Compliance pre-check scans against Meta Ad Policy categories before submission; historic ad performance from the same account used as few-shot examples.

Two-stage publish: PhotonX-side draft with full ad object tree → user approval → push to Meta via Marketing API with idempotency key. Validation pass checks budget, audience size, and creative spec.

Rollback via pause/archive (Meta restriction — campaigns aren't deletable). External changes in Meta Ads Manager mirror back within 15 minutes.

### CRM and analytics

Lead schema captures full name, phone (E.164), email, custom form fields, full attribution lineage (campaign/ad-set/ad/creative IDs and UTMs), status (New, Contacted, Interested, Demo Booked, Won, Lost), owner, follow-up timestamp, append-only notes, received_at, and touched_at.

Auto-assignment by round-robin or by location/campaign/keyword; per-status SLA timers; bulk import/export; lead deduplication on phone+email within a 30-day window.

GenUI analytics: tool-calling over typed analytics functions (list_campaigns, get_campaign_performance, top_creatives_by_metric, lead_funnel_breakdown, anomaly_detect). LLM never sees raw SQL. Responses pair text with auto-selected chart components and offer suggested next prompts.

Action prompts (e.g., 'pause campaign X') surface as buttons that go through normal approval, not direct API calls.

Daily and weekly AI summaries with explicit recommendations — PAUSE on poor performance, SCALE for top performers with budget headroom, REFRESH_CREATIVE on fatigue (frequency above 3 with CTR drop) — each linked to underlying data.

### Cross-cutting

Multi-tenant isolation; per-tenant DEK encryption of OAuth tokens and lead PII; signed approval links; webhook signature verification.

Right-to-erasure on lead PII; configurable retention (default 24 months); audit log on PII access for 12 months.

Targets: 99.9% availability, GenUI query P95 under 5s, ad-creation push P95 under 10s, trend-ingestion freshness within 15 minutes, lead-webhook to CRM under 60 seconds.

---

## SUCCESS CRITERIA

- User creates an 'AI Info Channel' in under 2 minutes; within 1 hour the system has fetched at least 20 candidates and returned 5 verified, cited trends.
- End-to-end (channel created → approved Reel live on Instagram) is achievable within 15 minutes for a manual-approval channel.
- Each top idea produces a complete creative bundle within 60 seconds, scored across all 6 dimensions with rationale; sub-7 scores are auto-discarded.
- Approval email is delivered with inline preview and three working signed links; Approve transitions to publish, Regenerate produces a fresh variant within 60 seconds.
- Meta OAuth completes in under 90 seconds with all required permissions; 90-day backfill completes within 5 minutes for an account with up to 100 ads.
- A new lead from a Meta form lands in CRM with full attribution within 60 seconds.
- User asks 'create ad for WhatsApp automation, D2C, ₹1000/day' — full draft is returned within 30 seconds; on approval the campaign is live in Meta within 2 minutes.
- GenUI question 'which ad got more leads this week?' returns a ranked answer with chart in under 5 seconds, citing data sources.
- Daily AI summary email contains at least 3 actionable recommendations, each linked to underlying data.
- Every PhotonX-created campaign can be paused or archived from the dashboard; manual changes in Meta Ads Manager mirror back within 15 minutes.
