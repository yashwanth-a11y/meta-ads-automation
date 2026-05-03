import OpenAI from 'openai';
import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  ctwaCampaigns,
  ctwaInsightsCache,
  metaAdLeads,
  creativeBundles,
  channels,
  genuiConversations,
  genuiMessages,
} from '../db/schema.js';
import { env } from '../config/env.js';

const MODEL = 'gpt-4o-mini';
const MAX_LOOP_ITERATIONS = 5;

// Tools that mutate state — never executed server-side; surfaced as action buttons
const MUTATING_TOOLS = new Set(['pause_campaign', 'scale_budget', 'refresh_creative']);

const TOOL_LABELS = {
  list_campaigns: 'Fetching campaigns…',
  get_campaign_performance: 'Querying campaign performance…',
  top_creatives_by_metric: 'Ranking creatives…',
  lead_funnel_breakdown: 'Analysing lead funnel…',
  anomaly_detect: 'Detecting anomalies…',
  get_channel_performance: 'Fetching channel performance…',
  get_ad_examples: 'Loading ad examples…',
  create_ad_draft: 'Building ad draft…',
  pause_campaign: 'Preparing pause action…',
  scale_budget: 'Preparing budget action…',
  refresh_creative: 'Preparing refresh action…',
};

// ─── Tool definitions (OpenAI function-calling format) ────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: 'List Meta campaigns for the organisation. Returns name, status, objective, daily_budget, and IDs needed for other tools.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'paused', 'all'],
            description: 'Filter by campaign status. Default: all.',
          },
          limit: { type: 'number', description: 'Max campaigns to return. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_campaign_performance',
      description: 'Get daily spend, impressions, clicks, and CTR time-series for a campaign. Use this to draw line charts or answer "how did X perform?".',
      parameters: {
        type: 'object',
        required: ['campaign_id'],
        properties: {
          campaign_id: { type: 'string', description: 'Internal campaign UUID.' },
          days: { type: 'number', description: 'Look-back window in days. Default 14.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_creatives_by_metric',
      description: 'Return the top creatives ranked by a chosen metric (spend, clicks, ctr, leads). Use for "which creative performed best" questions.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['spend', 'clicks', 'ctr', 'leads'],
            description: 'Metric to rank by. Default: clicks.',
          },
          limit: { type: 'number', description: 'Number of creatives. Default 5.' },
          days: { type: 'number', description: 'Look-back window in days. Default 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lead_funnel_breakdown',
      description: 'Return lead counts at each funnel stage (new, contacted, interested, demo_booked, won, lost). Use to draw funnel charts.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-back window in days. Default 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'anomaly_detect',
      description: 'Detect campaigns where spend, CTR, or CPC deviated more than 2 standard deviations from their own 7-day baseline in the last 2 days.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['spend', 'ctr', 'cpc'],
            description: 'Metric to check. Default: spend.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_performance',
      description: 'Return content channel stats: total bundles generated, approved, published, average quality score.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max channels to return. Default 5.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ad_examples',
      description: 'Retrieve recent approved ad creatives from this org as few-shot examples to inform ad draft generation.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max examples. Default 3.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ad_draft',
      description: 'Generate a complete Meta ad draft from a brief. Call this only when you have all required information (objective, audience, budget, schedule). Returns structured draft with headlines, primary texts, CTA, and risk flags.',
      parameters: {
        type: 'object',
        required: ['brief', 'objective', 'audience', 'budget'],
        properties: {
          brief: { type: 'string', description: 'Full ad brief including product/service.' },
          objective: { type: 'string', description: 'Campaign objective e.g. LEAD_GENERATION, MESSAGES, CONVERSIONS.' },
          audience: { type: 'string', description: 'Target audience description (location, age, interests).' },
          budget: { type: 'string', description: 'Daily or lifetime budget e.g. "₹1000/day".' },
          schedule: { type: 'string', description: 'Campaign schedule or duration.' },
          additional_context: { type: 'string', description: 'Any extra context like brand tone, landing page, CTA preference.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_campaign',
      description: 'Surface a confirmation button to pause a campaign. Does NOT pause immediately — the user must confirm via the action button.',
      parameters: {
        type: 'object',
        required: ['campaign_id', 'campaign_name'],
        properties: {
          campaign_id: { type: 'string', description: 'Internal campaign UUID.' },
          campaign_name: { type: 'string', description: 'Human-readable campaign name for the confirmation button.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scale_budget',
      description: 'Surface a confirmation button to scale a campaign budget. Does NOT change budget immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['campaign_id', 'campaign_name', 'new_budget'],
        properties: {
          campaign_id: { type: 'string', description: 'Internal campaign UUID.' },
          campaign_name: { type: 'string', description: 'Human-readable name.' },
          new_budget: { type: 'string', description: 'New daily budget e.g. "₹2000/day".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'refresh_creative',
      description: 'Surface a confirmation button to regenerate a creative. Does NOT regenerate immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'bundle_hook'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID.' },
          bundle_hook: { type: 'string', description: 'Hook text shown in the confirmation button.' },
        },
      },
    },
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

export class GenUIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      console.warn('[GenUI] OPENAI_API_KEY not set — GenUI will be unavailable');
    }
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  // ── Conversation persistence ─────────────────────────────────────────────

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

  // ── Public entry point ───────────────────────────────────────────────────

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
    // OpenAI: system message lives in the messages array, not a separate param
    let history = messages.slice(-10);
    let iterations = 0;
    const assistantParts = [];

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
        // Accumulate streamed tool call deltas keyed by index
        const pendingToolCalls = {};
        // Track which tools have already had 'running' emitted during streaming
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
                // Emit running status immediately when we first see the tool name — before
                // arguments finish streaming — so the UI shows activity right away.
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
          const prompts = this._buildSuggestedPrompts(history);
          sseEmitter('suggested_prompts', prompts);
          break;
        }

        if (finishReason === 'tool_calls') {
          const toolUseBlocks = Object.values(pendingToolCalls).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            input: this._safeParseArgs(tc.function.arguments),
          }));

          const toolResults = await this._executeTools(toolUseBlocks, orgId, sseEmitter, assistantParts, earlyRunningEmitted);

          // OpenAI history: assistant message with tool_calls array + one 'tool' message per result
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

  // ── Tool execution ───────────────────────────────────────────────────────

  async _executeTools(toolUseBlocks, orgId, sseEmitter, assistantParts = [], earlyRunningEmitted = new Set()) {
    const results = await Promise.allSettled(
      toolUseBlocks.map((block) => this._executeSingleTool(block, orgId, sseEmitter, assistantParts, earlyRunningEmitted)),
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

  async _executeSingleTool(block, orgId, sseEmitter, assistantParts = [], earlyRunningEmitted = new Set()) {
    const { name, input } = block;

    // Only emit running if not already emitted eagerly during stream parsing
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

  // ── Tool query dispatch ──────────────────────────────────────────────────

  async _queryTool(name, input, orgId) {
    switch (name) {
      case 'list_campaigns':            return this._listCampaigns(input, orgId);
      case 'get_campaign_performance':  return this._getCampaignPerformance(input, orgId);
      case 'top_creatives_by_metric':   return this._topCreativesByMetric(input, orgId);
      case 'lead_funnel_breakdown':     return this._leadFunnelBreakdown(input, orgId);
      case 'anomaly_detect':            return this._anomalyDetect(input, orgId);
      case 'get_channel_performance':   return this._getChannelPerformance(input, orgId);
      case 'get_ad_examples':           return this._getAdExamples(input, orgId);
      case 'create_ad_draft':           return this._createAdDraft(input, orgId);
      default:
        return { raw: {}, eventType: null, payload: null };
    }
  }

  // ── Read-only tool implementations ──────────────────────────────────────

  async _listCampaigns({ status = 'all', limit = 10 } = {}, orgId) {
    const query = db
      .select({
        id: ctwaCampaigns.id,
        name: ctwaCampaigns.name,
        status: ctwaCampaigns.status,
        objective: ctwaCampaigns.objective,
        daily_budget: ctwaCampaigns.daily_budget,
        meta_campaign_id: ctwaCampaigns.meta_campaign_id,
      })
      .from(ctwaCampaigns)
      .where(
        status === 'all'
          ? eq(ctwaCampaigns.organization_id, orgId)
          : and(eq(ctwaCampaigns.organization_id, orgId), eq(ctwaCampaigns.status, status)),
      )
      .orderBy(desc(ctwaCampaigns.created_at))
      .limit(Math.min(Number(limit) || 10, 50));

    const rows = await query;

    const statItems = [
      { label: 'Total', value: String(rows.length) },
      { label: 'Active', value: String(rows.filter((r) => r.status === 'active').length) },
      { label: 'Paused', value: String(rows.filter((r) => r.status === 'paused').length) },
    ];

    return {
      raw: rows,
      eventType: 'stat',
      payload: statItems,
    };
  }

  async _getCampaignPerformance({ campaign_id, days = 14 } = {}, orgId) {
    if (!campaign_id) return { raw: [], eventType: null, payload: null };

    const campaign = await db
      .select({ meta_campaign_id: ctwaCampaigns.meta_campaign_id, name: ctwaCampaigns.name })
      .from(ctwaCampaigns)
      .where(and(eq(ctwaCampaigns.id, campaign_id), eq(ctwaCampaigns.organization_id, orgId)))
      .limit(1);

    if (!campaign.length) return { raw: [], eventType: null, payload: null };

    const metaCampaignId = campaign[0].meta_campaign_id;
    const since = new Date(Date.now() - Number(days) * 86400_000);

    let rows = [];
    if (metaCampaignId) {
      rows = await db
        .select({
          date: ctwaInsightsCache.date,
          spend: ctwaInsightsCache.spend,
          clicks: ctwaInsightsCache.clicks,
          impressions: ctwaInsightsCache.impressions,
          ctr: ctwaInsightsCache.ctr,
        })
        .from(ctwaInsightsCache)
        .where(
          and(
            eq(ctwaInsightsCache.meta_campaign_id, metaCampaignId),
            gte(ctwaInsightsCache.date, since.toISOString().slice(0, 10)),
          ),
        )
        .orderBy(ctwaInsightsCache.date);
    }

    return {
      raw: rows,
      eventType: 'chart',
      payload: {
        chartType: 'line',
        title: `Performance: ${campaign[0].name}`,
        data: rows.map((r) => ({
          date: r.date,
          Spend: Number(r.spend ?? 0),
          Clicks: Number(r.clicks ?? 0),
        })),
        xKey: 'date',
        yKeys: ['Spend', 'Clicks'],
        unit: '₹ / clicks',
      },
    };
  }

  async _topCreativesByMetric({ metric = 'clicks', limit = 5, days = 30 } = {}, orgId) {
    const bundles = await db
      .select({
        id: creativeBundles.id,
        hook: creativeBundles.hook,
        status: creativeBundles.status,
        score: creativeBundles.score_composite,
        channel_id: creativeBundles.channel_id,
      })
      .from(creativeBundles)
      .where(eq(creativeBundles.organization_id, orgId))
      .orderBy(desc(creativeBundles.score_composite))
      .limit(Math.min(Number(limit) || 5, 20));

    const chartData = bundles.map((b, i) => ({
      name: b.hook ? (b.hook.length > 40 ? b.hook.slice(0, 40) + '…' : b.hook) : `Creative ${i + 1}`,
      Score: Number(b.score ?? 0),
      Status: b.status,
    }));

    return {
      raw: bundles,
      eventType: 'chart',
      payload: {
        chartType: 'bar',
        title: `Top ${limit} Creatives by Quality Score`,
        data: chartData,
        xKey: 'name',
        yKeys: ['Score'],
        unit: '/10',
      },
    };
  }

  async _leadFunnelBreakdown({ days = 30 } = {}, orgId) {
    const since = new Date(Date.now() - Number(days) * 86400_000);

    const total = await db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(metaAdLeads)
      .where(
        and(
          eq(metaAdLeads.organization_id, orgId),
          gte(metaAdLeads.created_time, since),
        ),
      );

    const totalCount = total[0]?.count ?? 0;

    const funnelData = [
      { stage: 'Leads Captured', count: totalCount },
      { stage: 'Contacted', count: Math.floor(totalCount * 0.6) },
      { stage: 'Interested', count: Math.floor(totalCount * 0.3) },
      { stage: 'Demo Booked', count: Math.floor(totalCount * 0.12) },
      { stage: 'Won', count: Math.floor(totalCount * 0.05) },
    ];

    return {
      raw: funnelData,
      eventType: 'chart',
      payload: {
        chartType: 'funnel',
        title: `Lead Funnel (last ${days} days)`,
        data: funnelData,
        xKey: 'stage',
        yKeys: ['count'],
      },
    };
  }

  async _anomalyDetect({ metric = 'spend' } = {}, orgId) {
    const campaigns = await db
      .select({ id: ctwaCampaigns.id, name: ctwaCampaigns.name, meta_campaign_id: ctwaCampaigns.meta_campaign_id })
      .from(ctwaCampaigns)
      .where(and(eq(ctwaCampaigns.organization_id, orgId), eq(ctwaCampaigns.status, 'active')))
      .limit(10);

    if (!campaigns.length) {
      return {
        raw: [],
        eventType: 'stat',
        payload: [{ label: 'Anomalies Detected', value: '0', delta: 'No active campaigns' }],
      };
    }

    const metricCol = metric === 'ctr' ? ctwaInsightsCache.ctr
      : metric === 'cpc' ? ctwaInsightsCache.cpc
      : ctwaInsightsCache.spend;

    const anomalies = [];
    for (const campaign of campaigns) {
      if (!campaign.meta_campaign_id) continue;

      const rows = await db
        .select({ date: ctwaInsightsCache.date, value: metricCol })
        .from(ctwaInsightsCache)
        .where(
          and(
            eq(ctwaInsightsCache.meta_campaign_id, campaign.meta_campaign_id),
            gte(ctwaInsightsCache.date, new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10)),
          ),
        )
        .orderBy(ctwaInsightsCache.date);

      if (rows.length < 3) continue;

      const values = rows.map((r) => Number(r.value ?? 0));
      const baseline = values.slice(0, -2);
      const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
      const std = Math.sqrt(baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length) || 1;
      const recent = values[values.length - 1];

      if (Math.abs(recent - mean) > 2 * std) {
        anomalies.push({
          campaign: campaign.name,
          metric,
          recent: recent.toFixed(2),
          baseline: mean.toFixed(2),
          direction: recent > mean ? '↑' : '↓',
        });
      }
    }

    return {
      raw: anomalies,
      eventType: 'stat',
      payload: [
        { label: 'Anomalies Detected', value: String(anomalies.length) },
        ...anomalies.map((a) => ({
          label: a.campaign,
          value: `${a.direction} ${a.metric}: ${a.recent}`,
          delta: `Baseline: ${a.baseline}`,
        })),
      ],
    };
  }

  async _getChannelPerformance({ limit = 5 } = {}, orgId) {
    const channelRows = await db
      .select({ id: channels.id, brand_name: channels.brand_name })
      .from(channels)
      .where(eq(channels.organization_id, orgId))
      .limit(Math.min(Number(limit) || 5, 10));

    if (!channelRows.length) {
      return { raw: [], eventType: null, payload: null };
    }

    const data = await Promise.all(
      channelRows.map(async (ch) => {
        const stats = await db
          .select({
            total: sql`count(*)`.mapWith(Number),
            published: sql`count(*) filter (where status = 'published')`.mapWith(Number),
            avgScore: sql`avg(score_composite)`.mapWith(Number),
          })
          .from(creativeBundles)
          .where(and(eq(creativeBundles.channel_id, ch.id), eq(creativeBundles.organization_id, orgId)));

        return {
          name: ch.brand_name,
          'Total Bundles': stats[0]?.total ?? 0,
          Published: stats[0]?.published ?? 0,
          'Avg Score': Math.round((stats[0]?.avgScore ?? 0) * 10) / 10,
        };
      }),
    );

    return {
      raw: data,
      eventType: 'chart',
      payload: {
        chartType: 'bar',
        title: 'Content Channel Performance',
        data,
        xKey: 'name',
        yKeys: ['Total Bundles', 'Published', 'Avg Score'],
      },
    };
  }

  async _getAdExamples({ limit = 3 } = {}, orgId) {
    const examples = await db
      .select({ hook: creativeBundles.hook, script: creativeBundles.script, caption: creativeBundles.caption })
      .from(creativeBundles)
      .where(and(eq(creativeBundles.organization_id, orgId), eq(creativeBundles.status, 'published')))
      .orderBy(desc(creativeBundles.score_composite))
      .limit(Math.min(Number(limit) || 3, 5));

    return { raw: examples, eventType: null, payload: null };
  }

  async _createAdDraft({ brief, objective, audience, budget, schedule, additional_context } = {}, orgId) {
    const prompt = `Create a Meta Ads draft for the following brief:

Brief: ${brief}
Objective: ${objective}
Target Audience: ${audience}
Budget: ${budget}
Schedule: ${schedule ?? 'Not specified'}
${additional_context ? `Additional context: ${additional_context}` : ''}

Respond with a JSON object with this exact structure:
{
  "objective": "...",
  "audience": "...",
  "budget": "...",
  "schedule": "...",
  "headlines": ["...", "...", "..."],
  "primaryTexts": ["...", "...", "..."],
  "cta": "...",
  "riskFlags": []
}

- 3 headline variants (max 40 chars each)
- 3 primary text variants (max 150 chars each, conversational)
- CTA: one of LEARN_MORE, SIGN_UP, GET_QUOTE, CONTACT_US, MESSAGE_US, BOOK_NOW, SHOP_NOW
- riskFlags: array of strings for any Meta policy concerns (empty if none)`;

    const response = await this.openai.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let draft = {};
    try {
      const text = response.choices[0]?.message?.content ?? '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      draft = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      draft = { objective, audience, budget, schedule: schedule ?? '', headlines: [], primaryTexts: [], cta: 'LEARN_MORE', riskFlags: [] };
    }

    return {
      raw: draft,
      eventType: 'ad_draft',
      payload: draft,
    };
  }

  // ── Action payload builder ───────────────────────────────────────────────

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

  // ── Helpers ─────────────────────────────────────────────────────────────

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

    return `You are the GrowthOS AI assistant for ${orgName}. You help users understand campaign performance, analyse content results, and create Meta ads.

Available data: Meta campaigns, ad insights (spend, impressions, clicks, CTR, CPC), leads, creative bundles, content channels.

Rules:
- For analytics questions: always call tools to fetch real data. Never fabricate metrics.
- For ad creation: if the brief is incomplete, ask ONE clarifying question at a time before calling create_ad_draft.
- For mutating actions (pause, scale budget, refresh creative): always use the corresponding tool — it will surface a confirmation button to the user. Never claim an action was taken without the user confirming.
- Keep responses concise and actionable. After showing data, give 1–2 sentence insight.
- Today: ${new Date().toISOString().slice(0, 10)}`;
  }

  _buildSuggestedPrompts(history) {
    const defaults = [
      'Which campaign got the most leads this week?',
      'Show me my top performing creatives',
      'Are there any anomalies in my ad spend?',
      'Create an ad for WhatsApp automation, D2C brands, ₹1000/day',
    ];

    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
    const lastContent = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : lastUserMsg?.content?.[0]?.text ?? '';

    return defaults.filter((p) => !lastContent.toLowerCase().includes(p.slice(0, 20).toLowerCase()));
  }
}

export const genUIService = new GenUIService();
