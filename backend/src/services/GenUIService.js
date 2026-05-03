// ─── GenUI Service — orchestrator ─────────────────────────────────────────────
// Handles conversation persistence, SSE streaming, and tool dispatch.
// All tool implementations live in ./genui/*.js — add new domains there.

import OpenAI from 'openai';
import { desc, eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { channels, genuiConversations, genuiMessages } from '../db/schema.js';
import { env } from '../config/env.js';

// ── Tool registry ─────────────────────────────────────────────────────────────
import { TOOL_DEFINITIONS, TOOL_LABELS, MUTATING_TOOLS } from './genui/definitions.js';

// ── Domain tool modules ───────────────────────────────────────────────────────
import {
  listCampaigns,
  getCampaignPerformance,
  compareCampaigns,
  getSpendSummary,
  anomalyDetect,
  getMetaAccountStatus,
} from './genui/campaignTools.js';

import {
  getChannelList,
  getChannelPerformance,
  getChannelTrends,
  getTopTrends,
  getTrendDetails,
} from './genui/trendTools.js';

import {
  leadFunnelBreakdown,
  getLeadList,
} from './genui/leadTools.js';

import {
  topCreativesByMetric,
  getAdExamples,
  createAdDraft,
} from './genui/creativeTools.js';

import {
  getUpcomingEvents,
  getContentCalendar,
  getRecentPublished,
} from './genui/calendarTools.js';

import {
  getUserProfile,
  getChannelConfig,
} from './genui/profileTools.js';

import {
  getInstagramAccounts,
  getInstagramInsights,
} from './genui/instagramTools.js';

import {
  listCreativeBundles,
} from './genui/publishingTools.js';

import {
  getPendingApprovals,
} from './genui/approvalsTools.js';

import {
  getPipelineHistory,
} from './genui/pipelineTools.js';

import {
  generateVideoScript,
} from './genui/mediaGenTools.js';

import {
  getCrmPipeline,
  getCrmLeads,
} from './genui/crmTools.js';

import {
  generateCaption,
} from './genui/captionTools.js';

import {
  getCtwaCampaigns,
  getCtwaPerformance,
} from './genui/ctwaTools.js';

import {
  getAudiencePresets,
} from './genui/audienceTools.js';

import {
  getPlatformStatus,
} from './genui/platformTools.js';

const MODEL = 'gpt-4o-mini';
const MAX_LOOP_ITERATIONS = 5;

// ─── Service ──────────────────────────────────────────────────────────────────

export class GenUIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      console.warn('[GenUI] OPENAI_API_KEY not set — GenUI will be unavailable');
    }
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  // ── Conversation persistence ────────────────────────────────────────────────

  async createConversation(orgId, firstUserMessage) {
    const id = uuidv4();
    const title = firstUserMessage.length > 80
      ? firstUserMessage.slice(0, 77) + '…'
      : firstUserMessage;
    await db.insert(genuiConversations).values({ id, organization_id: orgId, title });
    return id;
  }

  async saveMessage(conversationId, role, parts) {
    await db.insert(genuiMessages).values({
      id: uuidv4(),
      conversation_id: conversationId,
      role,
      parts,
    });
    await db
      .update(genuiConversations)
      .set({ updated_at: new Date() })
      .where(eq(genuiConversations.id, conversationId));
  }

  async listConversations(orgId, limit = 30) {
    return db
      .select({
        id: genuiConversations.id,
        title: genuiConversations.title,
        created_at: genuiConversations.created_at,
        updated_at: genuiConversations.updated_at,
      })
      .from(genuiConversations)
      .where(eq(genuiConversations.organization_id, orgId))
      .orderBy(desc(genuiConversations.updated_at))
      .limit(limit);
  }

  async getConversationMessages(conversationId, orgId) {
    const conv = await db
      .select({ id: genuiConversations.id })
      .from(genuiConversations)
      .where(and(eq(genuiConversations.id, conversationId), eq(genuiConversations.organization_id, orgId)))
      .limit(1);
    if (!conv.length) return null;

    return db
      .select()
      .from(genuiMessages)
      .where(eq(genuiMessages.conversation_id, conversationId))
      .orderBy(genuiMessages.created_at);
  }

  async deleteConversation(conversationId, orgId) {
    const conv = await db
      .select({ id: genuiConversations.id })
      .from(genuiConversations)
      .where(and(eq(genuiConversations.id, conversationId), eq(genuiConversations.organization_id, orgId)))
      .limit(1);
    if (!conv.length) return false;

    await db.delete(genuiMessages).where(eq(genuiMessages.conversation_id, conversationId));
    await db.delete(genuiConversations).where(eq(genuiConversations.id, conversationId));
    return true;
  }

  // ── Public entry point ──────────────────────────────────────────────────────

  async streamChat(messages, orgId, sseEmitter, conversationId = null) {
    if (!env.OPENAI_API_KEY) {
      sseEmitter('error', { message: 'AI assistant is not configured. Set OPENAI_API_KEY.' });
      sseEmitter('done', {});
      return;
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const firstText = lastUserMessage?.content ?? 'New conversation';

    if (!conversationId) {
      conversationId = await this.createConversation(orgId, firstText);
    }

    sseEmitter('conversation_id', { id: conversationId });

    if (lastUserMessage) {
      await this.saveMessage(conversationId, 'user', [{ type: 'text', text: lastUserMessage.content }]);
    }

    const systemPrompt = await this._buildSystemPrompt(orgId);
    let history = messages.slice(-10);
    let iterations = 0;
    const assistantParts = [];
    const calledTools = [];

    try {
      while (iterations < MAX_LOOP_ITERATIONS) {
        iterations++;

        const stream = await this.openai.chat.completions.create({
          model: MODEL,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
          ],
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          stream: true,
        });

        let accumulatedText = '';
        let finishReason = null;
        const pendingToolCalls = {};
        const earlyRunningEmitted = new Set();

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          const fr = chunk.choices[0]?.finish_reason;
          if (fr) finishReason = fr;

          if (delta?.content) {
            accumulatedText += delta.content;
            sseEmitter('text', { delta: delta.content });
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!pendingToolCalls[tc.index]) {
                pendingToolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) pendingToolCalls[tc.index].id = tc.id;
              if (tc.type) pendingToolCalls[tc.index].type = tc.type;
              if (tc.function?.name) {
                const hadNoName = !pendingToolCalls[tc.index].function.name;
                pendingToolCalls[tc.index].function.name += tc.function.name;
                if (hadNoName && pendingToolCalls[tc.index].function.name) {
                  const toolName = pendingToolCalls[tc.index].function.name;
                  earlyRunningEmitted.add(toolName);
                  sseEmitter('tool_status', {
                    toolName,
                    status: 'running',
                    label: TOOL_LABELS[toolName] ?? `Running ${toolName}…`,
                  });
                }
              }
              if (tc.function?.arguments) pendingToolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }

        if (accumulatedText) {
          assistantParts.push({ type: 'text', text: accumulatedText });
        }

        if (finishReason === 'stop' || finishReason === 'end_turn') {
          const prompts = await this._buildSuggestedPrompts(history, calledTools);
          sseEmitter('suggested_prompts', prompts);
          break;
        }

        if (finishReason === 'tool_calls') {
          const toolUseBlocks = Object.values(pendingToolCalls).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            input: this._safeParseArgs(tc.function.arguments),
          }));

          const toolResults = await this._executeTools(
            toolUseBlocks, orgId, sseEmitter, assistantParts, earlyRunningEmitted, calledTools,
          );

          history = [
            ...history,
            {
              role: 'assistant',
              content: accumulatedText || null,
              tool_calls: Object.values(pendingToolCalls),
            },
            ...toolResults.map((tr) => ({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            })),
          ];
          continue;
        }

        break;
      }

      if (iterations >= MAX_LOOP_ITERATIONS) {
        const limitNote = '\n\n_I reached my reasoning limit. Please try a more specific question._';
        sseEmitter('text', { delta: limitNote });
        assistantParts.push({ type: 'text', text: limitNote });
      }

      if (assistantParts.length) {
        await this.saveMessage(conversationId, 'assistant', assistantParts);
      }
    } catch (err) {
      console.error('[GenUI] streamChat error:', err);
      sseEmitter('error', { message: 'Something went wrong with the AI assistant. Please try again.' });
    }

    sseEmitter('done', {});
  }

  // ── Tool execution ──────────────────────────────────────────────────────────

  async _executeTools(toolUseBlocks, orgId, sseEmitter, assistantParts = [], earlyRunningEmitted = new Set(), calledTools = []) {
    const results = await Promise.allSettled(
      toolUseBlocks.map((block) =>
        this._executeSingleTool(block, orgId, sseEmitter, assistantParts, earlyRunningEmitted, calledTools),
      ),
    );

    return results.map((r, i) => ({
      type: 'tool_result',
      tool_use_id: toolUseBlocks[i].id,
      content: r.status === 'fulfilled'
        ? JSON.stringify(r.value.raw)
        : `Error executing tool: ${r.reason?.message ?? r.reason}`,
      is_error: r.status === 'rejected',
    }));
  }

  async _executeSingleTool(block, orgId, sseEmitter, assistantParts = [], earlyRunningEmitted = new Set(), calledTools = []) {
    const { name, input } = block;
    calledTools.push(name);

    if (!earlyRunningEmitted.has(name)) {
      sseEmitter('tool_status', {
        toolName: name,
        status: 'running',
        label: TOOL_LABELS[name] ?? `Running ${name}…`,
      });
    }

    try {
      if (MUTATING_TOOLS.has(name)) {
        const actionPayload = this._buildActionPayload(name, input);
        sseEmitter('action', actionPayload);
        assistantParts.push({ type: 'action', data: actionPayload });
        sseEmitter('tool_status', { toolName: name, status: 'done' });
        return { raw: { queued: true, action: name } };
      }

      const result = await this._queryTool(name, input, orgId);

      if (result.eventType && result.payload) {
        sseEmitter(result.eventType, result.payload);
        assistantParts.push({ type: result.eventType, data: result.payload });
      }

      sseEmitter('tool_status', { toolName: name, status: 'done' });
      return { raw: result.raw };
    } catch (err) {
      sseEmitter('tool_status', { toolName: name, status: 'error' });
      throw err;
    }
  }

  // ── Tool query dispatch ─────────────────────────────────────────────────────
  // To add a new tool: implement it in the appropriate genui/*.js module,
  // add its definition to genui/definitions.js, then add a case here.

  async _queryTool(name, input, orgId) {
    switch (name) {
      // Campaign analytics
      case 'list_campaigns':           return listCampaigns(input, orgId);
      case 'get_campaign_performance': return getCampaignPerformance(input, orgId);
      case 'compare_campaigns':        return compareCampaigns(input, orgId);
      case 'get_spend_summary':        return getSpendSummary(input, orgId);
      case 'anomaly_detect':           return anomalyDetect(input, orgId);
      case 'get_meta_account_status':  return getMetaAccountStatus(orgId);
      // Trends & channels
      case 'get_channel_list':         return getChannelList(input, orgId);
      case 'get_channel_performance':  return getChannelPerformance(input, orgId);
      case 'get_channel_trends':       return getChannelTrends(input, orgId);
      case 'get_top_trends':           return getTopTrends(input, orgId);
      case 'get_trend_details':        return getTrendDetails(input, orgId);
      // Leads
      case 'lead_funnel_breakdown':    return leadFunnelBreakdown(input, orgId);
      case 'get_lead_list':            return getLeadList(input, orgId);
      // Creatives & ads
      case 'top_creatives_by_metric':  return topCreativesByMetric(input, orgId);
      case 'get_ad_examples':          return getAdExamples(input, orgId);
      case 'create_ad_draft':          return createAdDraft(input, orgId, this.openai);
      // Calendar & events
      case 'get_upcoming_events':      return getUpcomingEvents(input, orgId);
      case 'get_content_calendar':     return getContentCalendar(input, orgId);
      case 'get_recent_published':     return getRecentPublished(input, orgId);
      // Profile & channel config
      case 'get_user_profile':         return getUserProfile(input, orgId);
      case 'get_channel_config':       return getChannelConfig(input, orgId);
      // Instagram
      case 'get_instagram_accounts':   return getInstagramAccounts(input, orgId);
      case 'get_instagram_insights':   return getInstagramInsights(input, orgId);
      // Publishing
      case 'list_creative_bundles':    return listCreativeBundles(input, orgId);
      // Approvals
      case 'get_pending_approvals':    return getPendingApprovals(input, orgId);
      // Pipeline
      case 'get_pipeline_history':     return getPipelineHistory(input, orgId);
      // Media generation
      case 'generate_video_script':    return generateVideoScript(input, orgId, this.openai);
      // CRM
      case 'get_crm_pipeline':         return getCrmPipeline(input, orgId);
      case 'get_crm_leads':            return getCrmLeads(input, orgId);
      // Caption generation
      case 'generate_caption':         return generateCaption(input, orgId, this.openai);
      // CTWA
      case 'get_ctwa_campaigns':       return getCtwaCampaigns(input, orgId);
      case 'get_ctwa_performance':     return getCtwaPerformance(input, orgId);
      // Audience presets
      case 'get_audience_presets':     return getAudiencePresets(input, orgId);
      // Platform health
      case 'get_platform_status':      return getPlatformStatus(input, orgId);
      default:
        return { raw: {}, eventType: null, payload: null };
    }
  }

  // ── Action payload builder (mutating tools only) ────────────────────────────

  _buildActionPayload(toolName, input) {
    switch (toolName) {
      case 'pause_campaign':
        return {
          label: `Pause "${input.campaign_name}"`,
          actionType: 'pause_campaign',
          payload: { campaignId: input.campaign_id, campaignName: input.campaign_name },
        };
      case 'scale_budget':
        return {
          label: `Scale "${input.campaign_name}" to ${input.new_budget}`,
          actionType: 'scale_budget',
          payload: { campaignId: input.campaign_id, newBudget: input.new_budget },
        };
      case 'refresh_creative':
        return {
          label: `Refresh creative: "${input.bundle_hook}"`,
          actionType: 'refresh_creative',
          payload: { bundleId: input.bundle_id },
        };
      // Profile
      case 'update_user_profile':
        return {
          label: 'Update profile',
          actionType: 'update_user_profile',
          payload: input,
        };
      case 'update_channel_config':
        return {
          label: `Update channel settings`,
          actionType: 'update_channel_config',
          payload: input,
        };
      // Instagram / Meta connections
      case 'connect_instagram':
        return {
          label: 'Connect Instagram Account →',
          actionType: 'connect_instagram',
          payload: { redirectTo: '/settings/integrations' },
        };
      case 'connect_meta_ads':
        return {
          label: 'Connect Meta Ads Account →',
          actionType: 'connect_meta_ads',
          payload: { redirectTo: '/settings/integrations' },
        };
      // Publishing
      case 'publish_to_instagram':
        return {
          label: `Publish "${input.bundle_hook}" to Instagram`,
          actionType: 'publish_to_instagram',
          payload: { bundleId: input.bundle_id },
        };
      case 'schedule_instagram_post':
        return {
          label: `Schedule "${input.bundle_hook}" for ${input.scheduled_at}`,
          actionType: 'schedule_instagram_post',
          payload: { bundleId: input.bundle_id, scheduledAt: input.scheduled_at },
        };
      // Approvals
      case 'approve_content':
        return {
          label: `Approve: "${input.bundle_hook}"`,
          actionType: 'approve_content',
          payload: { bundleId: input.bundle_id },
        };
      case 'reject_content':
        return {
          label: `Reject: "${input.bundle_hook}"${input.reason ? ` — ${input.reason}` : ''}`,
          actionType: 'reject_content',
          payload: { bundleId: input.bundle_id, reason: input.reason },
        };
      case 'send_approval_reminder':
        return {
          label: 'Resend approval reminder',
          actionType: 'send_approval_reminder',
          payload: { bundleId: input.bundle_id },
        };
      // Pipeline
      case 'run_trend_pipeline':
        return {
          label: 'Run Trend Pipeline',
          actionType: 'run_trend_pipeline',
          payload: {},
        };
      // Media generation
      case 'generate_image':
        return {
          label: `Generate image for bundle`,
          actionType: 'generate_image',
          payload: { bundleId: input.bundle_id, prompt: input.image_prompt, style: input.style },
        };
      case 'generate_carousel':
        return {
          label: `Generate ${input.slide_prompts?.length ?? 0}-slide carousel`,
          actionType: 'generate_carousel',
          payload: { bundleId: input.bundle_id, slidePrompts: input.slide_prompts, style: input.style },
        };
      // CRM
      case 'move_lead_stage':
        return {
          label: `Move "${input.lead_name}" → ${input.stage_name}`,
          actionType: 'move_lead_stage',
          payload: { leadId: input.lead_id, stageId: input.stage_id },
        };
      case 'add_lead_note':
        return {
          label: `Add note to "${input.lead_name}"`,
          actionType: 'add_lead_note',
          payload: { leadId: input.lead_id, note: input.note },
        };
      // Audience presets
      case 'create_audience_preset':
        return {
          label: `Save audience: "${input.name}"`,
          actionType: 'create_audience_preset',
          payload: input,
        };
      default:
        return { label: toolName, actionType: toolName, payload: input };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _safeParseArgs(args) {
    try {
      return JSON.parse(args || '{}');
    } catch {
      return {};
    }
  }

  async _buildSystemPrompt(orgId) {
    let orgName = 'your organisation';
    try {
      const ch = await db
        .select({ brand_name: channels.brand_name })
        .from(channels)
        .where(eq(channels.organization_id, orgId))
        .limit(1);
      if (ch[0]?.brand_name) orgName = ch[0].brand_name;
    } catch { /* non-fatal */ }

    return `You are the GrowthOS AI assistant for ${orgName}. You help users understand campaign performance, analyse content, manage approvals, create Meta ads, and plan their content calendar.

Available data & capabilities:
- Meta campaigns: spend, impressions, clicks, CTR, CPC, anomaly detection
- CTWA (Click-to-WhatsApp): campaign list, performance metrics (conversations, conversion rate)
- Content channels: config, trends, scores, performance
- Creative bundles: list, status, approve/reject/publish/schedule (via action buttons)
- Meta ad leads: funnel breakdown, lead list
- CRM: pipeline stages with lead counts, lead list with follow-up dates, move stage / add note (via buttons)
- Meta ad account: health, balance, token expiry, pixel
- Instagram accounts: connected accounts, follower stats, token status, connect new (via button)
- Audience presets: saved targeting configs, create new (via button)
- Calendar: upcoming festivals & events, scheduled content, recently published posts
- Pipeline: history, trigger new run (via button)
- Profile: user account info, channel configuration
- Media generation: write video/reel scripts; generate captions & hashtags; generate images & carousels (via buttons)
- Platform status: overall health check of all connections and services

Rules:
- Always call tools to fetch real data. Never fabricate metrics.
- For ad creation: if the brief is incomplete, ask ONE clarifying question at a time before calling create_ad_draft.
- For ALL mutating actions (pause, scale, publish, approve, connect, generate): always call the tool — it surfaces a confirmation button. Never claim an action was taken without the user confirming via that button.
- When comparing campaigns: first call list_campaigns to get IDs, then call compare_campaigns.
- For "connect instagram" / "connect meta ads": call connect_instagram / connect_meta_ads — they will show an OAuth button.
- For script writing: call generate_video_script directly (it's a query, not a button).
- Keep responses concise and actionable. After showing data, give 1–2 sentence insight.
- Today: ${new Date().toISOString().slice(0, 10)}`;
  }

  async _buildSuggestedPrompts(history, calledTools = []) {
    try {
      const recentMessages = history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 400) }));

      const toolContext = calledTools.length
        ? `Tools used: ${calledTools.join(', ')}.`
        : '';

      const response = await this.openai.chat.completions.create({
        model: MODEL,
        max_tokens: 150,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You suggest follow-up questions for a marketing AI assistant. ${toolContext}
Based on the conversation below, suggest exactly 4 short follow-up questions the user would naturally ask next about their Meta ads, campaigns, creatives, or leads.
Rules: each question under 60 characters, specific to what was just discussed, not repeating anything already asked.
Return ONLY a valid JSON array of 4 strings. No explanation, no markdown, just the JSON array.`,
          },
          ...recentMessages,
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 4).map(String);
        }
      }
    } catch { /* fall through */ }

    return [
      'What channels do I have?',
      'How much have I spent this month?',
      "What's trending right now?",
      'Is my Meta account connected?',
    ];
  }
}

export const genUIService = new GenUIService();
