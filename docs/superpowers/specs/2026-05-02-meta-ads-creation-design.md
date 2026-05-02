# Meta Ads Creation — Design Spec

**Date:** 2026-05-02
**Status:** Approved (pending user spec review)
**Owner:** GrowthOS team

---

## 1. Goal

Let GrowthOS users build Meta ads end-to-end inside our web UI and publish them to Meta via the Marketing API, without ever leaving GrowthOS. v1 supports three objectives: **Click-to-WhatsApp (CTWA)**, **Lead Gen**, and **Website Traffic**. Single-image and video creatives. Robust pre-flight validation, dry-run via `validate_only`, and cleanup-on-failure for the multi-step Meta create flow.

## 2. Non-goals (v1)

- Carousel ads, A/B testing, Advantage+ creative variants
- Custom-audience CSV upload, Lookalike audience UI (backend exists; UI later)
- Catalog/Sales objective UI (existing backend path keeps working without UI)
- Awareness, Engagement-without-WhatsApp, App Promotion objectives
- Editing existing campaigns beyond pause/resume/delete
- Real-time status updates via webhook (v1 polls)
- Bulk actions (pause/delete N campaigns at once)

## 3. Background — what already exists

**Backend (substantial):**
- [`MetaAdsApiService`](../../../backend/src/services/MetaAdsApiService.js) wraps every Marketing API primitive we need: `createCampaign`, `createAdSet`, `createAdCreative`, `createAd`, `uploadImage`, `uploadImageFile`, `uploadVideo`, audiences, catalogs, lead-gen forms, OAuth token exchange.
- [`AdsService.createCampaign`](../../../backend/src/services/AdsService.js) orchestrates the 4-step Meta create flow but is hard-coded to two paths only: **CTWA** (`OUTCOME_TRAFFIC` + `LINK_CLICKS` + WhatsApp CTA) and **Catalog Sales** (`OUTCOME_SALES` + `OFFSITE_CONVERSIONS` + product set). Cannot publish a Lead Gen or Website Traffic ad today.
- [`AdsController`](../../../backend/src/Controllers/AdsController.js) and [`AdRoutes.js`](../../../backend/src/Routes/AdRoutes.js) expose all endpoints under `/api/v1/ads/*`, auth-guarded, gated by `FEATURE_ADS_ENABLED=true`.
- [`schema.js`](../../../backend/src/db/schema.js) has `meta_ad_accounts` (encrypted token storage), `ctwa_campaigns` (mirror table — column set is generic enough for any objective despite the name), `audience_presets`, `meta_ad_leads`.
- DB is **PostgreSQL** via Drizzle ORM (`drizzle-orm/node-postgres`).

**Frontend (placeholder only):**
- [`AdsPage.tsx`](../../../frontend/src/pages/AdsPage.tsx) is a static visual mockup — fake "Run synthesis" prompt, hardcoded Output card. No API client exists. No state-management library. No OAuth callback route. No setup/connect UI.

## 4. Meta Marketing API rules we design against

Authoritative as of v24.0 (Oct 2025). Sources are `developers.facebook.com/docs/*`.

