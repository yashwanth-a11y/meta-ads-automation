# growthos-backend

Fastify backend skeleton for GrowthOS.

## Run

```bash
cd backend
copy .env.example .env       # PowerShell / Windows;  use `cp` on macOS/Linux
npm install
npm run dev                  # http://localhost:4000
```

Health check: `GET http://localhost:4000/health` → `{ status: "ok", uptime, timestamp }`

Every other route is a stub returning `501 NOT_IMPLEMENTED` — that's expected, fill them in phase by phase.

## Layout

```
backend/
├── src/
│   ├── server.js              # entry point: builds app, listens, graceful shutdown
│   ├── app.js                 # Fastify factory: registers plugins + routes
│   ├── config/
│   │   └── env.js             # zod-validated env loader (fails fast on bad config)
│   ├── lib/
│   │   └── errors.js          # AppError + helpers (badRequest, unauthorized, ...)
│   ├── plugins/
│   │   ├── index.js           # registers cross-cutting plugins
│   │   ├── auth.js            # @fastify/jwt + app.requireAuth decorator
│   │   └── error-handler.js   # uniform error and 404 responses
│   └── modules/
│       ├── index.js           # registers module routes under /api/v1/* and /webhooks/*
│       ├── health/            # /health, /ready
│       ├── auth/              # /api/v1/auth
│       ├── tenants/           # /api/v1/tenants
│       ├── channels/          # MS1 — channel CRUD, brand assets, examples, approvers
│       ├── trends/            # MS1 — sources, candidates, ingestion
│       ├── creatives/         # MS1 — generate, regenerate, render, score
│       ├── approvals/         # MS1 — signed-link approve/reject/regenerate
│       ├── publishing/        # MS1 — IG publish jobs
│       ├── meta/              # MS2 — OAuth, asset selection, sync
│       ├── ads/               # MS2 — drafts, generate, publish, campaigns, compliance
│       ├── leads/             # MS2 — CRM (CRUD, notes, assign, status, import/export, PII erase)
│       ├── analytics/         # MS2 — GenUI query, typed analytics, summaries
│       └── webhooks/          # Inbound (Meta lead ads, etc.)
└── package.json
```

## Notes

- Node 20.10+ required (uses native ESM and modern Fastify).
- No DB / queue / Docker yet — those plug in when you start Phase 1.
- `.env` is required to start (zod will print missing/invalid keys and exit non-zero).
