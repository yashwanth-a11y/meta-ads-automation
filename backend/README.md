# growthos-backend

Fastify (Node.js, JS) backend for GrowthOS. Currently wired for the **Meta Ads** slice end-to-end (frontend → validation → controller → service → Meta Marketing API), with stubs for the rest of the spec.

## Prerequisites

- Node.js 20.10+
- PostgreSQL 14+ reachable on `localhost:5432` (or wherever you point `DB_HOST`/`DB_PORT`)
- A Meta Developer app with the Marketing API product enabled

## Run

```powershell
cd backend

# 1. Set up env
Copy-Item .env.example .env
# Generate a 64-hex-char encryption key for TOKEN_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Fill in DB_PASSWORD + Meta app credentials in .env

# 2. Install
Remove-Item .\package-lock.json -ErrorAction SilentlyContinue
npm install

# 3. Make sure the database exists (Postgres):
#    psql -h localhost -U postgres -c "CREATE DATABASE \"Automation_Meta_Ads\";"

# 4. Push the Drizzle schema
npm run db:push

# 5. Start the API
npm run dev      # http://localhost:4000
```

Health check: `GET http://localhost:4000/health`

## End-to-end flow (frontend → Meta)

1. **Frontend mints a dev JWT** (local only):
   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/dev-token \
     -H 'content-type: application/json' \
     -d '{"organization_id":"org_dev_local"}'
   # → { token: "eyJ...", payload: { id, organization_id, ... } }
   ```
2. **Frontend kicks off Meta OAuth** — server returns a URL with a signed `state`:
   ```bash
   curl http://localhost:4000/api/v1/ads/setup/oauth-url \
     -H "authorization: Bearer $TOKEN"
   ```
3. User completes the Facebook login → Facebook redirects to `META_ADS_REDIRECT_URI` with `?code=...&state=...`. Frontend POSTs both back:
   ```bash
   curl -X POST http://localhost:4000/api/v1/ads/setup/callback \
     -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"code":"AQB...","state":"<the state from step 2>"}'
   # → { ad_accounts: [...], pages: [...], access_token, oauth_app_id }
   ```
4. Frontend lets the user pick an ad account + page, posts the selection:
   ```bash
   curl -X POST http://localhost:4000/api/v1/ads/setup/connect ...
   ```
   Token is encrypted (AES-256-GCM) and stored in `meta_ad_accounts`.
5. Frontend POSTs a campaign brief:
   ```bash
   curl -X POST http://localhost:4000/api/v1/ads/campaigns \
     -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"name":"Test CTWA","daily_budget":500,"creative_spec":{...},"publish":true}'
   ```
   Fastify validates the body against the JSON-Schema attached to the route → `AdsController` → `AdsService.createCampaign` → `MetaAdsApiService` does **4 sequential POSTs to Meta**: campaign → adset → creative → ad. The PhotonX-side row lands in `ctwa_campaigns`. With `publish: true`, all three Meta objects flip from PAUSED → ACTIVE.

Same pattern for everything else (drafts, audiences, insights, leads): **route schema → controller → service → repo + MetaAdsApiService**.

## Layout

```
backend/
├── drizzle.config.js              # drizzle-kit config (PostgreSQL)
├── src/
│   ├── server.js                  # entry: dotenv + buildApp + listen + graceful shutdown
│   ├── app.js                     # Fastify factory: registers plugins + routes
│   ├── config/
│   │   ├── env.js                 # zod-validated env (fails fast on bad config)
│   │   └── index.js               # shaped re-export: config.meta.*, config.redirectUris.*, etc.
│   ├── db/
│   │   ├── index.js               # pg Pool + drizzle/node-postgres
│   │   └── schema.js              # all tables (meta_ad_accounts, ctwa_campaigns, ...)
│   ├── utils/
│   │   └── encryption.js          # AES-256-GCM encryptToken / decryptToken
│   ├── lib/
│   │   └── errors.js              # AppError + helpers
│   ├── plugins/
│   │   ├── index.js               # registers helmet, cors, sensible, multipart, auth, errors, di
│   │   ├── auth.js                # @fastify/jwt + requireAuth + authenticate (alias)
│   │   ├── error-handler.js       # uniform error and 404 responses (handles AppError + POJO + Meta errors)
│   │   └── di.js                  # builds repos → service → controller, decorates app.adsController
│   ├── Controllers/
│   │   └── AdsController.js
│   ├── Routes/
│   │   └── AdRoutes.js            # /api/v1/ads/* — schemas + auth + delegates to controller
│   ├── Repositories/
│   │   ├── MetaAdAccountRepository.js
│   │   ├── CtwaCampaignRepository.js
│   │   ├── CtwaConversationRepository.js
│   │   ├── CtwaConversionRepository.js
│   │   └── CtwaInsightsRepository.js
│   ├── services/
│   │   ├── AdsService.js          # business logic for all ads endpoints
│   │   ├── MetaAdsApiService.js   # axios wrapper around Meta Graph API
│   │   └── MetaCapiService.js     # CTWA Conversion API (Pixel events)
│   └── modules/                   # 501-stub routes for everything not yet implemented
│       ├── index.js               # registrar — under /api/v1/* (and /webhooks)
│       ├── health/  auth/  tenants/  channels/  trends/  creatives/
│       ├── approvals/  publishing/  meta/  leads/  analytics/  webhooks/
└── package.json
```

## Useful endpoints right now

```
GET  /health                                # liveness
POST /api/v1/auth/dev-token                 # mint a JWT (development only)
GET  /api/v1/auth/me                        # echoes the JWT payload