1. **4-level hierarchy**: Campaign → Ad Set → Ad Creative → Ad. Each is a separate POST. Cannot skip levels.
2. **Objective drives everything**: each `objective` enum has a different valid set of `optimization_goal` × `billing_event` × `destination_type` × `promoted_object`. Meta only documents these in scattered tables.
3. **Official escape hatch**: `execution_options=["validate_only"]` on any POST runs the full validation without persisting. Returns `{success: true}` or a Graph API error. We use this on every step before the real publish.
4. **Budgets** are integers in account-currency **minor units** (USD cents, INR paise; JPY/KRW have no minor unit so 1=¥1).
5. **`special_ad_categories` is required** on every campaign POST — send `["NONE"]` if not applicable. Non-NONE locks targeting (age 18-65, no genders, no zips, `targeting_automation.advantage_audience: 1` required).
6. **Image attach** prefers `image_hash` (from `POST /act_X/adimages`) over `picture` (URL). Only `image_hash` lets us reuse an upload across creatives.
7. **Lead Gen** form is `POST /{page_id}/leadgen_forms` with a page access token, then attached on the creative as `link_data.call_to_action.value.lead_gen_form_id`.
8. **Status**: create-as-PAUSED is convention, not law. `effective_status` is the source of truth for review state (`PENDING_REVIEW`, `WITH_ISSUES`, `DISAPPROVED`, `PENDING_BILLING_INFO`, etc.).
9. **Permissions** required: `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `instagram_basic`, `leads_retrieval`. All require Advanced Access via App Review.
10. **Tokens**: use long-lived (60d) user tokens; derive page tokens from `GET /me/accounts`. Code 190 = expired/invalid, force re-auth.
11. **Rate limits**: respect `X-Business-Use-Case-Usage` header for code 17 (user-level), `X-App-Usage` for code 4 (app-level). Back off until `estimated_time_to_regain_access` minutes.

---

## 5. Architecture

### 5.1 Backend — extend, don't restructure

All changes are extensions to existing files in [`backend/src/`](../../../backend/src/). New files only where the concern doesn't already have a home.

#### 5.1.1 Refactor `AdsService.createCampaign` to dispatch on `objective`

The current function (line 417 of `AdsService.js`) is locked to CTWA-or-Catalog. New shape:

```js
// services/AdsService.js
async createCampaign(organizationId, data) {
  const account = await this._requireConnectedAccount(organizationId);
  const resolver = resolveObjective(data.objective);   // throws on unsupported
  const validated = campaignCreateSchema.parse(data);  // zod, per-objective discriminated union
  await this._preflightCampaign(resolver, validated, account);

  const orchestrator = new CampaignCreateOrchestrator({
    metaApi: this._getMetaApi(account.access_token_encrypted),
    pageMetaApi: this._getPageMetaApi(account),
    account,
    logger: this.logger,
  });
  const metaIds = await orchestrator.run(resolver.buildSteps(validated, account));

  const campaign = await this.campaignRepo.create({
    organization_id: organizationId,
    ad_account_id: account.ad_account_id,
    objective: validated.objective,
    ...metaIds,
    ...this._campaignPersistFields(validated),
  });

  if (validated.publish === 'live') {
    await this._publishLive(orchestrator, metaIds);
  }

  return campaign;
}
```

Existing CTWA + Catalog behavior is preserved by **keeping** the current resolver as `OUTCOME_TRAFFIC_CTWA` (legacy) and `OUTCOME_SALES_CATALOG`. New resolvers added:

- `OUTCOME_TRAFFIC_WEBSITE` — Website Traffic
- `OUTCOME_LEADS_ON_AD` — Lead Gen with native instant form
- `OUTCOME_ENGAGEMENT_CTWA` — true CTWA when WABA is linked, optimization `CONVERSATIONS`

Backward-compat: if a request omits `objective` and includes WhatsApp-flavored fields (`opening_message`, `flow_id`), default to legacy CTWA. If `catalog_id` present, default to Catalog. This keeps any existing client code working.

#### 5.1.2 New `CampaignCreateOrchestrator` — `backend/src/lib/campaignOrchestrator.js`

Encapsulates the multi-step Meta create with cleanup-on-failure.

```js
class CampaignCreateOrchestrator {
  async run(steps, { dryRun = false } = {}) {
    const created = []; // [{kind: 'campaign'|'adset'|'creative'|'ad', id}]
    try {
      for (const step of steps) {
        const opts = dryRun ? { execution_options: ['validate_only'] } : {};
        const result = await step.execute(this.metaApi, this.account, opts);
        if (!dryRun) created.push({ kind: step.kind, id: result.id });
        step.bindResult(result, steps); // pass IDs to subsequent steps
      }
      return Object.fromEntries(created.map(c => [`meta_${c.kind}_id`, c.id]));
    } catch (err) {
      if (!dryRun && created.length) {
        await this._cleanup(created); // delete in reverse order, log outcome
      }
      throw enrichMetaError(err, { failedStep: this._currentStep });
    }
  }
}
```

#### 5.1.3 New objective resolvers — `backend/src/lib/objectiveResolvers.js`

Pure functions per objective. Each returns `{ buildSteps(data, account), preflightChecks }`.

```js
export const objectiveResolvers = {
  OUTCOME_TRAFFIC_WEBSITE: {
    requires: ['destination_url'],
    buildSteps(data, account) { /* campaign+adset+creative+ad with link_data */ },
    preflightChecks(data, account) { /* URL reachable check optional */ },
  },
  OUTCOME_LEADS_ON_AD: {
    requires: ['lead_gen_form_id'],
    buildSteps(data, account) { /* destination_type ON_AD, lead_gen_form_id on CTA */ },
    preflightChecks(data, account, deps) { /* form ownership check via deps.metaApi */ },
  },
  OUTCOME_ENGAGEMENT_CTWA: {
    requiresAccount: ['waba_id'],   // looked up on meta_ad_accounts, not in request body
    buildSteps(data, account) { /* destination_type WHATSAPP, optimization CONVERSATIONS */ },
    preflightChecks(data, account, deps) { /* WABA linkage check via /{page_id}?fields=whatsapp_business_account; auto-fetch and persist if missing */ },
  },
  OUTCOME_TRAFFIC_CTWA: { /* existing CTWA fallback when no WABA */ },
  OUTCOME_SALES_CATALOG: { /* existing catalog path */ },
};
```

#### 5.1.4 New dry-run endpoint

```
POST /api/v1/ads/campaigns/validate
Body: same as POST /campaigns

HTTP 200 (request was processable):
  { ok: true,  validated: ['campaign','adset','creative','ad'], warnings?: [...] }
  { ok: false, step, error: { code, user_message, field?, raw_meta_error } }

