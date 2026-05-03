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

    return `You are the GrowthOS AI assistant for ${orgName}. You help users understand campaign performance, analyse content results, manage approvals, and create Meta ads.

Available data: Meta campaigns, ad insights (spend, impressions, clicks, CTR, CPC), leads list, creative bundles, content channels (config, trends, scores), Meta ad account health (balance, token expiry, pixel), and pipeline run history.

Rules:
- For analytics questions: always call tools to fetch real data. Never fabricate metrics.
- For ad creation: if the brief is incomplete, ask ONE clarifying question at a time before calling create_ad_draft.
- For mutating actions (pause, scale budget, refresh creative): always use the corresponding tool — it will surface a confirmation button to the user. Never claim an action was taken without the user confirming.
- When comparing campaigns: first call list_campaigns to get IDs if not provided, then call compare_campaigns.
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
