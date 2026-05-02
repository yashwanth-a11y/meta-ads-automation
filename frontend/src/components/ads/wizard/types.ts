import type {
  CampaignObjective,
  CreateCampaignInput,
  SpecialAdCategory,
} from '../../../api/types'

export type WizardObjective = 'WEBSITE_TRAFFIC' | 'LEAD_GEN' | 'CTWA'

export const OBJECTIVE_TO_BACKEND: Record<WizardObjective, CampaignObjective> = {
  WEBSITE_TRAFFIC: 'OUTCOME_TRAFFIC_WEBSITE',
  LEAD_GEN: 'OUTCOME_LEADS_ON_AD',
  CTWA: 'OUTCOME_TRAFFIC_CTWA',
}

export type WizardForm = {
  // Step 1
  objective: WizardObjective | null

  // Step 2 — Audience
  audience: {
    locations: { key: string; name: string; type?: string }[]
    age_min: number
    age_max: number
    genders: 'all' | 'male' | 'female'
    interests: { id: string; name: string }[]
    advantage_audience: boolean
    special_ad_categories: SpecialAdCategory[]
    // ISO locale ids from Meta (e.g. 6 = English (US), 24 = Hindi).
    // Empty array = no language filter (recommended unless your copy is
    // in a single language).
    locales: number[]
    // Placements — Auto means Meta picks; manual means we pass exact arrays.
    placement_mode: 'auto' | 'manual'
    publisher_platforms: ('facebook' | 'instagram' | 'audience_network' | 'messenger')[]
    facebook_positions: string[]
    instagram_positions: string[]
    messenger_positions: string[]
    audience_network_positions: string[]
    device_platforms: ('mobile' | 'desktop')[]   // empty = both
  }

  // Step 3 — Budget & schedule
  budget: {
    type: 'daily' | 'lifetime'
    amount: number          // in major units (e.g., $5 not 500 cents)
    start_date?: string     // ISO 8601
    end_date?: string       // ISO 8601 (required for lifetime)
    bid_strategy:
      | 'LOWEST_COST_WITHOUT_CAP'        // default, no bid input needed
      | 'LOWEST_COST_WITH_BID_CAP'       // requires bid_amount
      | 'COST_CAP'                       // requires bid_amount
      | 'LOWEST_COST_WITH_MIN_ROAS'      // requires roas_average_floor
    bid_amount?: number                  // in major units; converted to minor
    roas_average_floor?: number          // 0..10; e.g. 1.5 = 150% ROAS minimum
  }

  // Step 4 — Creative
  creative: {
    media_type: 'image' | 'video'
    image_hash?: string
    image_preview_url?: string
    video_id?: string
    video_thumbnail_url?: string
    headline: string
    primary_text: string
    description: string
    cta_type: string
    destination_url?: string         // Website Traffic only
    whatsapp_number?: string         // CTWA only (we default to org number)
  }

  // Step 5 — Lead form (only when objective = LEAD_GEN)
  lead_form: {
    mode: 'pick' | 'create'
    selected_form_id?: string
    new_form?: {
      name: string
      locale: string
      questions: { type: string; key?: string; label?: string }[]
      privacy_policy_url: string
      privacy_policy_link_text: string
      thank_you_title: string
      thank_you_body: string
      thank_you_button_type: 'VIEW_WEBSITE' | 'CALL_BUSINESS' | 'NONE'
      thank_you_website_url: string
      follow_up_action_url: string
    }
  }

  // Step 6 — Publish
  publish_mode: 'paused' | 'live'
}

export const DEFAULT_FORM: WizardForm = {
  objective: null,
  audience: {
    locations: [{ key: 'IN', name: 'India', type: 'country' }],
    age_min: 18,
    age_max: 65,
    genders: 'all',
    interests: [],
    advantage_audience: true,
    special_ad_categories: ['NONE'],
    locales: [],
    placement_mode: 'auto',
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: [],
    instagram_positions: [],
    messenger_positions: [],
    audience_network_positions: [],
    device_platforms: [],
  },
  budget: {
    type: 'daily',
    amount: 5,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  },
  creative: {
    media_type: 'image',
    headline: '',
    primary_text: '',
    description: '',
    cta_type: 'LEARN_MORE',
  },
  lead_form: {
    mode: 'pick',
    new_form: {
      name: '',
      locale: 'en_US',
      questions: [{ type: 'FULL_NAME' }, { type: 'WORK_EMAIL' }, { type: 'PHONE' }],
      privacy_policy_url: '',
      privacy_policy_link_text: 'Privacy Policy',
      thank_you_title: 'Thanks!',
      thank_you_body: 'We will be in touch shortly.',
      thank_you_button_type: 'VIEW_WEBSITE',
      thank_you_website_url: '',
      follow_up_action_url: '',
    },
  },
  publish_mode: 'paused',
}