HTTP 4xx is reserved for malformed requests (zod parse failure → 422,
auth failure → 401, scope missing → 403). A "Meta says no" outcome is
considered a successful validate result and returns 200 with ok:false.
```

Calls `orchestrator.run(steps, { dryRun: true })`. Same zod validation, same pre-flight, same orchestrator path — just `validate_only` flag flipped.

#### 5.1.5 Lead Gen form CRUD

New routes:
```
POST /api/v1/ads/lead-forms       → create form on connected page
GET  /api/v1/ads/lead-forms       → already exists as /ads/leads/forms (alias both)
GET  /api/v1/ads/lead-forms/:id   → single form detail
```

Body for POST:
```json
{
  "name": "Spring quotes",
  "locale": "en_US",
  "questions": [
    {"type":"FULL_NAME"},
    {"type":"WORK_EMAIL"},
    {"type":"PHONE"},
    {"type":"CUSTOM","key":"service","label":"Service needed","options":[...]}
  ],
  "privacy_policy": {"url":"https://example.com/privacy","link_text":"Privacy"},
  "follow_up_action_url": "https://example.com/thanks",
  "thank_you_page": {"title":"Thanks","body":"...","button_type":"VIEW_WEBSITE","website_url":"..."},
  "context_card": {"title":"Get a quote","content":["Same-day"],"style":"PARAGRAPH_STYLE","button_text":"Continue"}
}
```

Backend POSTs to `https://graph.facebook.com/v24.0/{page_id}/leadgen_forms` using the **page access token** stored on `meta_ad_accounts.page_access_token_encrypted`. Requires scopes `pages_manage_ads` + `leads_retrieval` (we add `pages_manage_ads` to the OAuth scope list — see 5.1.10).

#### 5.1.6 New `preflightCampaign` — runs before any Meta call

In `AdsService` (private method) or extracted to `lib/campaignPreflight.js`. Sequence:

1. **Token fresh** — token_expiry > now. If not, throw 401 `TOKEN_EXPIRED`.
2. **Required scopes** — first call only: `GET /me/permissions`, cache in memory ~1h. If a required scope is missing, throw 403 `SCOPE_MISSING` listing the scope.
3. **Account usable** — `GET /act_{id}?fields=account_status,disable_reason,funding_source`. `account_status === 1` else `ACCOUNT_NOT_USABLE`. `funding_source` truthy else `FUNDING_REQUIRED`.
4. **Budget meets minimum** — `GET /act_{id}/minimum_budgets?optimization_goal=...&currency=...`. If `daily_budget < min`, throw `BUDGET_TOO_LOW` with the actual minimum.
5. **Currency conversion** — convert input (account currency, major units) to minor units. Zero-decimal currencies: JPY, KRW, VND, IDR — list maintained in `lib/currency.js`.
6. **Special Ad Category enforcement** — if non-NONE: strip `targeting.zips`, force `age_min: 18`, `age_max: 65`, drop `genders`, force `targeting_automation.advantage_audience: 1`. Surface a `warnings` array on the response.
7. **Objective-specific** (delegated to resolver):
   - **CTWA**: page has linked WABA (`/{page_id}?fields=whatsapp_business_account`). Auto-fetch and persist if missing — existing logic, keep.
   - **Lead Gen**: `lead_gen_form_id` exists, owned by connected page, `status === ACTIVE`.
   - **Website Traffic**: `destination_url` is a valid HTTP(S) URL. (Skip reachability — too flaky.)

Pre-flight failures throw a typed error with `{code, user_message, action}` so the controller can map to HTTP status.

#### 5.1.7 Strict input validation — `backend/src/schemas/campaignCreate.js`

Zod discriminated union on `objective`:

```js
const CommonFields = z.object({
  name: z.string().min(1).max(255),
  daily_budget: z.number().positive().optional(),
  lifetime_budget: z.number().positive().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  targeting_spec: TargetingSchema.optional(),
  special_ad_categories: z.array(SpecialAdCategoryEnum).default(['NONE']),
  publish: z.enum(['paused','live']).default('paused'),
}).refine(d => d.daily_budget || d.lifetime_budget, 'budget required');

export const campaignCreateSchema = z.discriminatedUnion('objective', [
  CommonFields.extend({ objective: z.literal('OUTCOME_TRAFFIC_WEBSITE'), creative_spec: WebsiteCreativeSchema, destination_url: z.string().url() }),
  CommonFields.extend({ objective: z.literal('OUTCOME_LEADS_ON_AD'),     creative_spec: LeadCreativeSchema, lead_gen_form_id: z.string() }),
  CommonFields.extend({ objective: z.literal('OUTCOME_ENGAGEMENT_CTWA'), creative_spec: CtwaCreativeSchema, opening_message: z.string().optional() }),
  CommonFields.extend({ objective: z.literal('OUTCOME_TRAFFIC_CTWA'),    creative_spec: CtwaCreativeSchema, opening_message: z.string().optional() }),
  CommonFields.extend({ objective: z.literal('OUTCOME_SALES_CATALOG'),   creative_spec: CatalogCreativeSchema, catalog_id: z.string(), product_set_id: z.string().optional() }),
]);
```

Replaces the `{ type: "object" }` body schemas in `AdRoutes.js` (we keep the Fastify schema for OpenAPI docs but tighten it).

