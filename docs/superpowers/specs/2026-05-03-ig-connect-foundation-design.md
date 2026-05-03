# Instagram Account Connection — Foundation (Spec 1)

**Date:** 2026-05-03
**Author:** Hussain (with Claude)
**Status:** Draft — pending user review
**Phase:** 1 of 2 (Spec 2 = Insights & Analytics, deferred)

## 1. Goal

Let users connect their Instagram Business accounts to GrowthOS, link those accounts to one or more channels (many-to-many), and have the existing `PublishingService.publishBundle` automatically fan out each scheduled post to every Instagram account linked to that channel.

The Instagram tab in the sidebar is the user-facing entry point: connect a new account, manage which channels each account is attached to, and view a list of recent posts on each account (thumbnail / caption / permalink only — deeper insights are Spec 2).

This spec deliberately stops short of analytics, charts, and per-post insight metrics. Those depend on the same data model and API plumbing built here, so shipping Foundation first keeps the feedback loop short and unblocks the analytics work.

## 2. Non-goals (deferred to Spec 2)

- Per-post insights (impressions, reach, engagement, saves, plays, average watch time)
- Account-level insights time-series and charts
- "Posts published from GrowthOS" vs "all IG history" toggle (the `/media` endpoint already returns everything; the toggle is a frontend filter against `creative_bundles.render_job_id` and is not load-bearing)
- Token-refresh background job (manual refresh endpoint exists, that's enough for v1)
- Webhooks (no DM/comment automation in GrowthOS)
- Plan-limit gating / entitlements (GrowthOS doesn't have an entitlements layer)

## 3. Architecture overview

The dropped-in files at `backend/src/Controllers/InstagramOAuthController.js`, `backend/src/services/InstagramOAuthServices.js`, and `backend/src/Routes/InstagramOAuthRoutes.js` are the **OAuth-flow blueprint**, not a drop-in implementation. They reference repositories, API services, an entitlement service, a `instagram_accounts` table, webhook subscriptions, and DM/comment automation tables — none of which exist in GrowthOS.

We adapt the OAuth flow (~30% of the dropped-in code), strip everything that's irrelevant to GrowthOS's posting use case, and build the rest fresh against existing patterns (`MetaAdAccountRepository`, `AdsService`, `plugins/di.js`).

A new join table `channel_instagram_accounts` carries the multi-IG-per-channel relationship the dropped-in code does **not** model. The existing `channels.instagram_account_id` column is preserved as a backward-compat fallback and becomes load-bearing only when no join rows exist for a channel.

## 4. Backend

### 4.1 New tables (`backend/src/db/schema.js`)

```js
// Note: this codebase stores ids as varchar(36) (UUID-as-string), uses the
// existing id() and orgId() helpers in schema.js, and does NOT declare FK
// constraints in drizzle (existing tables are FK-less; we follow that
// pattern). Cascading on disconnect is handled in the repository layer.

export const instagramAccounts = pgTable(
  'instagram_accounts',
  {
    id: id(),
    organization_id: orgId(),
    user_id: varchar('user_id', { length: 36 }), // who first connected; nullable
    ig_business_id: varchar('ig_business_id', { length: 64 }).notNull(),
    ig_page_id: varchar('ig_page_id', { length: 64 }),
    ig_username: varchar('ig_username', { length: 255 }),
    ig_name: varchar('ig_name', { length: 255 }),
    ig_profile_picture_url: text('ig_profile_picture_url'),
    account_type: varchar('account_type', { length: 32 }),  // BUSINESS | CREATOR
    followers_count: integer('followers_count').default(0),
    follows_count: integer('follows_count').default(0),
    media_count: integer('media_count').default(0),
    access_token_encrypted: text('access_token_encrypted').notNull(),
    token_expires_at: timestamp('token_expires_at', { withTimezone: true, mode: 'date' }),
    last_synced_at: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: ts('created_at'),
    updated_at: ts('updated_at'),
  },
  (t) => ({
    org_idx: index('instagram_accounts_org_idx').on(t.organization_id),
    org_active_idx: index('instagram_accounts_org_active_idx').on(t.organization_id, t.is_active),
    org_business_unique: uniqueIndex('instagram_accounts_org_business_unique')
      .on(t.organization_id, t.ig_business_id),
  }),
);

export const channelInstagramAccounts = pgTable(
  'channel_instagram_accounts',
  {
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    instagram_account_id: varchar('instagram_account_id', { length: 36 }).notNull(),
    organization_id: orgId(),
    created_at: ts('created_at'),
  },
  (t) => ({
    // Composite PK enforces no-duplicate-link
    pk: uniqueIndex('channel_ig_accounts_pk').on(t.channel_id, t.instagram_account_id),
    channel_idx: index('channel_ig_accounts_channel_idx').on(t.channel_id),
    ig_idx: index('channel_ig_accounts_ig_idx').on(t.instagram_account_id),
    org_idx: index('channel_ig_accounts_org_idx').on(t.organization_id),
  }),
);
```

`channels.instagram_account_id` (existing, single varchar) is **kept** so existing channels keep posting after migration. It now means "fallback IG business ID if no join rows exist." The migration step can backfill: for every channel where `instagram_account_id IS NOT NULL`, look up matching `instagram_accounts.ig_business_id` for the same org and create a join row. Channels whose `instagram_account_id` doesn't match any connected account stay on the fallback (legacy hand-typed IDs that were never OAuth-connected).

### 4.2 Env + config

`backend/.env` (added; values come from the user's Meta App):
```
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_REDIRECT_URI=          # optional; service derives one if blank
INSTAGRAM_FORCE_REAUTH=false     # toggle for dev when re-permissioning
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
```

`backend/src/config/env.js` — add validators for the four new keys.
`backend/src/config/index.js` — extend the exported `config` object:
```js
instagram: {
  appId: env.INSTAGRAM_APP_ID,
  appSecret: env.INSTAGRAM_APP_SECRET,
  scopes: env.INSTAGRAM_OAUTH_SCOPES,
  forceReauth: env.INSTAGRAM_FORCE_REAUTH === 'true',
},
redirectUris: {
  // existing keys preserved
  metaAds: env.META_ADS_REDIRECT_URI,
  facebook: env.FACEBOOK_REDIRECT_URI,
  instagram: env.INSTAGRAM_REDIRECT_URI,
},
```

### 4.3 Repository — `backend/src/Repositories/InstagramAccountRepository.js`

Pattern matches `MetaAdAccountRepository`. Methods needed:
- `create(row)` / `update(id, patch)` / `findById(id)` / `findByBusinessId(orgId, igBusinessId)` / `findByOrganization(orgId)` / `countActiveByOrganization(orgId)`
- `softDeactivate(id)` (sets `is_active=false`) and `hardDelete(id)` (DELETE; cascades join rows)
- `linkChannel(orgId, accountId, channelId)` / `unlinkChannel(orgId, accountId, channelId)`
- `findChannelsForAccount(accountId)` / `findAccountsForChannel(channelId)` (used by `PublishingService.publishBundle`)
- `findActiveAccountsForChannel(channelId)` — only `is_active = true`, used by publishing fan-out

### 4.4 OAuth service — `backend/src/services/InstagramOAuthService.js`

Adapted from the dropped-in `InstagramOAuthServices.js`. Methods kept:
- `generateAuthUrl({ origin, referer, forwardedHost, forwardedProto })` — same logic, points at `https://www.instagram.com/oauth/authorize`
- `connectAccount(code, redirectUri, user, requestHeaders)` — same shape: exchange short-lived → long-lived → fetch profile → resolve `pageId` → upsert into `instagram_accounts`. Returns `{ id, username, name, isNew }`
- `disconnectAccount(userId, accountId)` — hard-delete via repository
- `refreshAccount(userId, accountId)` — token refresh via API service

Methods **dropped** (and the reasons):
- `assertCanConnectAccount` / entitlement gating — GrowthOS has no entitlements
- `_probeCommentScope` — only relevant for auto-reply automation, not posting
- IGSID-for-messaging fallback chain — only relevant for webhook-based DM matching
- `subscribeToWebhooks` — no IG webhook handlers in GrowthOS
- Cross-org guard — references tables (`instagram_automation_flows`, `instagram_posts`, `instagram_threads`) that don't exist; we still want a simpler version that prevents the same `(org, ig_business_id)` row twice (the unique index already handles this)

User-shape adaptation: the dropped-in code reads `request.user.userId || request.user.id`. GrowthOS's `plugins/auth.js` populates `request.user` from JWT and provides `request.user.organization_id`. The adapted service takes `organizationId` directly from the controller, and `userId` is optional metadata for audit.

### 4.5 API service — `backend/src/services/InstagramApiService.js` (new, thin)

Wraps Meta Graph calls used by the OAuth and account-management flows. Methods:
- `exchangeForLongLivedToken(shortToken)` — POST `/oauth/access_token?grant_type=ig_exchange_token`
- `refreshLongLivedToken(longToken)` — GET `/refresh_access_token?grant_type=ig_refresh_token`
- `getProfile(igBusinessId, token)` — GET `/{ig_business_id}?fields=id,username,name,profile_picture_url,account_type,followers_count,follows_count,media_count,biography,website`
- `getPageId(igBusinessId, token)` — GET `/{ig_business_id}?fields=connected_facebook_page{id}` with fallback to `/me/accounts`
- `getMedia(igBusinessId, token, { limit=25, after })` — GET `/{ig_business_id}/media?fields=id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,media_product_type` with cursor pagination

All requests timeout at 15s. Errors bubble up with the Meta error code attached so the controller can shape user-facing messages.

### 4.6 Controller — `backend/src/Controllers/InstagramOAuthController.js`

Adapted from the dropped-in. Fixes:
- `request.user.userId || request.user.id` → use `request.user.organization_id` directly
- Drop entitlement-error branches (no `INSTAGRAM_INTEGRATION_DISABLED` / `INSTAGRAM_ACCOUNT_LIMIT_REACHED`)
- Drop IGSID logging from the pino message bodies (no IGSID in the new flow)

New methods added (don't exist in the dropped-in file):
- `linkChannel(req, reply)` — body `{ channel_id }`, calls `service.linkChannel(orgId, accountId, channelId)` after verifying both belong to the same org
- `unlinkChannel(req, reply)` — params `:accountId` and `:channelId`
- `getMedia(req, reply)` — query `?limit=25&after=...`, returns `{ data, paging }`

### 4.7 Routes — `backend/src/Routes/InstagramOAuthRoutes.js`

Adapted from the dropped-in. Fixes:
- Import path bug: `'../../../plugins/auth.js'` → use the decorated `app.requireAuth` (no import needed; matches `AdRoutes.js` pattern)
- Mount under `/api/v1/instagram` (currently the file uses `/instagram/...` — fine; mount path is set at registration)

Final route list:
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/oauth/url`                              | Build IG auth URL |
| POST   | `/oauth/exchange`                         | Finish OAuth, store account |
| GET    | `/accounts`                               | List org's connected IG accounts |
| GET    | `/accounts/:accountId`                    | Get one (no token in response) |
| DELETE | `/accounts/:accountId`                    | Disconnect (hard-delete + cascade) |
| POST   | `/accounts/:accountId/refresh`            | Refresh long-lived token |
| GET    | `/accounts/:accountId/media`              | Recent posts (basic fields) |
| POST   | `/accounts/:accountId/links`              | Body `{ channel_id }` — link to channel |
| DELETE | `/accounts/:accountId/links/:channelId`   | Unlink from channel |

Removed from the dropped-in routes: `/accounts/:accountId/insights` — moves to Spec 2.

### 4.8 DI wiring — `backend/src/plugins/di.js`

```js
const instagramAccountRepository = new InstagramAccountRepository(db);
const instagramApiService = new InstagramApiService({ logger: app.log });
const instagramOAuthService = new InstagramOAuthService({
  logger: app.log,
  repository: instagramAccountRepository,
  apiService: instagramApiService,
});
const instagramOAuthController = new InstagramOAuthController(instagramOAuthService, app.log);

app.decorate('instagramAccountRepository', instagramAccountRepository);
app.decorate('instagramOAuthController', instagramOAuthController);
```

### 4.9 Server registration — `backend/src/server.js`

Register `instagramOAuthRoutes` under `/api/v1/instagram` next to the other v1 modules.

### 4.10 PublishingService fan-out — `backend/src/services/PublishingService.js`

`publishBundle(channel, bundle)` change:
- Old: read `channel.instagram_account_id` → publish once → store one `mediaId` in `creative_bundles.render_job_id`
- New: read `channelInstagramAccounts` rows for `channel.id`. If any exist:
    1. For each linked IG account, call `publishMedia(channelStub, spec)` where `channelStub` is `{ instagram_account_id: igAccount.ig_business_id, organization_id: channel.organization_id }`. The token is already on the IG account row, so `_getPageToken` is bypassed in favor of decrypting `instagramAccount.access_token_encrypted` directly.
    2. Collect results: `[{ instagram_account_id, ig_username, mediaId | null, error | null }]`
    3. If at least one publish succeeded, set bundle status `published`. Store the **first successful** `mediaId` in the existing `render_job_id` column (varchar(128)) for backward-compat with anything that reads it. Store the full per-account result list in a new column `published_targets` (jsonb, see schema change below).
    4. If all failed, roll back to `ready` and throw the first error
- Fallback when no join rows: use the legacy `channel.instagram_account_id` path (existing logic preserved). This keeps existing channels publishing without migration.

**Schema change to `creative_bundles`:**
```js
// add to creativeBundles columns
published_targets: jsonb('published_targets').default([]),
// shape: [{ instagram_account_id: uuid, ig_username: string, ig_business_id: string,
//           media_id: string | null, error: string | null, published_at: ISO8601 }]
```
This is an additive column — nullable / defaults to `[]`. No data migration needed.

`_getPageToken` is **not** removed. It's still used by the legacy path. The new IG-account path uses the IG-account-row's encrypted token instead.

### 4.11 Tests

Backend (vitest, mirroring the existing PublishingService.test.js pattern):
- `tests/services/InstagramOAuthService.test.js` — `generateAuthUrl` returns versioned URL with required scopes; `connectAccount` upserts via repo; `disconnectAccount` hard-deletes; `refreshAccount` updates token + expiry
- `tests/repositories/InstagramAccountRepository.test.js` — link/unlink, `findActiveAccountsForChannel`, unique-constraint behavior on duplicate connect
- `tests/services/PublishingService.test.js` — extend with: "publishBundle fans out to multiple linked IG accounts"; "publishBundle falls back to channel.instagram_account_id when no join rows"; "publishBundle returns partial-success when one of two fails"

## 5. Frontend

### 5.1 Routing

`frontend/src/auth/constants.ts`:
```ts
export const paths = {
  // ...existing
  instagram: '/instagram',
  instagramCallback: '/instagram/callback',
}
```

Add the routes to wherever the app's router declares them (the Plan task will pin the exact file).

### 5.2 Sidebar — `frontend/src/components/layout/Sidebar.tsx`

Add a new entry between "Creatives" and "Ads":
```tsx
{ to: paths.instagram, label: 'Instagram', icon: PhotoCameraOutlined },
```
Use `PhotoCameraOutlined` from `@mui/icons-material` (avoid the IG trademark logo for safety; this is the convention used by the rest of the sidebar).

### 5.3 Pages

**`frontend/src/pages/InstagramPage.tsx`** — entry-point page:
- Header: "Instagram Accounts" + "Connect Instagram" button (disabled while loading)
- If empty state: large CTA card explaining the feature with the connect button
- If accounts present: list of cards, one per connected account
  - Avatar (`ig_profile_picture_url`), `@ig_username`, `ig_name`
  - Stats row: followers / follows / media count
  - "Linked channels" chips (clickable to manage) with a "+" to add a channel link
  - "Recent posts" disclosure that, when opened, fetches `/accounts/:id/media` and shows up to 12 thumbnails (grid). Click → opens `permalink` in new tab. Empty state if `media_count == 0`.
  - Right-aligned overflow menu: Refresh token / Disconnect

**`frontend/src/pages/InstagramCallbackPage.tsx`** — OAuth landing:
- On mount: read `code` and `state` from query string, POST `/oauth/exchange`, show a spinner with "Connecting your Instagram account..."
- On success: navigate to `/instagram` and surface a success snackbar
- On error: show the error message and a "Try again" button that goes to `/instagram`

### 5.4 API client — `frontend/src/lib/api/instagram.ts`

Typed wrapper functions for each route, using whatever HTTP client the rest of the frontend uses (likely axios or fetch with auth header from `localStorage.auth_token`).

### 5.5 Channel-link UX

The "+ Link channel" UI inside an Instagram account card opens a small dialog:
- Multi-select dropdown of the org's channels (already-linked ones are pre-selected and disabled)
- Save → calls `POST /accounts/:id/links` for each newly-selected channel and `DELETE` for each removed one
- Closes and refreshes the account card

The same dialog is reachable from the channel page (later — out of scope for this spec; users do it from the Instagram tab in v1).

## 6. Data flow — connect happy path

1. User clicks **Connect Instagram** → frontend `GET /api/v1/instagram/oauth/url` → backend builds `https://www.instagram.com/oauth/authorize?client_id=...&scope=...&redirect_uri=${origin}/instagram/callback&state=...`
2. Frontend `window.location = authUrl`
3. User grants on Meta → Meta redirects to `${origin}/instagram/callback?code=...&state=...`
4. `InstagramCallbackPage` mounts → `POST /api/v1/instagram/oauth/exchange { code, redirect_uri }` → backend exchanges, fetches profile, upserts `instagram_accounts` → returns `{ id, username, name, isNew }`
5. Frontend navigates to `/instagram` and shows the new account
6. User opens the account card, clicks **Link channel**, picks one or more channels, saves → join rows created
7. Next time `PublishingService.publishBundle` runs for that channel, the post fans out to every linked IG account

## 7. Error handling

Backend:
- Token-exchange failures → 502 with Meta's `error_message` surfaced
- Duplicate connect (`organization_id`, `ig_business_id` already exists and active) → repo's unique-index conflict → service catches and updates the existing row (treats it as a refresh), returns `isNew: false`
- Cross-org connect (same IG account active in another org) → 409 with a clear message ("@username is already connected to another organization")
- Linking an IG account to a channel from a different org → 403
- Refresh / disconnect / link / unlink with a wrong-org IG account ID → 404 (don't leak existence)

Frontend:
- Callback page error states: missing `code`/`state`, exchange 4xx, exchange 5xx — each gets a different message
- Connect button errors → toast with the server's `error` field
- All HTTP failures → respect the standard `{ success, error, code? }` shape the dropped-in code already uses

## 8. Open questions / risks

1. **Meta App approval scopes:** GrowthOS's Meta App needs `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`. If the app is in dev mode, only test users / business members can connect. This is operational, not code — call out in the Plan.
2. **`channels.instagram_account_id` deprecation path:** Spec keeps it for backward-compat. A future spec can drop it once all rows are backed by `instagram_accounts` join rows.
3. **Token freshness:** Spec 1 ships only a manual refresh endpoint. Long-lived IG tokens last 60 days. A scheduled background refresh job is Spec 2.
4. **Insights scope creep:** The dropped-in service includes `getInsights` / `getComprehensiveInsights`. Tempting to keep the route. We're explicitly NOT keeping it — Spec 2 owns that surface end-to-end.
5. **Concurrency in fan-out:** `publishBundle` fan-out can hit Meta's rate limits when a channel has many linked IG accounts. Spec 1 publishes serially (`for...of` with `await`); Spec 2 can parallelize with a small concurrency limit if needed.
6. **Frontend HTTP client:** The plan task should confirm the exact pattern (axios instance? React Query? plain fetch with a wrapper?) by reading one existing API file like `lib/api/channels.ts`.

## 9. Scope summary

| Area | Files |
|------|-------|
| Schema | `backend/src/db/schema.js` (+2 tables: `instagram_accounts`, `channel_instagram_accounts`; +1 column: `creative_bundles.published_targets` jsonb) |
| Migration | `backend/drizzle/...` (per drizzle-kit conventions) |
| Repo | `backend/src/Repositories/InstagramAccountRepository.js` (new) |
| Services | `InstagramOAuthService.js`, `InstagramApiService.js` (new); `PublishingService.js` (modified for fan-out) |
| Controller | `backend/src/Controllers/InstagramOAuthController.js` (adapted from dropped-in) |
| Routes | `backend/src/Routes/InstagramOAuthRoutes.js` (adapted from dropped-in) |
| Wiring | `plugins/di.js`, `server.js`, `config/env.js`, `config/index.js`, `.env` |
| Tests | 3 new test files (services + repo); 1 modified (PublishingService) |
| Frontend | `Sidebar.tsx`, `auth/constants.ts`, router, `pages/InstagramPage.tsx`, `pages/InstagramCallbackPage.tsx`, `lib/api/instagram.ts` |

Estimate: 5-7 days of focused work, with ~50% on backend (schema, OAuth service, fan-out, tests) and ~50% on frontend (page, callback, link UX).
