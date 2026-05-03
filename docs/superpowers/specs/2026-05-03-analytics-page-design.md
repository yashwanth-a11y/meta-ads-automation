# Analytics page — live Meta-fetched dashboard

**Date:** 2026-05-03
**Status:** Implemented

## Goal

Replace the existing CTWA-only analytics dashboard with a live, org-wide
analytics page driven by the Meta Marketing API. Cover all ad types
(traffic, leads, conversions, engagement, CTWA), surface KPIs, daily trend,
top campaigns/ads, and platform/placement/demographic breakdowns. Keep the
existing CTWA conversation-source breakdown alongside Meta data when present.

## Non-goals

- DB cache layer for insights (per user instruction). Each page load hits Meta
  directly.
- Background scheduler / hourly sync.
- Custom calendar date range (only Meta's `date_preset` values are exposed).
- Conversational query, anomaly detection, leads funnel, daily/weekly summary
  endpoints — kept as `notImplemented` stubs.
- ROAS / revenue (no conversion-value pipeline yet).

## Architecture

### Backend

- **New service:** `backend/src/services/AnalyticsService.js`
  - `getDashboard(organizationId, { date_preset, days })` — fans out **6
    parallel calls** via `Promise.allSettled`:
    1. Daily account-level insights (time series)
    2. Campaign-level insights (top campaigns + table)
    3. `breakdowns=publisher_platform` (FB vs IG split)
    4. `breakdowns=publisher_platform,platform_position` (placement)
    5. `breakdowns=age,gender` (demographic)
    6. `ctwaConversationRepository.countByReferralSource` (DB)
  - `getCampaigns(organizationId, ...)` — per-campaign rows for the table
    view. Sorted by spend desc.
  - `getTopAds(organizationId, { limit })` — top N ads by spend, joined with
    creative thumbnail via a defensive `getAds()` call that's allowed to fail.
  - All three resolve the active Meta ad account via
    `MetaAdAccountRepository.findActiveByOrganizationId` and decrypt its
    token via `decryptToken()`.

- **New Meta API method:** `MetaAdsApiService.getAccountInsights(adAccountId, params)`
  - Generic `/act_{id}/insights` wrapper with full pagination (up to 20 pages).
  - Pass-through for `level`, `breakdowns`, `time_increment`, `filtering`,
    `sort`, `time_range`/`date_preset`, `fields`, `limit`.

- **Routes** (`backend/src/modules/analytics/routes.js`):
  - `GET /api/v1/analytics/dashboard?date_preset=last_28d` (or `?days=N`)
  - `GET /api/v1/analytics/campaigns?date_preset=...`
  - `GET /api/v1/analytics/ads/top?date_preset=...&limit=10`
  - All authenticated; org id resolved from JWT.

- **DI:** `AnalyticsService` registered in `backend/src/plugins/di.js`
  and decorated as `app.analyticsService`.

### Frontend

- **`frontend/src/api/analytics.ts`** — strongly-typed client with
  `analyticsApi.getDashboard / getCampaigns / getTopAds`. Exports the
  `ANALYTICS_DATE_PRESETS` constant (single source of truth for valid presets).

- **`frontend/src/pages/AnalyticsPage.tsx`** — full rewrite:
  - Date range `Select` in the page header (10 preset options).
  - 8 KPI tiles: Spend, Impressions, Reach, Clicks, CTR, CPC, CPM, Results.
  - Daily performance line chart (spend / clicks / results).
  - Summary + Recommendation glass cards (heuristic, no LLM).
  - Spend-by-campaign bar.
  - Platform split (horizontal bar with share %).
  - Top placements (bar).
  - Audience age × gender (bar).
  - Top ads grid with creative thumbnails (separate `useQuery` so a
    failing `/ads/top` doesn't sink the rest of the page).
  - Per-campaign performance table.
  - CTWA conversation sources (rendered only when CTWA data exists).
  - Manual Refresh button + `staleTime: 60s`.

- **`frontend/src/api/queryClient.ts`** — new query keys for the three
  analytics endpoints, keyed by date preset/days/limit.

## Data flow

```
User opens /analytics
  → React Query fires getDashboard({ date_preset })
  → Backend resolves org id + active ad account
  → 6 parallel calls (5 to Meta, 1 to DB)
  → Aggregation + section-level error capture
  → Single JSON response with all sections + sectionErrors map
  → Frontend renders KPIs, charts, breakdowns, ads grid, campaign table
  → If user changes date preset or hits Refresh → new request
```

## Edge cases

| Case | Handling |
|---|---|
| No active Meta ad account | Service returns `{ hasAccount: false }`; UI shows "Connect Meta account" CTA linking to `/ads/setup`. |
| Meta token expired (401 from Meta) | Surfaced as ApiError 401 → UI shows reconnect alert. |
| Rate limit (Meta error code 4/17/32) | `MetaAdsApiService._request` already retries 2× with exponential backoff. If still failing, surfaces as warn alert with Retry button. |
| One breakdown call fails (others succeed) | Service still returns the other sections; failing section reports `null` and `sectionErrors[name]` is set; UI renders an info banner listing failed sections. |
| Top ads / creative join fails | Top ads still render with `thumbnail_url=null`. |
| Top ads insights call itself fails | Throws (top ads is a separate query, won't affect the rest of the page). |
| Empty range (0 spend, 0 impressions) | UI shows "No insights from Meta in this window" info alert; charts show inline empty states. |
| Currency from connected account | Pulled from `meta_ad_accounts.currency`; KPIs format via `Intl.NumberFormat` with fallback for invalid codes. |
| Out-of-range / invalid `?days=` value | Backend falls back to `last_28d`. |
| Invalid `?date_preset=` value | Backend falls back to `last_28d`. |
| `?days=N` mapping to a known preset (7/14/28/30/90) | Service uses Meta `date_preset=last_Nd` rather than building a custom `time_range`. |
| `?days=N` not matching a preset | Service builds a UTC `time_range` `since`/`until`. |
| Pagination on breakdown queries (e.g. age × gender) | Looped via `paging.next` for up to 20 pages. |

## Tests

`backend/tests/services/AnalyticsService.test.js` (13 tests, all passing):

- `getDashboard` — no-account fast path, full happy path with totals/trend/breakdowns,
  partial-failure degradation.
- `_resolveRange` — preset pass-through, `?days=` → preset mapping,
  `?days=` → `time_range` fallback, invalid preset/days fallback.
- `getCampaigns` — derived metrics + sort, no-account fast path.
- `getTopAds` — creative join, creative-fail tolerance, insights-fail throw.

Backend smoke: full vitest suite — **86 tests passing across 5 files**, no regressions.
Frontend smoke: TypeScript + ESLint clean for the four files touched
(pre-existing CRM/Settings TS errors are unrelated).

## Files changed

```
backend/
  src/services/AnalyticsService.js        (new)
  src/services/MetaAdsApiService.js       (+1 method)
  src/modules/analytics/routes.js         (rewritten)
  src/plugins/di.js                       (+ AnalyticsService wiring)
  tests/services/AnalyticsService.test.js (new)
frontend/
  src/api/analytics.ts                    (rewritten)
  src/api/queryClient.ts                  (+ new query keys)
  src/api/index.ts                        (re-exports)
  src/pages/AnalyticsPage.tsx             (rewritten)
docs/superpowers/specs/
  2026-05-03-analytics-page-design.md     (this file)
```