#### 5.1.8 Centralized Meta-error mapping — `backend/src/lib/metaErrors.js`

```js
export function mapMetaError(metaError) {
  const code = metaError?.code ?? metaError?.error?.code;
  const sub  = metaError?.error_subcode ?? metaError?.error?.error_subcode;
  // Returns { http: number, key: string, user_message: string, action?: string }
}
```

Coverage:
- 1 / 2 → 503 `META_TRANSIENT` (retryable)
- 4 / 17 / 32 → 429 `RATE_LIMITED` (back off per `estimated_time_to_regain_access`)
- 100 → 422 `INVALID_PARAMETER` — surface `error_user_msg`
- 190 → 401 `TOKEN_EXPIRED` — force re-auth
- 200 / 270 / 294 → 403 `PERMISSION_DENIED`
- 368 → 422 `ACTION_BLOCKED`
- 1487006 → 422 `SAC_TARGETING_VIOLATION`
- 1487749 → 422 `SAC_MISMATCH`
- 2446886 → 422 `WABA_NOT_LINKED` — actionable instructions
- default → 502 `META_UNKNOWN`

Existing controller has ad-hoc handling for 2446886 — move it here.

#### 5.1.9 Rate-limit handling in `MetaAdsApiService._request`

Existing retry loop handles 5xx and codes 4/32. Add code 17. Read `X-Business-Use-Case-Usage` header on rate-limit errors, parse `estimated_time_to_regain_access` (minutes), wait that long before retry — capped at 60s in-process; longer waits surface as `RATE_LIMITED` to the caller.

#### 5.1.10 OAuth scope expansion

Existing `getOAuthUrl` builds the scope string. Add `pages_manage_ads` (required for `POST /{page}/leadgen_forms`). Update env doc and re-test the FB Login config in App Review.

#### 5.1.11 Image/video upload validation

Existing `POST /api/v1/ads/upload-image-file` (multipart). Add server-side checks:
- MIME ∈ {`image/jpeg`, `image/png`, `image/webp`}
- Size ≤ 30 MB
- Min dimensions 600×600 (Meta recommends 1080×1080+)

For video upload (existing `uploadVideo`, expose new route `POST /api/v1/ads/upload-video-file`):
- MIME ∈ {`video/mp4`, `video/quicktime`}
- Size ≤ 4 GB
- Duration ≤ 240 s (warn only at this stage; Meta enforces per placement)

#### 5.1.12 Idempotency

New table `campaign_create_idempotency`:
```
key (varchar 64 PK)        -- sha256(organization_id + body_canonical_json)
organization_id (varchar 36)
campaign_id (varchar 36)   -- FK to ctwa_campaigns
created_at (timestamp)
```
Window: 60 seconds. On duplicate POST within window, return the original `campaign_id` and 200 instead of creating a second campaign. Cleanup job purges rows >1h old (cron).

### 5.2 Frontend — functional, with TanStack Query

#### 5.2.1 New deps

```
react-router-dom (already present)
@tanstack/react-query    -- server state
react-hook-form          -- form state
@hookform/resolvers/zod  -- zod schema → form errors
zod                      -- schemas (mirror backend)
axios                    -- HTTP
```

Facebook JS SDK loaded via `<script>` injection in `index.html` (no npm package — Meta only ships the CDN bundle).

#### 5.2.2 API client — new `frontend/src/api/`

- `client.ts` — axios instance; baseURL from `import.meta.env.VITE_API_BASE_URL`; request interceptor injects `Authorization: Bearer <jwt>` from `sessionStorage`; response interceptor normalizes `{success: true, data}` → `data` and throws typed `ApiError` on `{success: false, error}`.
- `ads.ts` — typed function per endpoint. Names match backend method names where possible (`getSetupStatus`, `getOAuthUrl`, `connectAdAccount`, `listAdAccounts`, `getCampaigns`, `createCampaign`, `validateCampaign`, `uploadAdImage`, `searchInterests`, `searchLocations`, `getLeadForms`, `createLeadForm`, …).
- `types.ts` — TS types mirroring zod schemas (eventually shared via codegen; manual for v1).

#### 5.2.3 React Query setup

`QueryClientProvider` wraps `<App />` in `main.tsx`. Default options: `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`. Per-query overrides:

| Query | staleTime |
|---|---|
| `getSetupStatus` | 5 min |
| `getCampaigns` | 30 s |
| `getBalance` | 60 s |
| `listAdAccounts` | 5 min |
| `getLeadForms` | 2 min |
| `searchInterests` / `searchLocations` | infinite (debounced typeahead) |

#### 5.2.4 Setup flow at `/ads/setup`

State machine: `disconnected → connecting → choosing_account → choosing_page → confirming → connected`.

