// ─── GenUI — Tool registry ────────────────────────────────────────────────────
// All OpenAI function-calling definitions, display labels, and mutating-tool
// classification live here. GenUIService.js imports from this file only.

// Tools that mutate state — never executed server-side; surfaced as action buttons
export const MUTATING_TOOLS = new Set([
  'pause_campaign',
  'scale_budget',
  'refresh_creative',
]);

export const TOOL_LABELS = {
  // Campaign analytics
  list_campaigns:            'Fetching campaigns…',
  get_campaign_performance:  'Querying campaign performance…',
  compare_campaigns:         'Comparing campaigns…',
  get_spend_summary:         'Calculating spend summary…',
  anomaly_detect:            'Detecting anomalies…',
  get_meta_account_status:   'Checking Meta account…',
  // Trends & channels
  get_channel_performance:   'Fetching channel performance…',
  get_channel_trends:        'Fetching channel trends…',
  get_top_trends:            'Fetching top trends…',
  get_trend_details:         'Loading trend details…',
  get_channel_list:          'Fetching channels…',
  // Leads
  lead_funnel_breakdown:     'Analysing lead funnel…',
  get_lead_list:             'Loading leads…',
  // Creatives & ads
  top_creatives_by_metric:   'Ranking creatives…',
  get_ad_examples:           'Loading ad examples…',
  create_ad_draft:           'Building ad draft…',
  // Mutating
  pause_campaign:            'Preparing pause action…',
  scale_budget:              'Preparing budget action…',
  refresh_creative:          'Preparing refresh action…',
};

export const TOOL_DEFINITIONS = [
  // ── Campaign analytics ──────────────────────────────────────────────────────
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
      name: 'compare_campaigns',
      description: 'Compare 2–3 campaigns side-by-side on spend and clicks using a grouped bar chart. Use when the user asks "compare campaign A vs B", "which campaign spent more?", or "A vs B performance".',
      parameters: {
        type: 'object',
        required: ['campaign_ids'],
        properties: {
          campaign_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of 2–3 internal campaign UUIDs to compare.',
          },
          days: { type: 'number', description: 'Look-back window in days. Default 14.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spend_summary',
      description: 'Return an aggregated spend summary across all campaigns: total spend, daily average, number of active days, and a simple 30-day forecast. Use for "how much have I spent?", "what is my total ad spend?", or "forecast my spend".',
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
      name: 'get_meta_account_status',
      description: 'Return Meta ad account health: account name, currency, balance, token expiry date, pixel ID, and connection status. Use for "is my Meta account connected?", "what is my ad account balance?", "when does my token expire?", or "is my pixel set up?".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  // ── Trends & channels ───────────────────────────────────────────────────────
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
      name: 'get_channel_trends',
      description: 'Return the top scored trends for a content channel — shows trend title, brand-fit score, velocity, lifecycle stage, and adaptation idea. Use this when the user asks "what are the trends in X channel", "what should I post for X", or "show me trends for X". Always use this instead of get_channel_performance when the question is about trends, topics, or content ideas.',
      parameters: {
        type: 'object',
        properties: {
          channel_name: { type: 'string', description: 'Channel brand name or partial name to search for (case-insensitive). Leave empty to show top trends across all channels.' },
          limit: { type: 'number', description: 'Number of top trends to return. Default 10.' },
          lifecycle_stage: {
            type: 'string',
            enum: ['seed', 'sprout', 'peak', 'saturated'],
            description: 'Filter by lifecycle stage. Omit to return all stages.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_trends',
      description: 'Return the highest-scoring trends across ALL channels, ranked by composite brand-fit score. Use for "what is trending right now?", "top trends across my channels", or "what should I post about?".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of top trends to return. Default 10.' },
          lifecycle_stage: {
            type: 'string',
            enum: ['seed', 'sprout', 'peak', 'saturated'],
            description: 'Filter by lifecycle stage. Omit to return all stages.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trend_details',
      description: 'Get full details about a specific trend: summary, source, lifecycle stage, emotional DNA, velocity, brand-fit scores, and adaptation idea. Use when the user asks "tell me more about [trend]" or "what is the [topic] trend about?".',
      parameters: {
        type: 'object',
        required: ['trend_title'],
        properties: {
          trend_title: { type: 'string', description: 'Partial or full trend title to search for (case-insensitive).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_list',
      description: 'List all content channels for this organisation. Returns name, niche, status, language, and tone. Use when the user asks "what channels do I have?", "list my channels", or "show me my brands".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max channels to return. Default 10.' },
        },
      },
    },
  },
  // ── Leads ───────────────────────────────────────────────────────────────────
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
      name: 'get_lead_list',
      description: 'Return a list of the most recent leads captured via Meta lead ads. Use when the user asks "show me my leads", "who are my latest leads", or "leads from campaign X".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max leads to return. Default 10.' },
          days: { type: 'number', description: 'Look-back window in days. Default 30.' },
          campaign_name: { type: 'string', description: 'Filter by campaign name (partial match). Omit for all campaigns.' },
        },
      },
    },
  },
  // ── Creatives & ads ─────────────────────────────────────────────────────────
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
  // ── Campaign mutations ───────────────────────────────────────────────────────
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
