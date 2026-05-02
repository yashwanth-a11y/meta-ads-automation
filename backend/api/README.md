# @growthos/api

Fastify backend skeleton for GrowthOS.

## Run

```bash
cd api
cp .env.example .env
npm install      # or pnpm install
npm run dev      # http://localhost:4000
```

Health check: `GET http://localhost:4000/health`

## Layout

```
api/
├── src/
│   ├── server.js              # entry point: builds app, listens, graceful shutdown
│   ├── app.js                 # Fastify factory: registers plugins + routes
│   ├── config/
│   │   └── env.js             # zod-validated env loader
│   ├── lib/
│   │   └── errors.js          # AppError + helpers
│   ├── plugins/
│   │   ├── index.js           # registers cross-cutting plugins
│   │   ├── auth.js            # @fastify/jwt + decorators (stub)
│   │   └── error-handler.js   # uniform error responses
│   └── modules/
│       ├── index.js           # registers all module routes under /api/v1 (and /webhooks)
│       ├── health/            # /health
│       ├── auth/              # /api/v1/auth
│       ├── tenants/           # /api/v1/tenants
│       ├── channels/          # MS1 — channel CRUD, brand assets
│       ├── trends/            # MS1 — trend sources, candidates
│       ├── creatives/         # MS1 — generation, scoring, render
│       ├── approvals/         # MS1 — signed-link approval flow
│       ├── publishing/        # MS1 — IG publish jobs
│       ├── meta/              # MS2 — Meta OAuth, sync, accounts
│       ├── ads/               # MS2 — ad generation + push to Meta
│       ├── leads/             # MS2 — CRM
│       ├── analytics/         # MS2 — GenUI tool-calling + summaries
│       └── webhooks/          # Inbound webhooks (Meta lead ads, etc.)
└── package.json
```

## Notes

This is a **skeleton**: every module exposes route stubs with the spec endpoints sketched out, but handlers return `501 Not Implemented`. Wire up real logic phase by phase.