- `disconnected`: "Connect Meta" button. On click: `FB.login(callback, { scope: '...', config_id: <FB Login for Business config id>, response_type: 'code' })`. We use Facebook Login *for Business* (config-based) so we don't have to maintain the scope list in the frontend — it lives in the FB app config.
- After login: POST `code` to `/api/v1/ads/setup/callback` → backend exchanges for long-lived token, returns `{accounts, pages, businesses}`.
- `choosing_account`: list of ad accounts (id, name, currency, balance, status). User picks one. Surface disabled accounts as "Cannot use" with reason.
- `choosing_page`: list of Pages. Show WABA-linked indicator next to each.
- `confirming`: shows summary + Instagram detection, "Save" → POST `/ads/setup/connect`.
- `connected`: redirects to `/ads`.

Errors:
- User cancels FB.login → return to `disconnected` with no error toast (intentional cancel).
- Token exchange fails → toast with mapped error message, return to `disconnected`.
- User selects account they don't have ads_management on → POST returns 403, surface "Ask the account admin to grant you the Advertiser role".

#### 5.2.5 Ads list page — replaces [`AdsPage.tsx`](../../../frontend/src/pages/AdsPage.tsx)

Header bar:
- Connected account name + currency + live balance (cached 60 s, refresh icon)
- "Switch account" → opens account picker in modal
- "Disconnect" (in overflow menu)

Body:
- Empty state: "Create your first campaign" CTA → `/ads/create`
- Populated: card grid or table of campaigns. Per row:
  - Status badge (driven by `effective_status`, see 5.2.7)
  - Name, objective, daily/lifetime budget, lifetime spend, total leads (for Lead Gen)
  - Per-row actions: View (opens detail drawer) / Pause↔Resume / Delete (confirm modal)

#### 5.2.6 Create Campaign wizard at `/ads/create`

Multi-step form managed by `react-hook-form` (single form context across steps). Step state in URL query (`?step=2`) so refresh doesn't lose progress.

**Step 1 — Objective**
3 cards: Click-to-WhatsApp / Lead Gen / Website Traffic. Selection sets `objective` discriminator and the wizard branches.

**Step 2 — Audience**
- `geo_locations`: search-as-you-type (`POST /ads/search/locations`), debounce 250 ms, multi-select chips
- `age_min` / `age_max`: dual slider 13–65
- `genders`: All / Male / Female (forced All for Special Ad Categories)
- `interests`: search-as-you-type (`POST /ads/search/interests`), multi-select chips
- `targeting_automation.advantage_audience`: toggle (forced on for SAC; otherwise default on per Meta v18+ behavior)
- `special_ad_categories`: multi-select dropdown. Selecting a non-NONE value disables incompatible fields and shows a banner.

**Step 3 — Budget & schedule**
- Type: Daily / Lifetime radio
- Amount: number input, prefix is account currency symbol
- Start date / end date (end required for Lifetime)
- Bid strategy: Lowest Cost (default) / Cost Cap / Bid Cap / Min ROAS — last 3 reveal `bid_amount` field
- Inline reach estimate (calls `/reachestimate` 800 ms after last input)

**Step 4 — Creative**
- Type toggle: Image / Video
- Drag-drop upload, browser-side size+MIME check, on success backend returns `image_hash` (or `video_id`)
- Headline: text input, char counter at 40 (Meta limit)
- Primary text: textarea, char counter at 125
- Description: text input, char counter at 30
- CTA dropdown: filtered list per objective
  - CTWA: WHATSAPP_MESSAGE only
  - Lead Gen: SIGN_UP, LEARN_MORE, GET_QUOTE, APPLY_NOW, GET_OFFER, SUBSCRIBE
  - Website Traffic: LEARN_MORE, SHOP_NOW, SIGN_UP, BOOK_NOW, DOWNLOAD, GET_OFFER, GET_QUOTE, CONTACT_US
- Destination:
  - CTWA: WhatsApp number from connected business (read-only display)
  - Lead Gen: form picker (see Step 4.5)
  - Website Traffic: URL input

**Step 4.5 — Lead Gen form** (only when objective = Lead Gen)
- Tabs: "Pick existing" / "Create new"
- Pick existing: dropdown of forms from `GET /ads/lead-forms`, preview of questions
- Create new: inline builder
  - Name, locale
  - Questions: dynamic list with type dropdown (FULL_NAME, EMAIL, WORK_EMAIL, PHONE, CITY, STATE, COUNTRY, COMPANY_NAME, JOB_TITLE, CUSTOM with options)
  - Privacy policy URL + link text (required)
  - Thank-you page: title, body, button label, follow-up URL
  - Context card: title, content bullets
  - On Save: POST `/api/v1/ads/lead-forms`, then auto-select the new form

**Step 5 — Review & publish**
- Read-only summary of all decisions
- "Validate" button: calls `POST /ads/campaigns/validate`. Shows `✓ Campaign / ✓ Ad set / ✓ Creative / ✓ Ad` checklist on success, or red ✗ with `user_message` and "Edit step N" link on failure.
- "Publish" split-button:
  - "Save as Paused" (default) → POST `/ads/campaigns` with `publish: 'paused'`
  - "Publish Live" → POST with `publish: 'live'`. Shown only after a successful Validate.

#### 5.2.7 Status badge component

