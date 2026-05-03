// ─── GenUI — Tool registry ────────────────────────────────────────────────────
// All OpenAI function-calling definitions, display labels, and mutating-tool
// classification live here. GenUIService.js imports from this file only.

// Tools that mutate state — never executed server-side; surfaced as action buttons
export const MUTATING_TOOLS = new Set([
  // Campaign
  'pause_campaign',
  'scale_budget',
  'refresh_creative',
  // Profile
  'update_user_profile',
  'update_channel_config',
  // Instagram / Meta
  'connect_instagram',
  'connect_meta_ads',
  // Publishing
  'publish_to_instagram',
  'schedule_instagram_post',
  // Approvals
  'approve_content',
  'reject_content',
  'send_approval_reminder',
  // Pipeline
  'run_trend_pipeline',
  // Media generation
  'generate_image',
  'generate_carousel',
  // CRM
  'move_lead_stage',
  'add_lead_note',
  // Audience
  'create_audience_preset',
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
  // Calendar
  get_upcoming_events:       'Loading upcoming events…',
  get_content_calendar:      'Fetching content calendar…',
  get_recent_published:      'Loading recent posts…',
  // Profile
  get_user_profile:          'Loading profile…',
  get_channel_config:        'Loading channel settings…',
  update_user_profile:       'Preparing profile update…',
  update_channel_config:     'Preparing channel update…',
  // Instagram
  get_instagram_accounts:    'Loading Instagram accounts…',
  get_instagram_insights:    'Fetching Instagram insights…',
  connect_instagram:         'Preparing Instagram connection…',
  connect_meta_ads:          'Preparing Meta Ads connection…',
  // Publishing
  list_creative_bundles:     'Loading creative bundles…',
  publish_to_instagram:      'Preparing publish action…',
  schedule_instagram_post:   'Preparing schedule action…',
  // Approvals
  get_pending_approvals:     'Loading pending approvals…',
  approve_content:           'Preparing approval action…',
  reject_content:            'Preparing rejection action…',
  send_approval_reminder:    'Preparing reminder…',
  // Pipeline
  get_pipeline_history:      'Loading pipeline history…',
  run_trend_pipeline:        'Preparing pipeline run…',
  // Media generation
  generate_video_script:     'Writing video script…',
  generate_image:            'Preparing image generation…',
  generate_carousel:         'Preparing carousel generation…',
  // CRM
  get_crm_pipeline:          'Loading CRM pipeline…',
  get_crm_leads:             'Fetching CRM leads…',
  move_lead_stage:           'Preparing stage move…',
  add_lead_note:             'Preparing note…',
  // Caption generation
  generate_caption:          'Writing caption…',
  // CTWA
  get_ctwa_campaigns:        'Fetching WhatsApp campaigns…',
  get_ctwa_performance:      'Fetching WhatsApp performance…',
  // Audience presets
  get_audience_presets:      'Loading audience presets…',
  create_audience_preset:    'Preparing audience preset…',
  // Platform health
  get_platform_status:       'Checking platform status…',
  // Mutating (campaign)
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
  // ── Calendar & events ───────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_upcoming_events',
      description: 'List upcoming festivals, national days, and shopping events relevant for content planning. Use for "what festivals are coming up?", "upcoming events for content", or "what is happening this month?".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days ahead to look. Default 30.' },
          category: { type: 'string', enum: ['festival', 'national', 'international', 'shopping', 'wedding', 'sports', 'tech'], description: 'Filter by event category. Omit for all categories.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_content_calendar',
      description: 'Show the scheduled content calendar — what is queued to be published in the next N days across all channels. Use for "what is scheduled?", "content calendar", or "what posts are coming up?".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days ahead to show. Default 14.' },
          status: { type: 'string', enum: ['draft', 'approved', 'ready', 'scheduled', 'published'], description: 'Filter by bundle status. Omit for upcoming scheduled posts only.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_published',
      description: 'List the most recently published posts across all channels. Use for "what have I published?", "recent posts", or "what went live this week?".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent posts to return. Default 10.' },
        },
      },
    },
  },
  // ── Profile & channel config ────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Return the current user\'s profile: name, email, phone, member since date, and last login. Use for "what is my profile?", "show my account details", or "who am I logged in as?".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_config',
      description: 'Show the configuration and settings for a content channel: niche, tone, language, posting schedule, trend sources, and brand guidelines. Use for "what are my channel settings?", "how is my channel configured?", or "what tone does channel X use?".',
      parameters: {
        type: 'object',
        properties: {
          channel_name: { type: 'string', description: 'Channel brand name to look up. Omit to show the first channel.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_user_profile',
      description: 'Surface a button to update the user\'s profile (name, phone). Does NOT update immediately — the user must confirm via the action button.',
      parameters: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_channel_config',
      description: 'Surface a button to update a channel\'s configuration (tone, niche, posting schedule, trend sources). Does NOT update immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['channel_id'],
        properties: {
          channel_id: { type: 'string', description: 'Channel UUID to update.' },
          tone: { type: 'string' },
          niche: { type: 'string' },
          posting_schedule: { type: 'string' },
        },
      },
    },
  },
  // ── Instagram & Meta connections ────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_instagram_accounts',
      description: 'List all connected Instagram Business accounts: username, follower count, media count, and token status. Use for "what Instagram accounts do I have?", "show my Instagram", or "is my IG connected?".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_instagram_insights',
      description: 'Return detailed insights for a connected Instagram account: followers, following, post count, and token expiry. Use for "Instagram stats", "how many followers do I have?", or "when does my IG token expire?".',
      parameters: {
        type: 'object',
        properties: {
          account_username: { type: 'string', description: 'Instagram @username to look up. Omit for the primary account.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_instagram',
      description: 'Surface a button to connect a new Instagram Business account via OAuth. Use when the user asks "connect instagram", "add instagram account", or "link my IG". Does NOT connect immediately — shows a button to start the OAuth flow.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_meta_ads',
      description: 'Surface a button to connect or reconnect the Meta Ads account. Use when the user asks "connect meta ads", "connect facebook ads", or "set up my ad account".',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ── Publishing ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_creative_bundles',
      description: 'List creative bundles (content pieces) with their status, hook, channel, score, and scheduled publish time. Use for "show my content", "list bundles", "what is in draft?", or "what is approved?".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'generating_images', 'rendering', 'ready', 'approved', 'rejected', 'publishing', 'published'], description: 'Filter by status. Omit for all.' },
          limit: { type: 'number', description: 'Max bundles to return. Default 10.' },
          channel_name: { type: 'string', description: 'Filter by channel brand name (partial match). Omit for all channels.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'publish_to_instagram',
      description: 'Surface a button to manually publish a ready or approved creative bundle to Instagram immediately. Does NOT publish immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'bundle_hook'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID to publish.' },
          bundle_hook: { type: 'string', description: 'Hook text shown in the confirmation button.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_instagram_post',
      description: 'Surface a button to schedule a creative bundle for a specific publish time. Does NOT schedule immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'bundle_hook', 'scheduled_at'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID.' },
          bundle_hook: { type: 'string', description: 'Hook text for the confirmation button.' },
          scheduled_at: { type: 'string', description: 'ISO 8601 datetime to schedule the post.' },
        },
      },
    },
  },
  // ── Approvals ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_pending_approvals',
      description: 'List content bundles currently awaiting approval, showing approver email, stage, and expiry. Use for "what is pending approval?", "approvals queue", or "any content waiting?".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max approvals to return. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_content',
      description: 'Surface a button to approve a creative bundle directly from the dashboard. Does NOT approve immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'bundle_hook'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID to approve.' },
          bundle_hook: { type: 'string', description: 'Hook text for the confirmation button.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_content',
      description: 'Surface a button to reject a creative bundle with a reason. Does NOT reject immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'bundle_hook'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID to reject.' },
          bundle_hook: { type: 'string', description: 'Hook text for the confirmation button.' },
          reason: { type: 'string', description: 'Rejection reason shown in the button.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_approval_reminder',
      description: 'Surface a button to resend the approval email reminder for a pending bundle. Does NOT send immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID.' },
        },
      },
    },
  },
  // ── Pipeline ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_pipeline_history',
      description: 'Show the history of trend pipeline runs: status, trends ingested/classified/scored, bundles generated, and duration. Use for "pipeline history", "last pipeline run", or "how many trends were ingested?".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of runs to return. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_trend_pipeline',
      description: 'Surface a confirmation button to trigger a new trend ingestion pipeline run. Does NOT run immediately — the user must confirm. Use for "run pipeline", "ingest trends", "scan for new trends", or "refresh content ideas".',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ── Media generation ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'generate_video_script',
      description: 'Generate a short-form video script (hook, body, CTA, voiceover, on-screen text, hashtags) for a given topic. Use for "write a script for X", "create reel script about Y", or "help me script a video".',
      parameters: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'The topic or trend to write a script about.' },
          channel_tone: { type: 'string', description: 'Brand tone e.g. "fun and casual", "professional". Omit to use default.' },
          duration_seconds: { type: 'number', description: 'Target video duration in seconds. Default 30.' },
          content_type: { type: 'string', enum: ['reel', 'story', 'youtube_short'], description: 'Platform format. Default: reel.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Surface a button to generate an AI image for a creative bundle using DALL-E 3. Does NOT generate immediately — the user must confirm. Use when the user asks "generate image for X", "create a visual for Y", or "make an Instagram image".',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'image_prompt'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID to attach the image to.' },
          image_prompt: { type: 'string', description: 'Detailed image generation prompt.' },
          style: { type: 'string', description: 'Visual style e.g. "photorealistic", "illustrated", "minimalist".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_carousel',
      description: 'Surface a button to generate a multi-slide carousel for Instagram. Each slide gets an AI-generated image. Does NOT generate immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['bundle_id', 'slide_prompts'],
        properties: {
          bundle_id: { type: 'string', description: 'Creative bundle UUID.' },
          slide_prompts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of image prompts, one per carousel slide (2–10 slides).',
          },
          style: { type: 'string', description: 'Visual style to apply consistently across all slides.' },
        },
      },
    },
  },
  // ── CRM ─────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_crm_pipeline',
      description: 'Show the CRM sales pipeline: all stages and how many leads are in each stage. Use for "show my CRM pipeline", "how many leads do I have?", "sales funnel", or "pipeline overview".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crm_leads',
      description: 'List CRM leads with name, company, stage, score, and follow-up date. Use for "show my leads", "who has a follow-up due?", "leads in [stage]", or "which leads are overdue?".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max leads to return. Default 10.' },
          stage_name: { type: 'string', description: 'Filter by pipeline stage name (partial match). Omit for all stages.' },
          owner_email: { type: 'string', description: 'Filter by assigned owner email.' },
          overdue_followup: { type: 'boolean', description: 'If true, only return leads with overdue follow-up dates.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_lead_stage',
      description: 'Surface a button to move a CRM lead to a different pipeline stage. Does NOT move immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['lead_id', 'lead_name', 'stage_id', 'stage_name'],
        properties: {
          lead_id: { type: 'string', description: 'CRM lead UUID.' },
          lead_name: { type: 'string', description: 'Lead name for the confirmation button.' },
          stage_id: { type: 'string', description: 'Target pipeline stage UUID.' },
          stage_name: { type: 'string', description: 'Target stage name for the confirmation button.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_lead_note',
      description: 'Surface a button to add a note or activity log to a CRM lead. Does NOT add immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['lead_id', 'lead_name', 'note'],
        properties: {
          lead_id: { type: 'string', description: 'CRM lead UUID.' },
          lead_name: { type: 'string', description: 'Lead name for the confirmation button.' },
          note: { type: 'string', description: 'Note text to log.' },
        },
      },
    },
  },
  // ── Caption & content generation ────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'generate_caption',
      description: 'Generate an Instagram/social media caption with hashtags and a CTA for a given topic, using the brand\'s tone and guidelines. Use for "write a caption for X", "caption ideas for Y", or "generate hashtags for Z".',
      parameters: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'What the post is about.' },
          channel_name: { type: 'string', description: 'Brand/channel name for tone matching. Omit to use the primary channel.' },
          tone: { type: 'string', description: 'Override tone e.g. "funny", "inspirational". Omit to use channel default.' },
          platform: { type: 'string', enum: ['instagram', 'facebook', 'linkedin', 'twitter'], description: 'Target platform. Default: instagram.' },
          include_hashtags: { type: 'boolean', description: 'Include hashtag suggestions. Default true.' },
          include_cta: { type: 'boolean', description: 'Include a call to action. Default true.' },
        },
      },
    },
  },
  // ── CTWA (Click-to-WhatsApp) ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_ctwa_campaigns',
      description: 'List Click-to-WhatsApp (CTWA) campaigns with status and budget. Use for "show my WhatsApp campaigns", "CTWA campaigns", or "click-to-WhatsApp ads".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'paused', 'completed'], description: 'Filter by status. Omit for all.' },
          limit: { type: 'number', description: 'Max campaigns. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ctwa_performance',
      description: 'Get Click-to-WhatsApp campaign performance metrics: spend, impressions, clicks, WhatsApp conversations started, new contacts, and conversion rate. Use for "how is my WhatsApp campaign performing?", "CTWA results", or "how many conversations did my ad generate?".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-back window in days. Default 14.' },
          campaign_name: { type: 'string', description: 'Filter by campaign name (partial match). Omit for all campaigns.' },
        },
      },
    },
  },
  // ── Audience presets ─────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_audience_presets',
      description: 'List saved audience presets (targeting configurations) with age range, location, gender, and description. Use for "what audiences have I saved?", "audience presets", or "show my targeting presets".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max presets to return. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_audience_preset',
      description: 'Surface a button to save a new audience preset for reuse across campaigns. Does NOT create immediately — the user must confirm.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Preset name e.g. "Mumbai Women 25–35".' },
          description: { type: 'string', description: 'Optional description.' },
          age_min: { type: 'number', description: 'Minimum age.' },
          age_max: { type: 'number', description: 'Maximum age.' },
          genders: { type: 'array', items: { type: 'number' }, description: '[1] = men, [2] = women, [1,2] = all.' },
          locations: { type: 'string', description: 'Target locations e.g. "Mumbai, Delhi".' },
        },
      },
    },
  },
  // ── Platform health ──────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_platform_status',
      description: 'Check the overall health of all platform connections and services: Meta Ads account, Instagram accounts, AI services, active channels, last pipeline run, and any action items. Use for "is everything connected?", "platform status", "health check", "what needs attention?", or "are my integrations working?".',
      parameters: { type: 'object', properties: {} },
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