# --- Meta Ads (all auth-required) ---
GET  /api/v1/ads/setup/status               # is an account connected?
GET  /api/v1/ads/setup/oauth-url            # returns Facebook login URL + signed state
POST /api/v1/ads/setup/callback             # body: { code, state } → exchanges + lists accounts/pages
POST /api/v1/ads/setup/connect              # body: ad_account_id, access_token, page_id, ...
GET  /api/v1/ads/setup/ad-accounts          # available accounts on connected token
POST /api/v1/ads/setup/switch               # switch active ad account
GET  /api/v1/ads/setup/balance              # live balance
DELETE /api/v1/ads/setup/disconnect

GET  /api/v1/ads/campaigns                  # list (DB-cached)
POST /api/v1/ads/campaigns                  # create on Meta + persist
GET  /api/v1/ads/campaigns/:id              # detail
PATCH /api/v1/ads/campaigns/:id             # update budget/status/end_date
DELETE /api/v1/ads/campaigns/:id            # delete on Meta + soft-delete locally
POST /api/v1/ads/campaigns/:id/sync         # pull latest insights from Meta
POST /api/v1/ads/campaigns/:id/duplicate

GET  /api/v1/ads/campaigns/:id/insights
GET  /api/v1/ads/campaigns/:id/leads-chart

POST /api/v1/ads/search/interests
POST /api/v1/ads/search/locations

# Audiences, catalogs, lead forms, AI assistant, Instagram dashboard, etc. — see Routes/AdRoutes.js
```

Everything outside `/api/v1/ads/*` is still a 501 stub — fill in module by module.

## Drizzle / Postgres

- `npm run db:push` — apply schema directly to the DB (fast iteration in dev).
- `npm run db:generate` — emit a migration SQL file under `drizzle/` (use once you have prod data).
- `npm run db:migrate` — run pending migrations.
- `npm run db:studio` — open the Drizzle Studio web UI to inspect the DB.

## Notes / open items

- `audiencePresetRepository`, `contactRepository`, `businessAccountRepository`, `automationFlowRepository` are passed as `null` to `AdsService` from [plugins/di.js](src/plugins/di.js) — the service's audience-presets / contact-derived audiences / WhatsApp number lookup features will degrade until those repos exist.
- Meta CAPI test events: set `META_CAPI_TEST_CODE` to the code from Events Manager → Test events tab. Leave blank in prod.
- `getReachEstimate` uses Meta's deprecated `/reachestimate` — switch to `/delivery_estimate` before relying on it.