Reads `effective_status` (not `status`). Mapping:

| effective_status | Color | Label | Tooltip |
|---|---|---|---|
| ACTIVE | green | Active | — |
| PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED | grey | Paused | Which level is paused |
| PENDING_REVIEW | yellow | In review | "Meta is reviewing this ad. Usually <24h." |
| WITH_ISSUES | orange | Issues | Lists `issues_info[].error_summary` |
| DISAPPROVED | red | Disapproved | Lists `issues_info` reasons |
| PENDING_BILLING_INFO | red | Billing required | Link to billing setup |
| ARCHIVED | grey | Archived | — |
| DELETED | red | Deleted | — |
| IN_PROCESS | yellow | Processing | — |

#### 5.2.8 OAuth callback route

New route at `/oauth/meta-ads/callback`. Reads `code`+`state` from `window.location.search` (or `window.opener.postMessage` if popup), POSTs to `/api/v1/ads/setup/callback`, redirects to `/ads/setup` with state advanced.

### 5.3 Data flow (publish path)

```
Wizard submit
  ↓
Frontend: POST /ads/campaigns/validate (publish='paused')
  ↓
Backend: zod parse → preflightCampaign → orchestrator.run({dryRun:true})
  ↓ (returns {ok:true} or 422 with step+user_message)
Frontend: render checklist; user clicks "Publish Live" or "Save as Paused"
  ↓
Frontend: POST /ads/campaigns
  ↓
Backend: idempotency dedupe → zod parse → preflightCampaign
       → orchestrator.run({dryRun:false})
            step 1: createCampaign → meta_campaign_id
            step 2: createAdSet (uses meta_campaign_id) → meta_adset_id
            step 3: createAdCreative → meta_creative_id
            step 4: createAd (uses meta_adset_id, meta_creative_id) → meta_ad_id
       → on any failure: cleanup orphans in reverse order, throw mapped error
       → persist row in ctwa_campaigns
       → if publish='live': flip campaign + adset + ad to ACTIVE (3 calls, also rollback on partial failure)
       → return { campaign, warnings }
  ↓
Frontend: redirect to /ads with success toast
```

---

## 6. Edge cases — exhaustive