// CTAs commonly valid per objective. We narrow on the FE — Meta will reject
// invalid combos, but pre-filtering avoids round-trips.
export const CTA_BY_OBJECTIVE: Record<WizardObjective, string[]> = {
  WEBSITE_TRAFFIC: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_NOW', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'CONTACT_US'],
  LEAD_GEN: ['SIGN_UP', 'LEARN_MORE', 'GET_QUOTE', 'APPLY_NOW', 'GET_OFFER', 'SUBSCRIBE'],
  CTWA: ['WHATSAPP_MESSAGE'],
}

// Maps the wizard form to the backend's CreateCampaignInput.
export function toCreateCampaignInput(f: WizardForm): CreateCampaignInput {
  if (!f.objective) throw new Error('Objective is required')

  const a = f.audience
  const targeting_spec: Record<string, unknown> = {
    geo_locations: buildGeoLocations(a.locations),
    age_min: a.age_min,
    age_max: a.age_max,
    ...(a.genders !== 'all' && { genders: [a.genders === 'male' ? 1 : 2] }),
    ...(a.interests.length > 0 && {
      interests: a.interests.map((i) => ({ id: i.id, name: i.name })),
    }),
    ...(a.locales && a.locales.length > 0 && { locales: a.locales }),
    ...(a.device_platforms && a.device_platforms.length > 0 && {
      device_platforms: a.device_platforms,
    }),
    targeting_automation: {
      advantage_audience: a.advantage_audience ? (1 as const) : (0 as const),
    },
  }

  // Placements: only emit when manual mode AND at least one platform is on.
  // In auto mode we omit the fields entirely so Meta uses Advantage Placements.
  if (a.placement_mode === 'manual' && a.publisher_platforms.length > 0) {
    targeting_spec.publisher_platforms = a.publisher_platforms
    if (a.publisher_platforms.includes('facebook') && a.facebook_positions.length > 0) {
      targeting_spec.facebook_positions = a.facebook_positions
    }
    if (a.publisher_platforms.includes('instagram') && a.instagram_positions.length > 0) {
      targeting_spec.instagram_positions = a.instagram_positions
    }
    if (a.publisher_platforms.includes('messenger') && a.messenger_positions.length > 0) {
      targeting_spec.messenger_positions = a.messenger_positions
    }
    if (a.publisher_platforms.includes('audience_network') && a.audience_network_positions.length > 0) {
      targeting_spec.audience_network_positions = a.audience_network_positions
    }
  }

  const creative_spec: CreateCampaignInput['creative_spec'] = {
    primary_text: f.creative.primary_text,
    headline: f.creative.headline,
    description: f.creative.description,
    cta_type: f.creative.cta_type,
    ...(f.creative.image_hash && { image_hash: f.creative.image_hash }),
    ...(f.creative.video_id && { video_id: f.creative.video_id }),
    ...(f.creative.destination_url && { destination_url: f.creative.destination_url }),
    ...(f.creative.whatsapp_number && { whatsapp_number: f.creative.whatsapp_number }),
    ...(f.objective === 'LEAD_GEN' && f.lead_form.selected_form_id && {
      lead_gen_form_id: f.lead_form.selected_form_id,
    }),
  }

  return {
    name: defaultCampaignName(f),
    objective: OBJECTIVE_TO_BACKEND[f.objective],
    daily_budget: f.budget.type === 'daily' ? f.budget.amount : undefined,
    lifetime_budget: f.budget.type === 'lifetime' ? f.budget.amount : undefined,
    start_date: f.budget.start_date,
    end_date: f.budget.end_date,
    bid_strategy: f.budget.bid_strategy,
    bid_amount: f.budget.bid_amount,
    roas_average_floor: f.budget.roas_average_floor,
    targeting_spec: targeting_spec as CreateCampaignInput['targeting_spec'],
    creative_spec,
    special_ad_categories: f.audience.special_ad_categories,
    lead_gen_form_id: f.objective === 'LEAD_GEN' ? f.lead_form.selected_form_id : undefined,
    publish: f.publish_mode === 'live',
  }
}

