# GrowthOS GenUI — Tool Registry

> Vision: the GenUI chat interface is the **single control plane** for GrowthOS.
> Every action a user can take in the UI — analytics, approvals, channel config,
> user management, integrations — should be reachable through a natural-language
> conversation. This document is the canonical record of what exists and what to build.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented |
| 🔶 | Planned — high priority |
| 🔷 | Planned — medium priority |
| ⬜ | Planned — low priority / future |

---

## 1. Campaign Analytics

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 1 | `list_campaigns` | ✅ | "What campaigns do I have?" | `stat` (total / active / paused) | `ctwaCampaigns` |
| 2 | `get_campaign_performance` | ✅ | "How did campaign X perform this week?" | `chart` line (spend + clicks) | `ctwaCampaigns`, `ctwaInsightsCache` |
| 3 | `compare_campaigns` | ✅ | "Compare campaign A vs B" | `chart` grouped bar | `ctwaInsightsCache` |
| 4 | `get_spend_summary` | ✅ | "How much have I spent this month?" | `stat` (total spend, daily avg, forecast) | `ctwaInsightsCache` |
| 5 | `anomaly_detect` | ✅ | "Any anomalies in my spend or CTR?" | `stat` flagged campaigns | `ctwaInsightsCache` |
| 6 | `get_meta_account_status` | ✅ | "Is my Meta account connected?", "What's my ad account balance?" | `stat` (account name, balance, token expiry, pixel) | `metaAdAccounts` |
| 7 | `get_conversion_metrics` | 🔷 | "How many WhatsApp conversions this week?" | `chart` line / `stat` | `ctwaConversions`, `ctwaConversations` |

---

## 2. Creative & Content Analytics

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 8 | `top_creatives_by_metric` | ✅ | "Which creative got the most clicks?" | `chart` bar | `creativeBundles`, `ctwaInsightsCache` |
| 9 | `get_creative_details` | 🔶 | "Show me the full script for that creative" | `stat` + text block | `creativeBundles` |
| 10 | `get_approval_status` | 🔶 | "Which creatives are waiting for approval?" | `stat` (pending / approved / rejected counts) | `creativeBundles`, `approvals` |
| 11 | `get_ad_examples` | ✅ *(internal)* | Few-shot context for ad draft generation | *(no UI event)* | `creativeBundles` |

---

## 3. Leads & Funnel

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 12 | `lead_funnel_breakdown` | ✅ | "What does my lead funnel look like?" | `chart` funnel | `metaAdLeads` |
| 13 | `get_lead_list` | ✅ | "Show me my latest leads", "Who came from the WhatsApp campaign?" | `stat` table | `metaAdLeads` |
| 14 | `get_lead_details` | 🔷 | "Tell me about this lead" | `stat` (name, phone, source campaign, stage, timestamp) | `metaAdLeads` |

---

## 4. Trend Intelligence

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 15 | `get_channel_trends` | ✅ | "What are the trends in the WeNext channel?" | `chart` bar (brand fit + velocity) | `trendScores`, `trendCandidates`, `channels` |
| 16 | `get_top_trends` | ✅ | "What's trending right now across all my channels?" | `chart` bar (top N by composite score) | `trendCandidates`, `trendScores` |
| 17 | `get_trend_details` | ✅ | "Tell me more about the [trend] trend" | `stat` (title, summary, source, lifecycle, emotional DNA, adaptation idea) | `trendCandidates`, `trendScores` |
| 18 | `get_channel_performance` | ✅ | "How is my content pipeline performing?" | `chart` bar (bundles / published / avg score per channel) | `creativeBundles`, `channels` |
| 19 | `get_channel_list` | ✅ | "What channels do I have?", "List all my channels" | `stat` (name, niche, status, language, tone) | `channels` |

---

## 5. Ad Builder

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 20 | `create_ad_draft` | ✅ | "Create an ad for WhatsApp automation, D2C India, ₹1000/day" | `ad_draft` card | *(LLM generation)* |
| 21 | `get_audience_presets` | 🔷 | "What audience presets do I have saved?" | `stat` list | `audiencePresets` |
| 22 | `save_audience_preset` | 🔷 | "Save this audience as a preset called D2C India" | `action` button | `audiencePresets` |

---

## 6. Approval Pipeline

> All mutating tools surface a **confirmation button** in the UI — they never act directly.

| # | Tool | Status | What it answers | Output | Tables |
|---|------|--------|----------------|--------|--------|
| 23 | `get_pending_approvals` | 🔶 | "What's waiting for approval?", "Show pending reviews" | `stat` (count + list by stage) | `approvals`, `creativeBundles` |
| 24 | `get_approval_history` | 🔷 | "Show approved/rejected creatives this month" | `chart` bar or `stat` | `approvals` |
| 25 | `approve_bundle` *(mutating)* | 🔶 | "Approve that creative" | `action` button → `PATCH /creatives/:id` | `approvals`, `creativeBundles` |
| 26 | `reject_bundle` *(mutating)* | 🔶 | "Reject and ask for a regeneration" | `action` button → triggers regen pipeline | `approvals`, `creativeBundles` |
| 27 | `send_approval_reminder` *(mutating)* | 🔷 | "Send a reminder to the approver" | `action` button → email | `approvals` |
| 28 | `get_topic_cooldowns` | ⬜ | "What topics are on cooldown?" | `stat` list | `topicCooldowns` |

---

## 7. Campaign Mutations

> Already implemented — surfaced as confirmation buttons.