| Edge case | Layer | Handling |
|---|---|---|
| Token expired (190) | Backend | Mark `meta_ad_accounts.status='expired'`, return 401 with reconnect URL. Frontend forces re-auth. |
| Required scope missing (200/294) | Backend | Pre-flight catches via `/me/permissions`. Return 403 listing scope. Frontend surfaces "Reconnect with permission X". |
| Page has no WABA for CTWA (2446886) | Backend | Pre-flight checks `/{page_id}?fields=whatsapp_business_account`. Return 422 `WABA_NOT_LINKED` with link to Meta Business Suite WABA setup. |
| Ad account disabled (`account_status != 1`) | Backend | Pre-flight returns 422 `ACCOUNT_NOT_USABLE` with `disable_reason` from Meta. |
| No funding source on account | Backend | Pre-flight returns 422 `FUNDING_REQUIRED` with deep-link to Meta Business Manager funding setup. |
| Special Ad Category + zip targeting / age <18 / gender filter | Backend | Pre-flight strips fields, forces `advantage_audience: 1`, returns 200 with `warnings` array. Frontend renders warnings as info banner. |
| Budget below `/minimum_budgets` | Backend | Pre-flight rejects with the specific minimum and currency. |
| Currency mismatch (UI shows USD, account is INR) | Frontend | Account currency drives all UI labels. Wizard reads currency from `getSetupStatus`, formats inputs accordingly. |
| `start_time` in past for ACTIVE flip | Backend | Coerce to `now+5m`. Existing behavior in `createCampaign` line 502. Keep. |
| Image too large or wrong MIME | Frontend + Backend | Browser checks size+MIME before upload. Backend re-validates and returns 422. |
| Image wrong aspect ratio | Frontend | Warning toast on upload. Don't block (Meta auto-crops to placement). |
| Video too large (>4GB) or wrong codec | Frontend + Backend | Same as image. |
| Lead form not owned by connected page | Backend | Pre-flight `GET /{form_id}?fields=page` rejects with 422 `FORM_NOT_OWNED`. |
| Lead form in archived state | Backend | Pre-flight rejects with 422 `FORM_NOT_ACTIVE`. |
| Mid-flow Meta failure (e.g. ad fails after creative succeeds) | Backend | Orchestrator deletes orphans in reverse order. Cleanup outcome logged. User sees the original step error, not a cleanup error. |
| Partial cleanup failure (orphan can't be deleted) | Backend | Log at `error` level with all IDs. Return original step error to user. Add to a `meta_orphan_cleanup_queue` table for manual intervention (v1.1 — for v1, just log). |
| User double-clicks Publish | Backend | Idempotency table dedupes by hash within 60 s. Returns the original campaign. |
| Validate-only passes but real publish fails | Backend | Same orchestrator path; cleanup runs. Validate is best-effort, not a guarantee. UI explains this in the Validate help text. |
| Account disconnected mid-create | Backend | Pre-flight catches at next call (token gone, 190). Frontend re-auths. |
| Pixel missing for OUTCOME_SALES (future) | Backend | Pre-flight returns 422 `PIXEL_REQUIRED`. Out of v1 scope, but resolver stub asserts. |
| `effective_status: WITH_ISSUES` after publish | Frontend | Status badge shows orange with tooltip listing `issues_info`. Don't auto-resolve. |
| `effective_status: DISAPPROVED` after publish | Frontend | Red badge with reasons. v1 doesn't expose appeal flow. |
| Long-lived token expiring soon (<7d) | Backend | Background job (cron `ads:refresh-tokens` daily): for each `meta_ad_accounts` with `token_expiry < now + 7d`, attempt `fb_exchange_token`. On failure, mark `status='expired'`. v1.1 — stretch goal for v1. |
| Rate limited (4/17/32) | Backend | `_request` retries with backoff per `estimated_time_to_regain_access`. If wait >60 s, return 429 to caller with `retry_after`. |
| Meta v24.0 deprecated → v25.0 | Backend | API version is in env (`META_API_VERSION=v21.0` currently — bump to `v24.0`). Update annually per Meta's 2-year deprecation. |
| User has multiple Pages, picks wrong one | Frontend | Account picker requires explicit Page selection per ad account. Stored as `meta_ad_accounts.page_id`. Switch flow lets them re-select. |
| Reach estimate fails (Meta returns 0 or error) | Frontend | Show "—" not an error. Don't block submit. |
| Search interest/location returns 0 results | Frontend | Show "No results" in dropdown, don't block. |
| Request body too large (huge image hash list?) | Backend | Fastify body limit 10 MB (default). Image upload uses multipart, separate route. |
| User in EU — DSA disclosure fields | Backend | Out of v1 scope. Add to v1.1 (`dsa_beneficiary`, `dsa_payor` on ad set). Document as known gap. |

---

## 7. Security

- **Tokens**: continue using `TOKEN_ENCRYPTION_KEY` AES-256-GCM at rest. Never log raw tokens. Existing pattern in `meta_ad_accounts.access_token_encrypted`. Add: never include token in error responses or telemetry.
- **OAuth state**: HMAC-sign state with `APPROVAL_LINK_SECRET` (or a dedicated key); 10-minute TTL. Existing approach per `MS2 — Meta OAuth` comment in `modules/meta/routes.js`.
- **Scope minimization**: only request the scopes we use. v1 list documented in 5.1.10.
- **CSRF**: all `/api/v1/ads/*` routes are JWT-authenticated (existing `fastify.authenticate` hook). No additional CSRF token needed (no cookie auth).
- **Input validation**: zod everywhere user input enters the backend. No raw `request.body` access.
- **Rate limiting** at our edge: existing `@fastify/rate-limit`. Add stricter limits on `/campaigns` (max 10/min/user) and `/upload-image-file` (max 30/min/user).
- **Authorization**: every ads endpoint reads `request.user.organization_id`; repos filter by it. Re-verified per route — no cross-tenant data exposure.
- **Image/video URLs**: when accepting user-submitted image URLs (`upload-image` non-multipart route), validate it's HTTPS, parse the URL, reject local IPs / private CIDR ranges to prevent SSRF.

---

## 8. Observability

- Existing pino logger usage continues. Add structured fields:
  - Every Meta API call: `{module:'ads', endpoint, method, organization_id, ad_account_id, duration_ms, status}`
  - Every cleanup run: `{module:'ads', action:'cleanup', failed_step, cleanup_results:[{kind,id,outcome}]}`
  - Every pre-flight rejection: `{module:'ads', action:'preflight_reject', reason, organization_id}`
- Metric counters (no infra yet — log-based for v1):
  - `ads.campaign.created` `{objective, publish}`
  - `ads.campaign.validate_failed` `{step, error_key}`
  - `ads.campaign.create_failed` `{step, error_key}`
  - `ads.cleanup.run` `{success}`
  - `ads.rate_limit.hit` `{code}`

---

## 9. Migration / rollout

- **Schema**: no new tables required for v1 except `campaign_create_idempotency`. Add via `npm run db:push` (dev) or `db:generate` + `db:migrate` (prod).
- **Env vars to add**:
  - `META_API_VERSION` bump from `v21.0` → `v24.0` (current per research)
  - No new secrets
- **Feature flag**: existing `FEATURE_ADS_ENABLED=true` gates the backend ad routes (skip-mounted in `AdRoutes.js` when false). The frontend has no separate flag — when ads are disabled server-side, every wizard call returns 404 and the UI surfaces a "Ads feature not enabled" empty state on the `/ads` page. No client-side flag plumbing.
- **Backward compatibility**: existing CTWA and Catalog campaign creation continues working via legacy resolvers. No data migration needed.
- **OAuth re-auth**: new `pages_manage_ads` scope means existing connected accounts must re-auth to use Lead Gen form creation. UI detects via `/me/permissions` and prompts re-auth on first Lead Gen attempt.

---

## 10. File map

### New files
- `backend/src/lib/campaignOrchestrator.js`
- `backend/src/lib/objectiveResolvers.js`
- `backend/src/lib/campaignPreflight.js`
- `backend/src/lib/metaErrors.js`
- `backend/src/lib/currency.js`
- `backend/src/schemas/campaignCreate.js`
- `backend/src/schemas/leadFormCreate.js`
- `backend/src/services/LeadFormService.js` (thin — wraps form CRUD against page token)
- `backend/src/Repositories/CampaignIdempotencyRepository.js`
- `frontend/src/api/client.ts`
- `frontend/src/api/ads.ts`
- `frontend/src/api/types.ts`
- `frontend/src/api/queryClient.ts`
- `frontend/src/pages/AdsSetup.tsx`
- `frontend/src/pages/AdsCreate.tsx`
- `frontend/src/pages/OAuthCallback.tsx`
- `frontend/src/components/ads/StatusBadge.tsx`
- `frontend/src/components/ads/wizard/ObjectiveStep.tsx`
- `frontend/src/components/ads/wizard/AudienceStep.tsx`
- `frontend/src/components/ads/wizard/BudgetStep.tsx`
- `frontend/src/components/ads/wizard/CreativeStep.tsx`
- `frontend/src/components/ads/wizard/LeadFormStep.tsx`
- `frontend/src/components/ads/wizard/ReviewStep.tsx`
- `frontend/src/components/ads/SetupAccountPicker.tsx`
- `frontend/src/hooks/useFacebookSdk.ts`

### Modified files
- `backend/src/services/AdsService.js` — refactor `createCampaign` to dispatch on objective
- `backend/src/services/MetaAdsApiService.js` — add code-17 rate limit handling, `executeWithValidateOnly` helper
- `backend/src/Controllers/AdsController.js` — new `validateCampaign`, `createLeadForm` actions; remove inline error mapping in favor of `mapMetaError`
- `backend/src/Routes/AdRoutes.js` — new routes for `/campaigns/validate`, `/lead-forms`, `/upload-video-file`
- `backend/src/db/schema.js` — add `campaign_create_idempotency` table
- `backend/src/plugins/di.js` — wire `LeadFormService`, `CampaignIdempotencyRepository`
- `backend/.env` — bump `META_API_VERSION` to `v24.0`
- `frontend/package.json` — add deps
- `frontend/src/main.tsx` — wrap app in `QueryClientProvider`
- `frontend/src/App.tsx` — add routes `/ads/setup`, `/ads/create`, `/oauth/meta-ads/callback`
- `frontend/src/pages/AdsPage.tsx` — rewrite as campaign list view
- `frontend/index.html` — load Facebook JS SDK script

---

## 11. Open questions / known gaps

- **App Review status**: Meta requires Advanced Access via App Review for `ads_management`, `pages_manage_ads`, `leads_retrieval`. The dev token in `.env` works for the app's developer/admin accounts; production users will need our app to be reviewed-and-approved. v1 ships assuming this is in place; if not, any non-developer user will fail at OAuth with code 200.
- **EU DSA disclosure** (`dsa_beneficiary`, `dsa_payor` on ad set) is required for ads served in the EU. Not in v1 scope; deferred to v1.1.
- **Token-refresh background job**: detailed in 6 (Edge cases) as "v1.1 stretch". For v1, a token expiring without refresh just means the user re-auths on next attempt — degraded UX but not data loss.
- **Manual cleanup queue for orphan failures**: v1 logs only. Operationally, if cleanup fails, an engineer runs a one-off script. Acceptable for MVP traffic levels.

---

## 12. References

All on `developers.facebook.com`:
- Campaign reference: `/docs/marketing-api/reference/ad-campaign-group/`
- Ad set reference: `/docs/marketing-api/reference/ad-campaign/`
- Ad reference: `/docs/marketing-api/reference/adgroup/`
- Ad creative reference: `/docs/marketing-api/reference/ad-creative/`
- Link data: `/docs/marketing-api/reference/ad-creative-link-data/`
- CTA value: `/docs/marketing-api/reference/ad-creative-link-data-call-to-action-value/`
- Ad image: `/docs/marketing-api/reference/ad-image/`
- Destination type matrix: `/docs/marketing-api/adset/destination_type/`
- Targeting: `/docs/marketing-api/audiences/reference/basic-targeting/`, `/placement-targeting/`, `/flexible-targeting/`, `/targeting-expansion/advantage-audience/`
- Lead ads: `/docs/marketing-api/guides/lead-ads/create`, `/retrieving`
- Click-to-WhatsApp: `/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/`
- Validation (`validate_only`): `/docs/marketing-api/validation/`
- Status best practices: `/docs/marketing-api/best-practices/manage-your-ad-object-status/`
- Permissions: `/docs/permissions/reference/ads_management`, `/docs/marketing-api/access`
- Rate limiting: `/docs/graph-api/overview/rate-limiting/`
- Versioning: `/docs/graph-api/guides/versioning`
