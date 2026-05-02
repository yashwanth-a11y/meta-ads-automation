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
  }

  // Step 3 — Budget & schedule
  budget: {
    type: 'daily' | 'lifetime'
    amount: number          // in major units (e.g., $5 not 500 cents)
    start_date?: string     // ISO 8601
    end_date?: string       // ISO 8601 (required for lifetime)
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
  },
  budget: {
    type: 'daily',
    amount: 5,
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

  const targeting_spec = {
    geo_locations: buildGeoLocations(f.audience.locations),
    age_min: f.audience.age_min,
    age_max: f.audience.age_max,
    ...(f.audience.genders !== 'all' && {
      genders: [f.audience.genders === 'male' ? 1 : 2],
    }),
    ...(f.audience.interests.length > 0 && {
      interests: f.audience.interests.map((i) => ({ id: i.id, name: i.name })),
    }),
    targeting_automation: {
      advantage_audience: f.audience.advantage_audience ? (1 as const) : (0 as const),
    },
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
    targeting_spec,
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

function defaultCampaignName(f: WizardForm): string {
  const objLabel = {
    WEBSITE_TRAFFIC: 'Traffic',
    LEAD_GEN: 'Leads',
    CTWA: 'WhatsApp',
  }[f.objective || 'WEBSITE_TRAFFIC']
  const headline = f.creative.headline.trim().slice(0, 40) || 'Untitled'
  return `${objLabel} — ${headline} — ${new Date().toISOString().slice(0, 10)}`
}