| # | Tool | Status | Action |
|---|------|--------|--------|
| 29 | `pause_campaign` | ✅ *(mutating)* | "Pause campaign X" → button → Meta API |
| 30 | `scale_budget` | ✅ *(mutating)* | "Scale budget to ₹2000/day" → button → Meta API |
| 31 | `refresh_creative` | ✅ *(mutating)* | "Refresh that creative" → button → regen pipeline |
| 32 | `resume_campaign` | 🔶 *(mutating)* | "Resume campaign X" → button → Meta API |
| 33 | `duplicate_campaign` | 🔷 *(mutating)* | "Duplicate this campaign with a new budget" → button |
| 34 | `schedule_bundle` | 🔶 *(mutating)* | "Schedule this creative for Friday" → button → publishing pipeline |

---

## 8. Channel Configuration

> The user should be able to configure any channel setting through conversation.

| # | Tool | Status | What it does | Tables |
|---|------|--------|-------------|--------|
| 35 | `get_channel_config` | 🔶 | "Show me the WeNext channel settings" | `channels` |
| 36 | `update_channel_tone` *(mutating)* | 🔶 | "Change WeNext tone to witty and bold" → button | `channels` |
| 37 | `update_posting_schedule` *(mutating)* | 🔶 | "Change posting to 5x/week" → button | `channels` |
| 38 | `update_trend_sources` *(mutating)* | 🔷 | "Disable Reddit trends for WeNext" → button | `channels.trend_sources` |
| 39 | `update_blocked_topics` *(mutating)* | 🔷 | "Block political content from WeNext" → button | `channels.blocked_topics` |
| 40 | `update_tracked_keywords` *(mutating)* | 🔷 | "Track 'WhatsApp automation' as a keyword" → button | `channels.tracked_keywords` |
| 41 | `update_auto_publish_threshold` *(mutating)* | 🔷 | "Auto-publish creatives with score above 9" → button | `channels.auto_publish_threshold` |
| 42 | `create_channel` *(mutating)* | 🔷 | "Create a new channel for brand X, SaaS niche" → form flow | `channels` |

---

## 9. User Management

| # | Tool | Status | What it does | Tables |
|---|------|--------|-------------|--------|
| 43 | `get_team_members` | 🔶 | "Who's on my team?", "List all users" | `users` |
| 44 | `get_approver_list` | 🔶 | "Who are the approvers for WeNext?" | `approvals`, `channels` |
| 45 | `update_approver_email` *(mutating)* | 🔷 | "Change the approver for WeNext to john@..." → button | `channels` (approver_email field) |
| 46 | `invite_team_member` *(mutating)* | ⬜ | "Invite sarah@company.com to the team" → button → email | `users` |

---

## 10. Integrations & Account Health

| # | Tool | Status | What it does | Tables |
|---|------|--------|-------------|--------|
| 47 | `get_meta_integration_health` | 🔶 | "Is my Meta connection healthy?", "When does my token expire?" | `metaAdAccounts` |
| 48 | `get_ad_account_balance` | 🔶 | "What's my ad account balance?" | `metaAdAccounts.balance_cache` |
| 49 | `reconnect_meta_account` *(mutating)* | 🔷 | "My Meta token expired, reconnect it" → button → OAuth flow | `metaAdAccounts` |
| 50 | `get_pixel_status` | 🔷 | "Is my Meta Pixel configured?" | `metaAdAccounts.pixel_id` |

---

## 11. Pipeline & System

| # | Tool | Status | What it does | Tables |
|---|------|--------|-------------|--------|
| 51 | `get_pipeline_status` | 🔶 | "When did the pipeline last run?", "Is content generation running?" | `pipelineRuns` |
| 52 | `get_pipeline_history` | 🔷 | "How many trends were scored last week?" | `pipelineRuns` (ingested, classified, scored, bundles_generated) |
| 53 | `trigger_pipeline_run` *(mutating)* | 🔷 | "Run the pipeline now" → button → POST /pipeline/run | `pipelineRuns` |

---

## Implementation Order

### Phase 1 — Analytics completion (highest ROI, data already in DB)
1. `get_channel_list`
2. `get_lead_list`
3. `get_top_trends`
4. `get_trend_details`
5. `get_spend_summary`
6. `compare_campaigns`
7. `get_meta_account_status` + `get_ad_account_balance`

### Phase 2 — Approvals via chat
1. `get_pending_approvals`
2. `approve_bundle` *(mutating)*
3. `reject_bundle` *(mutating)*
4. `schedule_bundle` *(mutating)*
5. `resume_campaign` *(mutating)*

### Phase 3 — Configuration via chat
1. `get_channel_config`
2. `update_channel_tone`
3. `update_posting_schedule`
4. `get_pipeline_status`

### Phase 4 — User & integration management
1. `get_team_members`
2. `get_approver_list`
3. `update_approver_email`
4. `get_meta_integration_health`
5. `reconnect_meta_account`

### Phase 5 — Full self-service
- Remaining configuration, pipeline triggers, invite flows

---

## Summary

| Domain | Implemented | Planned |
|--------|------------|---------|
| Campaign Analytics | 7 | 0 |
| Creative & Content | 3 | 2 |
| Leads & Funnel | 3 | 1 |
| Trend Intelligence | 5 | 0 |
| Ad Builder | 1 | 2 |
| Approval Pipeline | 0 | 6 |
| Campaign Mutations | 3 | 3 |
| Channel Configuration | 0 | 8 |
| User Management | 0 | 4 |
| Integrations | 0 | 4 |
| Pipeline / System | 0 | 3 |
| **Total** | **24** | **31** |

> 24 tools live · 31 tools to build · 55 total to reach full GenUI control plane
>
> **Phase 1 complete** ✅ — 7 analytics tools added 2026-05-03