function buildGeoLocations(locations: WizardForm['audience']['locations']) {
  const countries: string[] = []
  const regions: { key: string }[] = []
  const cities: { key: string; radius: number; distance_unit: 'kilometer' }[] = []
  for (const l of locations) {
    if (l.type === 'country') countries.push(l.key)
    else if (l.type === 'region') regions.push({ key: l.key })
    else if (l.type === 'city') cities.push({ key: l.key, radius: 25, distance_unit: 'kilometer' })
    else countries.push(l.key)
  }
  const out: Record<string, unknown> = {}
  if (countries.length) out.countries = countries
  if (regions.length) out.regions = regions
  if (cities.length) out.cities = cities
  return out
}

// Maps the backend AI response onto our WizardForm. We can't auto-fill
// `interests` (no Meta IDs) or media (AI doesn't generate it) — those stay
// blank for the user to handle on Review.
import type { AiGeneratedCampaign } from '../../../api/types'

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan', BR: 'Brazil',
  AE: 'United Arab Emirates', SG: 'Singapore', PH: 'Philippines',
  ID: 'Indonesia', MX: 'Mexico', ZA: 'South Africa', NG: 'Nigeria',
}

export function aiResultToWizardForm(ai: AiGeneratedCampaign, base: WizardForm = DEFAULT_FORM): WizardForm {
  const objective: WizardObjective = ai.objective
  return {
    ...base,
    objective,
    audience: {
      ...base.audience,
      locations: ai.audience.country_codes.map((code) => ({
        key: code,
        name: COUNTRY_NAMES[code] || code,
        type: 'country',
      })),
      age_min: ai.audience.age_min,
      age_max: ai.audience.age_max,
      genders: ai.audience.genders,
      // Interests need Meta IDs to be useful in the targeting spec — drop
      // for now. The keyword suggestions are surfaced as text in the UI for
      // the user to look up manually if they care.
      interests: [],
      advantage_audience: ai.audience.advantage_audience,
      special_ad_categories: (ai.audience.special_ad_categories as WizardForm['audience']['special_ad_categories']),
      // Placement / device / locale fields aren't AI-suggested — preserve
      // the user's prior choices (or DEFAULT_FORM if first run).
      locales: base.audience.locales,
      placement_mode: base.audience.placement_mode,
      publisher_platforms: base.audience.publisher_platforms,
      facebook_positions: base.audience.facebook_positions,
      instagram_positions: base.audience.instagram_positions,
      messenger_positions: base.audience.messenger_positions,
      audience_network_positions: base.audience.audience_network_positions,
      device_platforms: base.audience.device_platforms,
    },
    budget: {
      ...base.budget,                            // keep bid_strategy default
      type: ai.budget.type,
      amount: ai.budget.amount,
      start_date: ai.budget.start_date || undefined,
      end_date: ai.budget.end_date || undefined,
    },
    creative: {
      ...base.creative,
      headline: ai.creative.headline,
      primary_text: ai.creative.primary_text,
      description: ai.creative.description,
      cta_type: ai.creative.cta_type,
      destination_url: ai.creative.destination_url || undefined,
      // image_hash / video_id stay empty — user uploads on Review.
      image_hash: undefined,
      video_id: undefined,
      image_preview_url: undefined,
      video_thumbnail_url: undefined,
    },
    lead_form:
      objective === 'LEAD_GEN' && ai.lead_form_suggestion
        ? {
            mode: 'create',
            new_form: {
              ...(base.lead_form.new_form as NonNullable<WizardForm['lead_form']['new_form']>),
              name: ai.lead_form_suggestion.name,
              questions: ai.lead_form_suggestion.questions,
            },
          }
        : base.lead_form,
  }
}

function defaultCampaignName(f: WizardForm): string {
  const objLabel = {
    WEBSITE_TRAFFIC: 'Traffic',
    LEAD_GEN: 'Leads',
    CTWA: 'WhatsApp',
  }[f.objective || 'WEBSITE_TRAFFIC']
  const headline = f.creative.headline.trim().slice(0, 40) || 'Untitled'
  return `${objLabel} — ${headline} — ${new Date().toISOString().slice(0, 10)}`
}
