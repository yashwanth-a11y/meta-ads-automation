# Instagram Connect — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Instagram tab to the sidebar that lets users OAuth-connect Instagram Business accounts, link each account to one or more channels (many-to-many), and have the existing `PublishingService.publishBundle` automatically fan out posts to every linked IG account on a channel.

**Architecture:** Adapt the dropped-in OAuth files (`backend/src/Controllers/InstagramOAuthController.js`, `backend/src/services/InstagramOAuthServices.js`, `backend/src/Routes/InstagramOAuthRoutes.js`) — these came with too many dependencies (entitlements, webhooks, automation flows, IGSID-for-messaging) that don't exist in growthos. Strip the baggage, fix the user-shape mismatch, build the missing repository / API service / channel-link layer, and wire `publishBundle` to fan out.

**Tech Stack:** Node 20+, Fastify, Drizzle (Postgres) with `varchar(36)` UUIDs, axios, vitest, React + react-router-dom v6, MUI. Spec at [docs/superpowers/specs/2026-05-03-ig-connect-foundation-design.md](../specs/2026-05-03-ig-connect-foundation-design.md).

---

## File Structure

**Modified (existing files):**
- [`backend/src/db/schema.js`](../../../backend/src/db/schema.js) — add `instagramAccounts` and `channelInstagramAccounts` tables; add `published_targets` jsonb column to `creativeBundles`.
- [`backend/src/config/env.js`](../../../backend/src/config/env.js) — add `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_FORCE_REAUTH`, `INSTAGRAM_OAUTH_SCOPES` env validators.
- [`backend/src/config/index.js`](../../../backend/src/config/index.js) — add `config.instagram` and `config.redirectUris.instagram`.
- [`backend/src/services/InstagramOAuthServices.js`](../../../backend/src/services/InstagramOAuthServices.js) — adapt: drop entitlements, webhooks, IGSID, comment-scope probe; fix DI constructor shape.
- [`backend/src/Controllers/InstagramOAuthController.js`](../../../backend/src/Controllers/InstagramOAuthController.js) — fix `request.user.userId` → `request.user.organization_id`; add `linkChannel`, `unlinkChannel`, `getMedia`; drop entitlement branches.
- [`backend/src/Routes/InstagramOAuthRoutes.js`](../../../backend/src/Routes/InstagramOAuthRoutes.js) — fix `'../../../plugins/auth.js'` import (use `app.requireAuth` decorator); add link/unlink/media routes; remove insights route.
- [`backend/src/services/PublishingService.js`](../../../backend/src/services/PublishingService.js) — `publishBundle` reads linked IG accounts, fans out, stores per-account results in `published_targets`.
- [`backend/src/plugins/di.js`](../../../backend/src/plugins/di.js) — instantiate repo / API service / OAuth service / controller; decorate the app.
- [`backend/src/modules/index.js`](../../../backend/src/modules/index.js) — register Instagram routes under `/api/v1`.
- [`backend/.env`](../../../backend/.env) — add the four new env vars (placeholders; user fills real values).
- [`frontend/src/auth/constants.ts`](../../../frontend/src/auth/constants.ts) — add `paths.instagram` and `paths.instagramCallback`.
- [`frontend/src/components/layout/Sidebar.tsx`](../../../frontend/src/components/layout/Sidebar.tsx) — add "Instagram" nav item.
- [`frontend/src/App.tsx`](../../../frontend/src/App.tsx) — register `/instagram` (protected) and `/instagram/callback` (public, like the existing meta-ads OAuth callback).

**Created (new files):**
- `backend/src/Repositories/InstagramAccountRepository.js`
- `backend/src/services/InstagramApiService.js`
- `backend/tests/services/InstagramApiService.test.js`
- `backend/tests/services/InstagramOAuthService.test.js`
- `backend/tests/repositories/InstagramAccountRepository.test.js`
- `backend/drizzle/<next-numbered>.sql` (drizzle-kit generates this; we run the script and commit the file)
- `frontend/src/lib/api/instagram.ts`
- `frontend/src/pages/InstagramPage.tsx`
- `frontend/src/pages/InstagramCallbackPage.tsx`

**Touched indirectly (no edits, just reference):**
- [`backend/src/utils/encryption.js`](../../../backend/src/utils/encryption.js) — `encryptToken` / `decryptToken` already accept the optional label arg the dropped-in code passes.
- [`backend/src/lib/errors.js`](../../../backend/src/lib/errors.js) — `badRequest`, `unauthorized`, `notFound` factories.
- [`backend/src/Repositories/MetaAdAccountRepository.js`](../../../backend/src/Repositories/MetaAdAccountRepository.js) — repository pattern reference.

---

## Conventions used by every task

- All backend commands run from `backend/`. Frontend commands run from `frontend/`.
- `npm run test` runs vitest one-shot.
- `npm run lint` runs eslint.
- TDD: write the failing test, run to confirm it fails with the expected error, implement, run to confirm it passes, commit.
- The user's working agreement is "don't auto-commit." When executed in a real session, the engineer pauses for explicit approval before each commit step.
- Use `vi.mock('axios')` for the Meta Graph calls; never hit the network in tests.
- Repository tests stub the `db` argument with chained `vi.fn()` mocks (the same approach used in the existing `PublishingService.test.js` `vi.mock('../../src/db/index.js', ...)`).
- Frontend doesn't have a test runner wired today — frontend tasks verify by `npm run dev` + manual smoke (the plan calls this out explicitly per task).

---

## Task 1: Schema additions and migration

**Files:**
- Modify: `backend/src/db/schema.js`
- Generated: `backend/drizzle/<next>.sql` (drizzle-kit output)

- [ ] **Step 1: Add `instagramAccounts` table**

In `backend/src/db/schema.js`, after the existing `metaAdAccounts` block (around line 103, end of that table's definition), add:

```js
// --- Instagram Business accounts (one per Meta IG Business account, per org) ---
// Connected via Instagram Business Login (NOT the Ads OAuth flow). Each row
// holds a long-lived IG token; one IG account belongs to exactly one org but
// can be linked to many channels via channel_instagram_accounts.

export const instagramAccounts = pgTable(
  'instagram_accounts',
  {
    id: id(),
    organization_id: orgId(),
    user_id: varchar('user_id', { length: 36 }), // who first connected; nullable for audit
    ig_business_id: varchar('ig_business_id', { length: 64 }).notNull(),
    ig_page_id: varchar('ig_page_id', { length: 64 }),
    ig_username: varchar('ig_username', { length: 255 }),
    ig_name: varchar('ig_name', { length: 255 }),
    ig_profile_picture_url: text('ig_profile_picture_url'),
    account_type: varchar('account_type', { length: 32 }), // BUSINESS | CREATOR
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
```

- [ ] **Step 2: Add `channelInstagramAccounts` join table**

Immediately after the `instagramAccounts` block, add:

```js
// --- Channel ↔ Instagram account links (many-to-many) ---
// One channel can fan out posts to multiple IG accounts; one IG account can
// be linked to multiple channels. Cascade deletion is enforced in the
// repository layer (this codebase doesn't declare FK constraints in drizzle).

export const channelInstagramAccounts = pgTable(
  'channel_instagram_accounts',
  {
    channel_id: varchar('channel_id', { length: 36 }).notNull(),
    instagram_account_id: varchar('instagram_account_id', { length: 36 }).notNull(),
    organization_id: orgId(),
    created_at: ts('created_at'),
  },
  (t) => ({
    pk: uniqueIndex('channel_ig_accounts_pk').on(t.channel_id, t.instagram_account_id),
    channel_idx: index('channel_ig_accounts_channel_idx').on(t.channel_id),
    ig_idx: index('channel_ig_accounts_ig_idx').on(t.instagram_account_id),
    org_idx: index('channel_ig_accounts_org_idx').on(t.organization_id),
  }),
);
```

- [ ] **Step 3: Add `published_targets` to `creativeBundles`**

In the existing `creativeBundles` table (around line 410), add a new column right after `render_job_id`:

```js
    render_job_id: varchar('render_job_id', { length: 128 }),
    // Per-account fan-out result for IG cross-posting:
    // [{ instagram_account_id, ig_username, ig_business_id, media_id, error, published_at }]
    published_targets: jsonb('published_targets').default([]),
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`
Expected: drizzle-kit emits a new SQL file under `backend/drizzle/` (e.g. `0001_xxx.sql`). Open it and verify it contains:
- `CREATE TABLE "instagram_accounts" ...` with all columns
- `CREATE TABLE "channel_instagram_accounts" ...` with the composite unique index
- `ALTER TABLE "creative_bundles" ADD COLUMN "published_targets" jsonb DEFAULT '[]'::jsonb`
- All `CREATE INDEX` statements

If anything is missing, the schema edit is wrong — fix it and regenerate.

- [ ] **Step 5: Apply the migration to the local DB**

Run: `npm run db:push`
Expected: drizzle-kit applies the changes against the configured Postgres. If push fails because a table already exists (e.g. a half-applied earlier attempt), drop it manually and retry.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.js backend/drizzle/
git commit -m "feat(db): instagram_accounts, channel_instagram_accounts, creative_bundles.published_targets"
```

---

## Task 2: Env vars and config additions

**Files:**
- Modify: `backend/src/config/env.js`
- Modify: `backend/src/config/index.js`
- Modify: `backend/.env`

- [ ] **Step 1: Add env validators**

Open `backend/src/config/env.js` and add the following properties to the env schema (alongside the existing `META_*` and `FACEBOOK_*` blocks):

```js
INSTAGRAM_APP_ID: z.string().optional(),
INSTAGRAM_APP_SECRET: z.string().optional(),
INSTAGRAM_REDIRECT_URI: z.string().optional(),
INSTAGRAM_FORCE_REAUTH: z.string().optional().default('false'),
INSTAGRAM_OAUTH_SCOPES: z
  .string()
  .optional()
  .default('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'),
```

These are `.optional()` so the server still boots in environments without IG configured (the OAuth-URL endpoint will then return a clear "Instagram credentials not configured" error).

If the file uses a different validation pattern (not zod), match the existing pattern — for instance, simple `process.env.INSTAGRAM_APP_ID ?? null` defaults inside an exported `env` object. Don't restructure the file.

- [ ] **Step 2: Wire into the `config` shape**

Open `backend/src/config/index.js`. Add to the exported `config` object:

```js
  instagram: {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    scopes: env.INSTAGRAM_OAUTH_SCOPES,
    forceReauth: env.INSTAGRAM_FORCE_REAUTH === 'true',
  },
  redirectUris: {
    metaAds: env.META_ADS_REDIRECT_URI,
    facebook: env.FACEBOOK_REDIRECT_URI,
    instagram: env.INSTAGRAM_REDIRECT_URI,
  },
```

(Replace the existing `redirectUris` block — preserve its existing keys, add `instagram`.)

- [ ] **Step 3: Add placeholder values to `.env`**

Append to `backend/.env`:

```
# --- Instagram Business Login (separate from Ads OAuth) ---
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=
INSTAGRAM_FORCE_REAUTH=false
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
```

(The user fills the App ID/Secret manually from their Meta App's Basic Display / Business Login settings.)

- [ ] **Step 4: Boot the server to confirm env loads cleanly**

Run: `PORT=4099 node src/server.js`
Expected: server logs "Server listening at http://127.0.0.1:4099" with no env-validation errors. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/env.js backend/src/config/index.js backend/.env
git commit -m "feat(config): add Instagram OAuth env vars and config block"
```

---

## Task 3: `InstagramApiService` — Meta Graph wrapper

**Files:**
- Create: `backend/src/services/InstagramApiService.js`
- Create: `backend/tests/services/InstagramApiService.test.js`

This service is a thin axios wrapper around the Meta Graph endpoints the OAuth and account-management flows need. Keeping it isolated means the OAuth service can be unit-tested without mocking the Graph API in 5 different places.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/services/InstagramApiService.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { InstagramApiService } from '../../src/services/InstagramApiService.js';

vi.mock('axios');

describe('InstagramApiService', () => {
  let svc;
  beforeEach(() => {
    svc = new InstagramApiService({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  });

  it('exchangeForLongLivedToken hits ig_exchange_token', async () => {
    axios.get.mockResolvedValueOnce({ data: { access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 } });
    const out = await svc.exchangeForLongLivedToken('SHORT');
    const url = axios.get.mock.calls[0][0];
    const params = axios.get.mock.calls[0][1].params;
    expect(url).toMatch(/graph\.instagram\.com.*access_token/);
    expect(params).toMatchObject({
      grant_type: 'ig_exchange_token',
      access_token: 'SHORT',
    });
    expect(out).toEqual({ access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 });
  });

  it('refreshLongLivedToken hits ig_refresh_token', async () => {
    axios.get.mockResolvedValueOnce({ data: { access_token: 'NEWLONG', token_type: 'bearer', expires_in: 5184000 } });
    const out = await svc.refreshLongLivedToken('OLD');
    const params = axios.get.mock.calls[0][1].params;
    expect(params).toMatchObject({
      grant_type: 'ig_refresh_token',
      access_token: 'OLD',
    });
    expect(out.access_token).toBe('NEWLONG');
  });

  it('getProfile returns profile fields', async () => {
    axios.get.mockResolvedValueOnce({
      data: { id: 'IGBIZ1', username: 'acme', name: 'Acme', followers_count: 42, account_type: 'BUSINESS' },
    });
    const out = await svc.getProfile('IGBIZ1', 'TOK');
    const url = axios.get.mock.calls[0][0];
    const params = axios.get.mock.calls[0][1].params;
    expect(url).toMatch(/IGBIZ1$/);
    expect(params.fields).toContain('username');
    expect(params.access_token).toBe('TOK');
    expect(out.username).toBe('acme');
  });

  it('getMedia paginates with limit and after', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'M1', caption: 'hi', media_type: 'IMAGE', permalink: 'https://x' }],
        paging: { cursors: { before: 'B', after: 'A' }, next: 'https://next' },
      },
    });
    const out = await svc.getMedia('IGBIZ1', 'TOK', { limit: 10, after: 'PREV' });
    const params = axios.get.mock.calls[0][1].params;
    expect(params.limit).toBe(10);
    expect(params.after).toBe('PREV');
    expect(out.data).toHaveLength(1);
    expect(out.paging.next).toBe('https://next');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/services/InstagramApiService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/InstagramApiService.js'`.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/InstagramApiService.js`:

```js
import axios from 'axios';
import { config } from '../config/index.js';

const GRAPH_BASE = 'https://graph.instagram.com';
const GRAPH_VERSION = `v${(config.meta.apiVersion || 'v21.0').replace(/^v/, '')}`;
const TIMEOUT_MS = 15_000;

export class InstagramApiService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async exchangeForLongLivedToken(shortLivedToken) {
    const { data } = await axios.get(`${GRAPH_BASE}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data; // { access_token, token_type, expires_in }
  }

  async refreshLongLivedToken(longLivedToken) {
    const { data } = await axios.get(`${GRAPH_BASE}/refresh_access_token`, {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: longLivedToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  async getProfile(igBusinessId, accessToken) {
    const { data } = await axios.get(`${GRAPH_BASE}/${GRAPH_VERSION}/${igBusinessId}`, {
      params: {
        fields:
          'id,username,name,profile_picture_url,account_type,followers_count,follows_count,media_count,biography,website',
        access_token: accessToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data;
  }

  async getPageId(igBusinessId, accessToken) {
    // Resolve the connected Facebook Page id. This is best-effort —
    // callers fall back to igBusinessId when this fails.
    const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${igBusinessId}`, {
      params: {
        fields: 'connected_facebook_page{id}',
        access_token: accessToken,
      },
      timeout: TIMEOUT_MS,
    });
    return data?.connected_facebook_page?.id ?? null;
  }

  async getMedia(igBusinessId, accessToken, { limit = 25, after } = {}) {
    const params = {
      fields: 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,media_product_type',
      limit,
      access_token: accessToken,
    };
    if (after) params.after = after;
    const { data } = await axios.get(`${GRAPH_BASE}/${GRAPH_VERSION}/${igBusinessId}/media`, {
      params,
      timeout: TIMEOUT_MS,
    });
    return data; // { data: [...], paging: { cursors, next, previous } }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/services/InstagramApiService.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/InstagramApiService.js backend/tests/services/InstagramApiService.test.js
git commit -m "feat(instagram): InstagramApiService — Meta Graph wrapper for OAuth + media"
```

---

## Task 4: `InstagramAccountRepository`

**Files:**
- Create: `backend/src/Repositories/InstagramAccountRepository.js`
- Create: `backend/tests/repositories/InstagramAccountRepository.test.js`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/repositories/InstagramAccountRepository.test.js`. The test stubs the `db` argument with chained mocks (matches the project pattern):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramAccountRepository } from '../../src/Repositories/InstagramAccountRepository.js';

function makeChainableDbStub() {
  // `select`, `update`, `delete`, `insert` all return a chain that resolves
  // with whatever `_resolved` is set to. Each test mutates `_resolved` before
  // running the call under test.
  const chain = {
    _resolved: undefined,
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(function (...args) {
      // Last `where` in a query resolves the promise. We do the resolution
      // lazily by making `where` return a thenable when needed.
      return Object.assign(this, {
        then: (onF) => Promise.resolve(this._resolved).then(onF),
      });
    }),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe('InstagramAccountRepository', () => {
  let db, repo;
  beforeEach(() => {
    db = makeChainableDbStub();
    repo = new InstagramAccountRepository(db);
  });

  it('create inserts a row and returns the freshly-created record', async () => {
    db._resolved = [{ id: 'IG1', ig_username: 'acme' }];
    const out = await repo.create({
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      ig_username: 'acme',
      access_token_encrypted: 'enc',
    });
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      ig_business_id: 'IGBIZ1',
      ig_username: 'acme',
    }));
    expect(out).toEqual({ id: 'IG1', ig_username: 'acme' });
  });

  it('findByBusinessId returns null when no row found', async () => {
    db._resolved = [];
    const out = await repo.findByBusinessId('org1', 'IGBIZ_MISSING');
    expect(out).toBeNull();
  });

  it('linkChannel inserts a join row', async () => {
    await repo.linkChannel({ organization_id: 'org1', channel_id: 'ch1', instagram_account_id: 'IG1' });
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'ch1',
      instagram_account_id: 'IG1',
      organization_id: 'org1',
    }));
  });

  it('findActiveAccountsForChannel filters by is_active', async () => {
    db._resolved = [{ id: 'IG1', ig_business_id: 'IGBIZ1', is_active: true }];
    const out = await repo.findActiveAccountsForChannel('ch1');
    expect(out).toHaveLength(1);
    expect(out[0].ig_business_id).toBe('IGBIZ1');
  });
});
```

If the chained-mock approach gives you trouble, the existing `tests/services/PublishingService.test.js` shows a working pattern with a global `vi.mock('../../src/db/index.js', ...)` plus per-test re-stubbing. Either pattern is fine — pick whichever lands first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/repositories/InstagramAccountRepository.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

Create `backend/src/Repositories/InstagramAccountRepository.js`:

```js
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { instagramAccounts, channelInstagramAccounts } from '../db/schema.js';

export class InstagramAccountRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    const id = data.id ?? uuidv4();
    const now = new Date();
    const row = {
      id,
      created_at: now,
      updated_at: now,
      is_active: true,
      ...data,
    };
    await this.db.insert(instagramAccounts).values(row);
    return this.findById(id);
  }

  async findById(id) {
    const [row] = await this.db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.id, id))
      .limit(1);
    return row || null;
  }

  async findByBusinessId(organizationId, igBusinessId) {
    const [row] = await this.db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.organization_id, organizationId),
          eq(instagramAccounts.ig_business_id, igBusinessId),
        ),
      )
      .limit(1);
    return row || null;
  }

  async findByOrganization(organizationId) {
    return this.db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.organization_id, organizationId));
  }

  async update(id, patch) {
    await this.db
      .update(instagramAccounts)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(instagramAccounts.id, id));
    return this.findById(id);
  }

  async hardDelete(id) {
    // Cascade: remove join rows first, then the account.
    await this.db
      .delete(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.instagram_account_id, id));
    await this.db
      .delete(instagramAccounts)
      .where(eq(instagramAccounts.id, id));
  }

  async linkChannel({ organization_id, channel_id, instagram_account_id }) {
    await this.db.insert(channelInstagramAccounts).values({
      channel_id,
      instagram_account_id,
      organization_id,
      created_at: new Date(),
    });
  }

  async unlinkChannel({ channel_id, instagram_account_id }) {
    await this.db
      .delete(channelInstagramAccounts)
      .where(
        and(
          eq(channelInstagramAccounts.channel_id, channel_id),
          eq(channelInstagramAccounts.instagram_account_id, instagram_account_id),
        ),
      );
  }

  async findChannelsForAccount(instagramAccountId) {
    return this.db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.instagram_account_id, instagramAccountId));
  }

  async findAccountsForChannel(channelId) {
    // Inner join: rows from instagram_accounts whose id appears in any
    // channel_instagram_accounts row for `channelId`.
    const links = await this.db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.channel_id, channelId));
    if (links.length === 0) return [];
    const ids = links.map((l) => l.instagram_account_id);
    return this.db
      .select()
      .from(instagramAccounts)
      .where(inArray(instagramAccounts.id, ids));
  }

  async findActiveAccountsForChannel(channelId) {
    const all = await this.findAccountsForChannel(channelId);
    return all.filter((a) => a.is_active);
  }

  async countActiveByOrganization(organizationId) {
    const rows = await this.db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.organization_id, organizationId),
          eq(instagramAccounts.is_active, true),
        ),
      );
    return rows.length;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/repositories/InstagramAccountRepository.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/Repositories/InstagramAccountRepository.js backend/tests/repositories/InstagramAccountRepository.test.js
git commit -m "feat(instagram): InstagramAccountRepository with channel-link methods"
```

---

## Task 5: Adapt `InstagramOAuthService` (strip baggage, fix DI)

**Files:**
- Modify: `backend/src/services/InstagramOAuthServices.js`
- Create: `backend/tests/services/InstagramOAuthService.test.js`

The existing file imports from `'../utils/encryption.js'` (correct) and `'../config/index.js'` (correct), so the import paths are fine. The DI shape and method bodies are what changes.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/services/InstagramOAuthService.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramOAuthService } from '../../src/services/InstagramOAuthServices.js';

vi.mock('../../src/utils/encryption.js', () => ({
  encryptToken: vi.fn((t) => `enc(${t})`),
  decryptToken: vi.fn((t) => t.replace(/^enc\(/, '').replace(/\)$/, '')),
}));

const stubLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function makeRepo() {
  return {
    findByBusinessId: vi.fn(),
    findById: vi.fn(),
    findByOrganization: vi.fn(),
    create: vi.fn(async (row) => ({ id: 'NEW_ID', ...row })),
    update: vi.fn(async () => ({})),
    hardDelete: vi.fn(),
    countActiveByOrganization: vi.fn(),
    linkChannel: vi.fn(),
    unlinkChannel: vi.fn(),
    findActiveAccountsForChannel: vi.fn(),
  };
}

function makeApi() {
  return {
    exchangeForLongLivedToken: vi.fn(),
    refreshLongLivedToken: vi.fn(),
    getProfile: vi.fn(),
    getPageId: vi.fn(),
    getMedia: vi.fn(),
  };
}

describe('InstagramOAuthService.generateAuthUrl', () => {
  let svc;
  beforeEach(() => {
    process.env.INSTAGRAM_APP_ID = 'APPID';
    process.env.INSTAGRAM_APP_SECRET = 'SECRET';
    svc = new InstagramOAuthService({
      logger: stubLogger(),
      repository: makeRepo(),
      apiService: makeApi(),
    });
  });

  it('returns Instagram Business Login URL with required scopes', () => {
    const out = svc.generateAuthUrl({ origin: 'https://app.example.com' });
    expect(out.authUrl).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
    expect(out.authUrl).toContain('client_id=APPID');
    expect(out.authUrl).toContain(encodeURIComponent('https://app.example.com/instagram/callback'));
    expect(out.authUrl).toContain('instagram_business_basic');
    expect(out.state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('throws if INSTAGRAM_APP_ID missing', () => {
    delete process.env.INSTAGRAM_APP_ID;
    expect(() => svc.generateAuthUrl({ origin: 'https://x' })).toThrowError(/Instagram App ID/i);
  });
});

describe('InstagramOAuthService.connectAccount', () => {
  let svc, repo, api;
  beforeEach(() => {
    process.env.INSTAGRAM_APP_ID = 'APPID';
    process.env.INSTAGRAM_APP_SECRET = 'SECRET';
    repo = makeRepo();
    api = makeApi();
    svc = new InstagramOAuthService({ logger: stubLogger(), repository: repo, apiService: api });
  });

  it('creates a new account when no existing row matches', async () => {
    // Stub the short-lived exchange (uses fetch). Use vi.spyOn on globalThis.fetch.
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'SHORT', user_id: 'IGBIZ1' }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    api.exchangeForLongLivedToken.mockResolvedValue({ access_token: 'LONG', expires_in: 5184000 });
    api.getProfile.mockResolvedValue({
      id: 'IGBIZ1', username: 'acme', name: 'Acme', account_type: 'BUSINESS',
      followers_count: 10, follows_count: 1, media_count: 0,
    });
    api.getPageId.mockResolvedValue('PAGE1');
    repo.findByBusinessId.mockResolvedValue(null);

    const out = await svc.connectAccount(
      'CODE', 'https://app.example.com/instagram/callback',
      { organization_id: 'org1', userId: 'u1' },
      {},
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      ig_username: 'acme',
      ig_page_id: 'PAGE1',
      access_token_encrypted: 'enc(LONG)',
      is_active: true,
    }));
    expect(out.isNew).toBe(true);
    expect(out.username).toBe('acme');
  });

  it('updates the existing account on reconnect', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'SHORT', user_id: 'IGBIZ1' }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    api.exchangeForLongLivedToken.mockResolvedValue({ access_token: 'LONG2', expires_in: 5184000 });
    api.getProfile.mockResolvedValue({
      id: 'IGBIZ1', username: 'acme', name: 'Acme Updated', account_type: 'BUSINESS',
      followers_count: 11, follows_count: 1, media_count: 0,
    });
    api.getPageId.mockResolvedValue('PAGE1');
    repo.findByBusinessId.mockResolvedValue({ id: 'EXISTING_ID', ig_business_id: 'IGBIZ1' });

    const out = await svc.connectAccount(
      'CODE', 'https://app.example.com/instagram/callback',
      { organization_id: 'org1', userId: 'u1' }, {},
    );

    expect(repo.update).toHaveBeenCalledWith('EXISTING_ID', expect.objectContaining({
      access_token_encrypted: 'enc(LONG2)',
      ig_name: 'Acme Updated',
      followers_count: 11,
      is_active: true,
    }));
    expect(out.isNew).toBe(false);
  });
});

describe('InstagramOAuthService — channel links', () => {
  let svc, repo;
  beforeEach(() => {
    repo = makeRepo();
    svc = new InstagramOAuthService({ logger: stubLogger(), repository: repo, apiService: makeApi() });
  });

  it('linkChannel verifies same-org ownership before linking', async () => {
    repo.findById.mockResolvedValue({ id: 'IG1', organization_id: 'org1' });
    await svc.linkChannel('org1', 'IG1', 'ch1');
    expect(repo.linkChannel).toHaveBeenCalledWith({
      organization_id: 'org1',
      channel_id: 'ch1',
      instagram_account_id: 'IG1',
    });
  });

  it('linkChannel throws 403 when account belongs to a different org', async () => {
    repo.findById.mockResolvedValue({ id: 'IG1', organization_id: 'OTHER' });
    await expect(svc.linkChannel('org1', 'IG1', 'ch1')).rejects.toThrow();
    expect(repo.linkChannel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/services/InstagramOAuthService.test.js`
Expected: FAIL — most cases will throw because the existing service has the wrong constructor shape (`{ instagramRepository, instagramAPIService, ... }`) and references nonexistent methods.

- [ ] **Step 3: Replace the service body**

Open `backend/src/services/InstagramOAuthServices.js` and **replace its entire contents** with the adapted version below. The replacement keeps the OAuth-flow logic but: (a) takes `{ logger, repository, apiService }` instead of the dropped-in's 5-dependency constructor; (b) drops `assertCanConnectAccount`, `_probeCommentScope`, IGSID resolution, webhook subscription, cross-org guard against tables that don't exist; (c) adds `linkChannel` / `unlinkChannel` / `getMedia` / `getAccounts` / `getAccountDetails`.

```js
import crypto from 'crypto';
import { URL, URLSearchParams } from 'url';
import { encryptToken, decryptToken } from '../utils/encryption.js';
import { config } from '../config/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

export class InstagramOAuthService {
  constructor({ logger, repository, apiService }) {
    this.logger = logger;
    this.repository = repository;
    this.apiService = apiService;
  }

  // --- OAuth URL ---
  generateAuthUrl({ origin, referer, forwardedHost, forwardedProto = 'https' }) {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Instagram App ID or App Secret not configured in environment variables.');
    }

    let redirectUri = config.redirectUris.instagram;
    if (!redirectUri) {
      if (origin) {
        redirectUri = `${origin}/instagram/callback`;
      } else if (referer) {
        try {
          const u = new URL(referer);
          redirectUri = `${u.origin}/instagram/callback`;
        } catch {
          /* invalid referer */
        }
      } else if (forwardedHost) {
        redirectUri = `${forwardedProto}://${forwardedHost}/instagram/callback`;
      } else {
        redirectUri = 'http://localhost:3000/instagram/callback';
      }
    }

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = config.instagram.scopes;
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state,
    });
    if (config.instagram.forceReauth) params.append('force_reauth', 'true');

    return {
      authUrl: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
      state,
      redirectUri,
    };
  }

  // --- Connect (code → long-lived token → profile → upsert) ---
  async connectAccount(code, providedRedirectUri, user, requestHeaders = {}) {
    const organizationId = user?.organization_id;
    if (!organizationId) throw badRequest('User organization not found');
    const userId = user.userId || user.id || null;

    let redirectUri = providedRedirectUri;
    if (!redirectUri) {
      const fwHost = requestHeaders['x-forwarded-host'];
      const fwProto = requestHeaders['x-forwarded-proto'] || 'https';
      redirectUri = fwHost ? `${fwProto}://${fwHost}/instagram/callback` : config.redirectUris.instagram;
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) throw new Error('Instagram credentials invalid');

    // Step A: code → short-lived token (api.instagram.com is correct here per Meta docs)
    const formData = new URLSearchParams();
    formData.append('client_id', appId);
    formData.append('client_secret', appSecret);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', redirectUri);
    formData.append('code', code);
    let tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      throw new Error(err.error_message || 'Failed to exchange code for token');
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData?.access_token || !tokenData?.user_id) {
      throw new Error('Invalid token response from Instagram');
    }
    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    // Step B: short-lived → long-lived
    let longLivedData;
    try {
      const exchanged = await this.apiService.exchangeForLongLivedToken(shortLivedToken);
      longLivedData = { ...exchanged, user_id: igUserId };
    } catch (err) {
      this.logger.warn({ message: 'Long-lived exchange failed, using short-lived', err: err.message });
      longLivedData = { access_token: shortLivedToken, expires_in: 3600, user_id: igUserId };
    }

    // Step C: profile + page id
    let profile;
    let pageId;
    try {
      profile = await this.apiService.getProfile(igUserId, longLivedData.access_token);
    } catch (err) {
      this.logger.warn({ message: 'Profile fetch failed; using minimal profile', err: err.message });
      profile = {
        id: String(igUserId),
        username: `ig_user_${igUserId}`,
        name: 'Instagram User',
        account_type: 'BUSINESS',
        profile_picture_url: null,
        followers_count: 0, follows_count: 0, media_count: 0,
      };
    }
    try {
      pageId = await this.apiService.getPageId(profile.id, longLivedData.access_token);
    } catch {
      pageId = null;
    }

    const accessTokenEncrypted = encryptToken(longLivedData.access_token, 'instagram');
    const expiresAt = new Date(Date.now() + (longLivedData.expires_in ?? 3600) * 1000);

    const existing = await this.repository.findByBusinessId(organizationId, profile.id);
    if (existing) {
      await this.repository.update(existing.id, {
        access_token_encrypted: accessTokenEncrypted,
        token_expires_at: expiresAt,
        ig_business_id: profile.id,
        ig_page_id: pageId,
        ig_username: profile.username,
        ig_name: profile.name,
        ig_profile_picture_url: profile.profile_picture_url,
        account_type: profile.account_type,
        followers_count: profile.followers_count,
        follows_count: profile.follows_count,
        media_count: profile.media_count,
        is_active: true,
      });
      return { id: existing.id, username: profile.username, name: profile.name, isNew: false };
    }

    const created = await this.repository.create({
      organization_id: organizationId,
      user_id: userId,
      ig_business_id: profile.id,
      ig_page_id: pageId,
      ig_username: profile.username,
      ig_name: profile.name,
      ig_profile_picture_url: profile.profile_picture_url,
      account_type: profile.account_type,
      followers_count: profile.followers_count,
      follows_count: profile.follows_count,
      media_count: profile.media_count,
      access_token_encrypted: accessTokenEncrypted,
      token_expires_at: expiresAt,
      last_synced_at: new Date(),
      is_active: true,
    });

    return { id: created.id, username: profile.username, name: profile.name, isNew: true };
  }

  // --- Account list / detail / disconnect / refresh ---
  async getAccounts(organizationId) {
    const rows = await this.repository.findByOrganization(organizationId);
    return rows.map((r) => {
      const { access_token_encrypted: _hidden, ...safe } = r;
      return safe;
    });
  }

  async getAccountDetails(organizationId, accountId) {
    const row = await this.repository.findById(accountId);
    if (!row || row.organization_id !== organizationId) throw notFound('Account not found');
    const { access_token_encrypted: _hidden, ...safe } = row;
    return safe;
  }

  async disconnectAccount(organizationId, accountId) {
    const row = await this.repository.findById(accountId);
    if (!row || row.organization_id !== organizationId) throw notFound('Account not found');
    await this.repository.hardDelete(accountId);
  }

  async refreshAccount(organizationId, accountId) {
    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) throw notFound('Account not found');

    const accessToken = decryptToken(account.access_token_encrypted, 'instagram');
    const fresh = await this.apiService.refreshLongLivedToken(accessToken);
    const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);

    let profileUpdate = {};
    try {
      const p = await this.apiService.getProfile(account.ig_business_id, fresh.access_token);
      profileUpdate = {
        ig_username: p.username || account.ig_username,
        ig_name: p.name || account.ig_name,
        ig_profile_picture_url: p.profile_picture_url ?? account.ig_profile_picture_url,
        account_type: p.account_type || account.account_type,
        followers_count: p.followers_count ?? account.followers_count,
        follows_count: p.follows_count ?? account.follows_count,
        media_count: p.media_count ?? account.media_count,
        last_synced_at: new Date(),
      };
    } catch (err) {
      this.logger.warn({ message: 'Profile fetch failed during refresh', err: err.message });
    }

    await this.repository.update(accountId, {
      access_token_encrypted: encryptToken(fresh.access_token, 'instagram'),
      token_expires_at: expiresAt,
      ...profileUpdate,
    });
    return { success: true };
  }

  async getMedia(organizationId, accountId, { limit = 25, after } = {}) {
    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) throw notFound('Account not found');
    const accessToken = decryptToken(account.access_token_encrypted, 'instagram');
    return this.apiService.getMedia(account.ig_business_id, accessToken, { limit, after });
  }

  // --- Channel links ---
  async linkChannel(organizationId, accountId, channelId) {
    const account = await this.repository.findById(accountId);
    if (!account) throw notFound('Account not found');
    if (account.organization_id !== organizationId) throw forbidden('Cross-org link not allowed');
    // (Optional channel-side org check can be added here when ChannelService is wired in.)
    await this.repository.linkChannel({
      organization_id: organizationId,
      channel_id: channelId,
      instagram_account_id: accountId,
    });
  }

  async unlinkChannel(organizationId, accountId, channelId) {
    const account = await this.repository.findById(accountId);
    if (!account) throw notFound('Account not found');
    if (account.organization_id !== organizationId) throw forbidden('Cross-org unlink not allowed');
    await this.repository.unlinkChannel({
      channel_id: channelId,
      instagram_account_id: accountId,
    });
  }
}
```

- [ ] **Step 4: Add a `forbidden` helper to lib/errors.js if it doesn't exist**

Open `backend/src/lib/errors.js` and verify `forbidden` is exported. If not, add:

```js
export const forbidden = (message = 'Forbidden') =>
  new AppError(message, { statusCode: 403, code: 'FORBIDDEN' });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/services/InstagramOAuthService.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/InstagramOAuthServices.js backend/src/lib/errors.js backend/tests/services/InstagramOAuthService.test.js
git commit -m "feat(instagram): adapt InstagramOAuthService — strip baggage, add channel links and media"
```

---

## Task 6: Adapt `InstagramOAuthController`

**Files:**
- Modify: `backend/src/Controllers/InstagramOAuthController.js`

The dropped-in controller reads `request.user.userId || request.user.id`. Growthos's auth plugin populates `request.user.organization_id` from the JWT claim. Also we drop the entitlement-error branches (no `INSTAGRAM_INTEGRATION_DISABLED` / `INSTAGRAM_ACCOUNT_LIMIT_REACHED`) and add three new methods.

- [ ] **Step 1: Replace the controller**

Open `backend/src/Controllers/InstagramOAuthController.js` and **replace the entire file** with:

```js
export class InstagramOAuthController {
  constructor(instagramOAuthService, logger) {
    this.service = instagramOAuthService;
    this.logger = logger;
  }

  async getAuthUrl(request, reply) {
    try {
      const result = this.service.generateAuthUrl({
        origin: request.query?.origin,
        referer: request.headers['referer'],
        forwardedHost: request.headers['x-forwarded-host'],
        forwardedProto: request.headers['x-forwarded-proto'],
      });
      return { success: true, data: result };
    } catch (err) {
      this.logger.error({ message: 'Error generating Instagram OAuth URL', err: err.message });
      return reply.status(500).send({ success: false, error: 'Failed to generate authorization URL' });
    }
  }

  async exchangeToken(request, reply) {
    try {
      const { code, redirect_uri } = request.body;
      const result = await this.service.connectAccount(code, redirect_uri, request.user, request.headers);
      return { success: true, data: result };
    } catch (err) {
      this.logger.error({
        message: 'Error exchanging Instagram OAuth token',
        err: err.message,
        metaErr: err.response?.data || null,
      });
      const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
      return reply.status(status).send({
        success: false,
        error: err.message || 'Failed to connect Instagram account',
        code: err.code,
      });
    }
  }

  async getAccounts(request, reply) {
    try {
      const accounts = await this.service.getAccounts(request.user.organization_id);
      return { success: true, data: accounts };
    } catch (err) {
      this.logger.error({ message: 'Error fetching Instagram accounts', err: err.message });
      return reply.status(500).send({ success: false, error: 'Failed to fetch accounts' });
    }
  }

  async getAccount(request, reply) {
    try {
      const out = await this.service.getAccountDetails(request.user.organization_id, request.params.accountId);
      return { success: true, data: out };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async disconnectAccount(request, reply) {
    try {
      await this.service.disconnectAccount(request.user.organization_id, request.params.accountId);
      return { success: true, message: 'Instagram account disconnected' };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async refreshAccount(request, reply) {
    try {
      await this.service.refreshAccount(request.user.organization_id, request.params.accountId);
      return { success: true, message: 'Account refreshed' };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async getMedia(request, reply) {
    try {
      const { limit, after } = request.query || {};
      const out = await this.service.getMedia(request.user.organization_id, request.params.accountId, {
        limit: limit ? parseInt(limit, 10) : undefined,
        after,
      });
      return { success: true, data: out };
    } catch (err) {
      const status = err.statusCode === 404 ? 404 : 500;
      this.logger.error({ message: 'Error fetching Instagram media', err: err.message });
      return reply.status(status).send({ success: false, error: err.message || 'Failed to fetch media' });
    }
  }

  async linkChannel(request, reply) {
    try {
      const { channel_id } = request.body;
      if (!channel_id) {
        return reply.status(400).send({ success: false, error: 'channel_id is required' });
      }
      await this.service.linkChannel(
        request.user.organization_id,
        request.params.accountId,
        channel_id,
      );
      return { success: true };
    } catch (err) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }

  async unlinkChannel(request, reply) {
    try {
      await this.service.unlinkChannel(
        request.user.organization_id,
        request.params.accountId,
        request.params.channelId,
      );
      return { success: true };
    } catch (err) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ success: false, error: err.message });
    }
  }
}
```

- [ ] **Step 2: No new tests required**

The controller is a thin shim over the service; the service tests cover the logic. Spot-check by booting later (Task 8 step 4).

- [ ] **Step 3: Commit**

```bash
git add backend/src/Controllers/InstagramOAuthController.js
git commit -m "feat(instagram): adapt InstagramOAuthController — fix user shape, add link/unlink/media"
```

---

## Task 7: Adapt `InstagramOAuthRoutes`

**Files:**
- Modify: `backend/src/Routes/InstagramOAuthRoutes.js`

The dropped-in file imports `'../../../plugins/auth.js'` — wrong relative path (would resolve outside `backend/`). Use the `app.requireAuth` decorator (matches `Routes/AdRoutes.js` pattern).

- [ ] **Step 1: Replace the routes file**

Open `backend/src/Routes/InstagramOAuthRoutes.js` and **replace the entire file** with:

```js
/**
 * Instagram OAuth and account-management routes.
 *
 * Mount under /api/v1/instagram (set in modules/index.js).
 *
 * The /oauth/url endpoint is authenticated — only signed-in users can start
 * an Instagram connect. The /oauth/exchange endpoint is also authenticated
 * because the JWT carries the org_id we attach the new account to.
 */
export async function instagramOAuthRoutes(fastify) {
  const controller = fastify.instagramOAuthController;
  const auth = fastify.requireAuth;

  fastify.get('/oauth/url', { preHandler: auth }, (req, reply) => controller.getAuthUrl(req, reply));

  fastify.post(
    '/oauth/exchange',
    {
      preHandler: auth,
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string' },
            redirect_uri: { type: 'string' },
          },
        },
      },
    },
    (req, reply) => controller.exchangeToken(req, reply),
  );

  fastify.get('/accounts', { preHandler: auth }, (req, reply) => controller.getAccounts(req, reply));
  fastify.get('/accounts/:accountId', { preHandler: auth }, (req, reply) => controller.getAccount(req, reply));
  fastify.delete('/accounts/:accountId', { preHandler: auth }, (req, reply) => controller.disconnectAccount(req, reply));
  fastify.post('/accounts/:accountId/refresh', { preHandler: auth }, (req, reply) => controller.refreshAccount(req, reply));
  fastify.get('/accounts/:accountId/media', { preHandler: auth }, (req, reply) => controller.getMedia(req, reply));

  fastify.post(
    '/accounts/:accountId/links',
    {
      preHandler: auth,
      schema: {
        body: {
          type: 'object',
          required: ['channel_id'],
          properties: { channel_id: { type: 'string' } },
        },
      },
    },
    (req, reply) => controller.linkChannel(req, reply),
  );

  fastify.delete(
    '/accounts/:accountId/links/:channelId',
    { preHandler: auth },
    (req, reply) => controller.unlinkChannel(req, reply),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/Routes/InstagramOAuthRoutes.js
git commit -m "feat(instagram): adapt InstagramOAuthRoutes — fix auth import, add link/unlink/media"
```

---

## Task 8: DI wiring + module registration

**Files:**
- Modify: `backend/src/plugins/di.js`
- Modify: `backend/src/modules/index.js`

- [ ] **Step 1: Wire DI**

Open `backend/src/plugins/di.js`. Add imports near the top (alongside existing `import { AdsController } ...`):

```js
import { InstagramAccountRepository } from '../Repositories/InstagramAccountRepository.js';
import { InstagramApiService } from '../services/InstagramApiService.js';
import { InstagramOAuthService } from '../services/InstagramOAuthServices.js';
import { InstagramOAuthController } from '../Controllers/InstagramOAuthController.js';
```

Inside the `plugin(app)` function, after the existing instantiations, add:

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

- [ ] **Step 2: Register the route module**

Open `backend/src/modules/index.js`. Add the import at the top (alongside `import { adsRoutes } ...`):

```js
import { instagramOAuthRoutes } from '../Routes/InstagramOAuthRoutes.js';
```

Inside `registerModules`, **inside** the `/api/v1` group (where the other modules register), add:

```js
      await api.register(instagramOAuthRoutes, { prefix: '/instagram' });
```

Place it next to `await api.register(adsRoutes);` to keep the IG and Ads modules visually grouped.

- [ ] **Step 3: Boot the server**

Run: `PORT=4099 node src/server.js`
Expected: server boots cleanly. The Fastify route table (logged at startup if log level is `info`) includes paths like `/api/v1/instagram/oauth/url`, `/api/v1/instagram/accounts`, etc.

- [ ] **Step 4: Smoke-curl the unauthenticated case**

In another terminal:

```bash
curl -i http://localhost:4099/api/v1/instagram/accounts
```

Expected: HTTP `401 Unauthorized` (the `requireAuth` decorator rejects the request — proves the route is wired AND auth-protected).

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add backend/src/plugins/di.js backend/src/modules/index.js
git commit -m "feat(instagram): wire DI and register routes under /api/v1/instagram"
```

---

## Task 9: `PublishingService.publishBundle` fan-out

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

The legacy single-account path stays as a fallback. When a channel has at least one row in `channel_instagram_accounts`, fan out to every active linked account. Per-account results land in `creative_bundles.published_targets` (jsonb). The first successful `media_id` lands in the existing `render_job_id` for backward-compat.

- [ ] **Step 1: Write failing tests**

Open `backend/tests/services/PublishingService.test.js`. **Add** the following describe block at the bottom of the file (don't replace existing tests):

```js
import { instagramAccounts as igAccts, channelInstagramAccounts as cha } from '../../src/db/schema.js';
import { decryptToken } from '../../src/utils/encryption.js';

vi.mock('../../src/utils/encryption.js', () => ({
  encryptToken: vi.fn((t) => `enc(${t})`),
  decryptToken: vi.fn((t) => t.replace(/^enc\(/, '').replace(/\)$/, '')),
}));

describe('PublishingService.publishBundle — fan-out', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER_FALLBACK' };
  const baseBundle = {
    id: 'b1', video_url: 'https://x/v.mp4', thumbnail_url: 'https://x/t.jpg',
    caption: 'hi', hashtags: ['a'],
  };

  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('fans out to all linked IG accounts when join rows exist', async () => {
    // Stub _findLinkedInstagramAccounts to return two accounts.
    vi.spyOn(svc, '_findLinkedInstagramAccounts').mockResolvedValue([
      {
        id: 'IGREC1', ig_business_id: 'IGBIZ_A', ig_username: 'acme_a',
        access_token_encrypted: 'enc(TOK_A)', is_active: true,
      },
      {
        id: 'IGREC2', ig_business_id: 'IGBIZ_B', ig_username: 'acme_b',
        access_token_encrypted: 'enc(TOK_B)', is_active: true,
      },
    ]);

    // 4 axios.post calls total: container A, publish A, container B, publish B
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON_A' } })
      .mockResolvedValueOnce({ data: { id: 'MED_A' } })
      .mockResolvedValueOnce({ data: { id: 'CON_B' } })
      .mockResolvedValueOnce({ data: { id: 'MED_B' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const out = await svc.publishBundle(channel, baseBundle);
    expect(out.published).toBe(true);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({ ig_username: 'acme_a', media_id: 'MED_A' });
    expect(out.results[1]).toMatchObject({ ig_username: 'acme_b', media_id: 'MED_B' });

    // First container POST hit IGBIZ_A's path with the IG-account-row's token
    expect(axios.post.mock.calls[0][0]).toMatch(/IGBIZ_A\/media$/);
    expect(axios.post.mock.calls[0][2].params.access_token).toBe('TOK_A');
    expect(axios.post.mock.calls[2][0]).toMatch(/IGBIZ_B\/media$/);
    expect(axios.post.mock.calls[2][2].params.access_token).toBe('TOK_B');
  });

  it('falls back to channel.instagram_account_id when no linked IG accounts', async () => {
    vi.spyOn(svc, '_findLinkedInstagramAccounts').mockResolvedValue([]);

    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const out = await svc.publishBundle(channel, baseBundle);
    expect(out.published).toBe(true);
    expect(out.mediaId).toBe('MED');
    expect(axios.post.mock.calls[0][0]).toMatch(/IG_USER_FALLBACK\/media$/);
  });

  it('returns partial success when one of two linked accounts fails', async () => {
    vi.spyOn(svc, '_findLinkedInstagramAccounts').mockResolvedValue([
      { id: 'IGREC1', ig_business_id: 'IGBIZ_A', ig_username: 'a',
        access_token_encrypted: 'enc(TOK_A)', is_active: true },
      { id: 'IGREC2', ig_business_id: 'IGBIZ_B', ig_username: 'b',
        access_token_encrypted: 'enc(TOK_B)', is_active: true },
    ]);
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON_A' } })
      .mockResolvedValueOnce({ data: { id: 'MED_A' } })
      .mockRejectedValueOnce(new Error('Meta API failure'));
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const out = await svc.publishBundle(channel, baseBundle);
    expect(out.published).toBe(true);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].media_id).toBe('MED_A');
    expect(out.results[1].error).toMatch(/Meta API failure/);
  });

  it('rolls back to ready when ALL linked accounts fail', async () => {
    vi.spyOn(svc, '_findLinkedInstagramAccounts').mockResolvedValue([
      { id: 'IGREC1', ig_business_id: 'IGBIZ_A', ig_username: 'a',
        access_token_encrypted: 'enc(TOK_A)', is_active: true },
    ]);
    axios.post.mockRejectedValueOnce(new Error('Meta down'));
    await expect(svc.publishBundle(channel, baseBundle)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: 4 new failures — `_findLinkedInstagramAccounts` doesn't exist yet, results shape is wrong.

- [ ] **Step 3: Implement the fan-out**

Open `backend/src/services/PublishingService.js` and add the `_findLinkedInstagramAccounts` helper inside the class, near the other `_` helpers:

```js
  async _findLinkedInstagramAccounts(channelId) {
    const links = await db
      .select()
      .from(channelInstagramAccounts)
      .where(eq(channelInstagramAccounts.channel_id, channelId));
    if (links.length === 0) return [];
    const ids = links.map((l) => l.instagram_account_id);
    const rows = await db
      .select()
      .from(instagramAccounts)
      .where(inArray(instagramAccounts.id, ids));
    return rows.filter((r) => r.is_active);
  }
```

Add the new imports at the top of the file:

```js
import { eq, inArray } from 'drizzle-orm';
import { creativeBundles, metaAdAccounts, instagramAccounts, channelInstagramAccounts } from '../db/schema.js';
import { decryptToken } from '../utils/encryption.js';
```

(`eq` is already imported; just append `inArray`. The existing schema import already covers `creativeBundles, metaAdAccounts` — append the two new tables.)

Now replace the body of `publishBundle` with the fan-out version:

```js
  async publishBundle(channel, bundle) {
    if (!channel.instagram_account_id && (await this._findLinkedInstagramAccounts(channel.id)).length === 0) {
      console.warn(`[Publishing] Channel ${channel.id} has no IG account configured — skipping`);
      return { published: false, reason: 'No instagram_account_id on channel and no linked accounts' };
    }
    if (!bundle.video_url) {
      return { published: false, reason: 'Bundle has no video_url' };
    }

    const linkedAccounts = await this._findLinkedInstagramAccounts(channel.id);

    // Legacy fallback path (no linked IG accounts) — preserves prior behavior.
    if (linkedAccounts.length === 0) {
      const probeToken = await this._getPageToken(channel.organization_id);
      if (!probeToken) {
        console.warn(`[Publishing] No Meta access token for org ${channel.organization_id}`);
        return { published: false, reason: 'No Meta access token' };
      }

      await db
        .update(creativeBundles)
        .set({ status: 'publishing', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));

      try {
        const { mediaId } = await this.publishMedia(channel, {
          type: 'reels',
          video_url: bundle.video_url,
          caption: bundle.caption,
          hashtags: bundle.hashtags ?? [],
          cover_url: bundle.thumbnail_url ?? undefined,
        });

        await db
          .update(creativeBundles)
          .set({
            status: 'published',
            updated_at: new Date(),
            render_job_id: mediaId,
            published_targets: [{
              instagram_account_id: null,
              ig_username: null,
              ig_business_id: channel.instagram_account_id,
              media_id: mediaId,
              error: null,
              published_at: new Date().toISOString(),
            }],
          })
          .where(eq(creativeBundles.id, bundle.id));

        console.log(`[Publishing] Bundle ${bundle.id} published (legacy single-account) → ${mediaId}`);
        return { published: true, mediaId };
      } catch (err) {
        await db
          .update(creativeBundles)
          .set({ status: 'ready', updated_at: new Date() })
          .where(eq(creativeBundles.id, bundle.id));
        console.error(`[Publishing] Failed for bundle ${bundle.id}:`, err.message);
        throw err;
      }
    }

    // Fan-out path: one publish per linked IG account.
    await db
      .update(creativeBundles)
      .set({ status: 'publishing', updated_at: new Date() })
      .where(eq(creativeBundles.id, bundle.id));

    const results = [];
    for (const acct of linkedAccounts) {
      const token = decryptToken(acct.access_token_encrypted, 'instagram');
      const channelStub = {
        id: channel.id,
        organization_id: channel.organization_id,
        instagram_account_id: acct.ig_business_id,
      };
      try {
        // Bypass _getPageToken by stubbing the resolved token onto the
        // service for this single call. publishMedia normally calls
        // _getPageToken(organization_id); we pre-empt it.
        const original = this._getPageToken;
        this._getPageToken = async () => token;
        let mediaId;
        try {
          const out = await this.publishMedia(channelStub, {
            type: 'reels',
            video_url: bundle.video_url,
            caption: bundle.caption,
            hashtags: bundle.hashtags ?? [],
            cover_url: bundle.thumbnail_url ?? undefined,
          });
          mediaId = out.mediaId;
        } finally {
          this._getPageToken = original;
        }
        results.push({
          instagram_account_id: acct.id,
          ig_username: acct.ig_username,
          ig_business_id: acct.ig_business_id,
          media_id: mediaId,
          error: null,
          published_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[Publishing] Fan-out to ${acct.ig_username || acct.ig_business_id} failed:`, err.message);
        results.push({
          instagram_account_id: acct.id,
          ig_username: acct.ig_username,
          ig_business_id: acct.ig_business_id,
          media_id: null,
          error: err.message,
          published_at: new Date().toISOString(),
        });
      }
    }

    const successes = results.filter((r) => r.media_id);
    if (successes.length === 0) {
      await db
        .update(creativeBundles)
        .set({ status: 'ready', updated_at: new Date() })
        .where(eq(creativeBundles.id, bundle.id));
      const firstError = results.find((r) => r.error)?.error || 'All fan-out targets failed';
      throw new Error(firstError);
    }

    await db
      .update(creativeBundles)
      .set({
        status: 'published',
        updated_at: new Date(),
        render_job_id: successes[0].media_id,
        published_targets: results,
      })
      .where(eq(creativeBundles.id, bundle.id));

    console.log(`[Publishing] Bundle ${bundle.id} fanned out → ${successes.length}/${results.length} succeeded`);
    return { published: true, results, mediaId: successes[0].media_id };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: all tests PASS — including the existing tests from the prior multi-media implementation plus the 4 new fan-out tests.

If a pre-existing test breaks because the new `published_targets` setter changes the `db.update().set(...)` mock-call shape, update its assertion to `toMatchObject({ status: 'published' })` so it doesn't pin every field.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): fan out publishBundle to every linked IG account on the channel"
```

---

## Task 10: Frontend — paths, sidebar, route registration

**Files:**
- Modify: `frontend/src/auth/constants.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add paths**

Open `frontend/src/auth/constants.ts`. Inside the `paths` object, add:

```ts
  instagram: '/instagram',
  instagramCallback: '/instagram/callback',
```

- [ ] **Step 2: Add sidebar nav item**

Open `frontend/src/components/layout/Sidebar.tsx`. Add `PhotoCameraOutlined` to the `@mui/icons-material` import block (alphabetical after `PeopleOutlined`):

```tsx
  PhotoCameraOutlined,
```

Then update the `navItems` array — insert a new entry between "Creatives" and "Ads":

```tsx
const navItems = [
  { to: paths.dashboard, label: 'Dashboard', icon: DashboardOutlined },
  { to: paths.channels, label: 'Channels', icon: HubOutlined },
  { to: paths.trends, label: 'Trends', icon: TrendingUpOutlined },
  { to: paths.creatives, label: 'Creatives', icon: VideoLibraryOutlined },
  { to: paths.instagram, label: 'Instagram', icon: PhotoCameraOutlined },
  { to: paths.ads, label: 'Ads', icon: CampaignOutlined },
  { to: paths.crm, label: 'CRM', icon: PeopleOutlined },
  { to: paths.analytics, label: 'Analytics', icon: AnalyticsOutlined },
  { to: paths.genui, label: 'AI Assistant', icon: AutoAwesome },
]
```

- [ ] **Step 3: Wire the routes in App.tsx**

Open `frontend/src/App.tsx`. Add page imports at the top alongside the others:

```tsx
import { InstagramPage } from './pages/InstagramPage'
import { InstagramCallbackPage } from './pages/InstagramCallbackPage'
```

The `/instagram/callback` route must live OUTSIDE the `ProtectedRoute` group (Meta redirects with `?code=...&state=...` and the popup may not have a JWT depending on the flow). Add it next to the existing `oauth/meta-ads/callback` route:

```tsx
      <Route path="oauth/meta-ads/callback" element={<OAuthCallback />} />
      <Route path="instagram/callback" element={<InstagramCallbackPage />} />
```

The `/instagram` page itself goes inside the `ProtectedRoute` block, alongside the other authenticated routes:

```tsx
        <Route path="instagram" element={<InstagramPage />} />
```

(Place it next to `<Route path="creatives" ... />` so the routes match the sidebar order.)

- [ ] **Step 4: Boot frontend to verify it compiles**

In a terminal at `frontend/`:

```bash
npm run dev
```

Expected: Vite starts, no TypeScript errors. The pages don't exist yet (next two tasks create them), so the import will fail. **Move on to Task 11 and 12 first**, then come back to verify.

(Skip Step 5 commit until pages exist.)

---

## Task 11: Frontend — `InstagramCallbackPage`

**Files:**
- Create: `frontend/src/pages/InstagramCallbackPage.tsx`

- [ ] **Step 1: Create the callback page**

Create `frontend/src/pages/InstagramCallbackPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, CircularProgress, Stack, Typography, Button, Alert } from '@mui/material'
import { paths } from '../auth'
import { exchangeInstagramCode } from '../lib/api/instagram'

type Status = 'pending' | 'success' | 'error'

export function InstagramCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('pending')
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    const code = params.get('code')
    const errParam = params.get('error')
    const errDesc = params.get('error_description')

    if (errParam) {
      setStatus('error')
      setErrorMsg(errDesc || errParam)
      return
    }

    if (!code) {
      setStatus('error')
      setErrorMsg('Missing authorization code in callback URL.')
      return
    }

    const redirectUri = `${window.location.origin}/instagram/callback`

    exchangeInstagramCode({ code, redirect_uri: redirectUri })
      .then((data) => {
        setStatus('success')
        // Brief pause so the user sees the success state
        setTimeout(() => navigate(paths.instagram), 1200)
        return data
      })
      .catch((err: Error) => {
        setStatus('error')
        setErrorMsg(err.message || 'Failed to connect Instagram account.')
      })
  }, [params, navigate])

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F8FAFC' }}>
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 480, p: 4 }}>
        {status === 'pending' && (
          <>
            <CircularProgress />
            <Typography variant="h6">Connecting your Instagram account…</Typography>
            <Typography variant="body2" color="text.secondary">
              Hang tight — this usually takes a few seconds.
            </Typography>
          </>
        )}
        {status === 'success' && (
          <Alert severity="success" sx={{ width: '100%' }}>
            Instagram connected. Redirecting…
          </Alert>
        )}
        {status === 'error' && (
          <>
            <Alert severity="error" sx={{ width: '100%' }}>{errorMsg}</Alert>
            <Button variant="contained" onClick={() => navigate(paths.instagram)}>
              Back to Instagram
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
```

- [ ] **Step 2: No tests (frontend has no test runner configured)**

Verified manually in Task 14.

- [ ] **Step 3: Don't commit yet**

Wait until Task 12 + 13 are done, then commit the three frontend files together.

---

## Task 12: Frontend — API client

**Files:**
- Create: `frontend/src/lib/api/instagram.ts`

- [ ] **Step 1: Create the typed API client**

Create `frontend/src/lib/api/instagram.ts`:

```ts
import { apiFetch } from '../api'

export type InstagramAccount = {
  id: string
  organization_id: string
  ig_business_id: string
  ig_page_id: string | null
  ig_username: string | null
  ig_name: string | null
  ig_profile_picture_url: string | null
  account_type: string | null
  followers_count: number
  follows_count: number
  media_count: number
  token_expires_at: string | null
  last_synced_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type InstagramMediaItem = {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url?: string
  permalink: string
  timestamp: string
  thumbnail_url?: string
  media_product_type?: 'AD' | 'FEED' | 'STORY' | 'REELS'
}

export type InstagramMediaResponse = {
  data: InstagramMediaItem[]
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string }
}

async function unwrap<T>(p: Promise<Response>): Promise<T> {
  const r = await p
  const json = (await r.json()) as { success: boolean; data?: T; error?: string }
  if (!r.ok || !json.success) {
    throw new Error(json.error || `Request failed (${r.status})`)
  }
  return json.data as T
}

export function getInstagramAuthUrl() {
  const origin = window.location.origin
  return unwrap<{ authUrl: string; state: string; redirectUri: string }>(
    apiFetch(`/api/v1/instagram/oauth/url?origin=${encodeURIComponent(origin)}`),
  )
}

export function exchangeInstagramCode(body: { code: string; redirect_uri: string }) {
  return unwrap<{ id: string; username: string; name: string; isNew: boolean }>(
    apiFetch('/api/v1/instagram/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

export function listInstagramAccounts() {
  return unwrap<InstagramAccount[]>(apiFetch('/api/v1/instagram/accounts'))
}

export function disconnectInstagramAccount(accountId: string) {
  return unwrap<undefined>(apiFetch(`/api/v1/instagram/accounts/${accountId}`, { method: 'DELETE' }))
}

export function refreshInstagramAccount(accountId: string) {
  return unwrap<undefined>(
    apiFetch(`/api/v1/instagram/accounts/${accountId}/refresh`, { method: 'POST' }),
  )
}

export function getInstagramMedia(accountId: string, opts: { limit?: number; after?: string } = {}) {
  const qs = new URLSearchParams()
  if (opts.limit) qs.set('limit', String(opts.limit))
  if (opts.after) qs.set('after', opts.after)
  const suffix = qs.toString() ? `?${qs}` : ''
  return unwrap<InstagramMediaResponse>(
    apiFetch(`/api/v1/instagram/accounts/${accountId}/media${suffix}`),
  )
}

export function linkInstagramToChannel(accountId: string, channelId: string) {
  return unwrap<undefined>(
    apiFetch(`/api/v1/instagram/accounts/${accountId}/links`, {
      method: 'POST',
      body: JSON.stringify({ channel_id: channelId }),
    }),
  )
}

export function unlinkInstagramFromChannel(accountId: string, channelId: string) {
  return unwrap<undefined>(
    apiFetch(`/api/v1/instagram/accounts/${accountId}/links/${channelId}`, { method: 'DELETE' }),
  )
}
```

- [ ] **Step 2: Don't commit yet**

Bundled with Task 13's commit.

---

## Task 13: Frontend — `InstagramPage`

**Files:**
- Create: `frontend/src/pages/InstagramPage.tsx`

The page covers: empty state, list of connected accounts, per-account card with linked-channels chips, "Recent posts" disclosure, "Link channel" dialog, disconnect.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/InstagramPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Select, Stack, Typography, Alert,
  ImageList, ImageListItem, Snackbar, Tooltip,
} from '@mui/material'
import { Add, MoreVert, OpenInNew, Refresh, Delete } from '@mui/icons-material'
import {
  InstagramAccount, InstagramMediaItem, getInstagramAuthUrl, listInstagramAccounts,
  disconnectInstagramAccount, refreshInstagramAccount, getInstagramMedia,
  linkInstagramToChannel, unlinkInstagramFromChannel,
} from '../lib/api/instagram'
import { apiFetch } from '../lib/api'

type Channel = { id: string; name: string; brand_name: string }
type Toast = { severity: 'success' | 'error' | 'info'; message: string } | null
type AccountLinks = Record<string, string[]> // accountId -> channelIds

export function InstagramPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [accountLinks, setAccountLinks] = useState<AccountLinks>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast>(null)

  // Dialog state
  const [linkDialogFor, setLinkDialogFor] = useState<InstagramAccount | null>(null)
  const [linkDialogChannelId, setLinkDialogChannelId] = useState<string>('')

  // Per-account expansion state
  const [expandedMedia, setExpandedMedia] = useState<Record<string, InstagramMediaItem[] | 'loading'>>({})

  const loadAll = async () => {
    setLoading(true)
    try {
      const [accs, ch] = await Promise.all([
        listInstagramAccounts(),
        apiFetch('/api/v1/channels').then(async (r) => {
          const j = (await r.json()) as { data?: Channel[]; success?: boolean }
          return Array.isArray(j) ? (j as Channel[]) : (j.data || [])
        }),
      ])
      setAccounts(accs)
      setChannels(ch)
      // Per-account link list — channels are derived from a separate query
      // (we fetch /channels and filter to the ones whose linked-IG list
      // includes this account). For simplicity in v1 we don't display
      // accurate per-account links until the user opens the link dialog,
      // because the backend doesn't expose this in a single call. This
      // is fine because the user just connected — they know which they linked.
      const initial: AccountLinks = {}
      for (const a of accs) initial[a.id] = []
      setAccountLinks(initial)
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const onConnect = async () => {
    try {
      const { authUrl } = await getInstagramAuthUrl()
      window.location.href = authUrl
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    }
  }

  const onDisconnect = async (acct: InstagramAccount) => {
    if (!window.confirm(`Disconnect @${acct.ig_username}? Linked channels will stop posting to it.`)) return
    try {
      await disconnectInstagramAccount(acct.id)
      setToast({ severity: 'success', message: 'Account disconnected' })
      void loadAll()
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    }
  }

  const onRefresh = async (acct: InstagramAccount) => {
    try {
      await refreshInstagramAccount(acct.id)
      setToast({ severity: 'success', message: 'Token refreshed' })
      void loadAll()
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    }
  }

  const onSaveLink = async () => {
    if (!linkDialogFor || !linkDialogChannelId) return
    try {
      await linkInstagramToChannel(linkDialogFor.id, linkDialogChannelId)
      setAccountLinks((prev) => ({
        ...prev,
        [linkDialogFor.id]: [...(prev[linkDialogFor.id] ?? []), linkDialogChannelId],
      }))
      setToast({ severity: 'success', message: 'Linked' })
      setLinkDialogFor(null)
      setLinkDialogChannelId('')
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    }
  }

  const onUnlink = async (acct: InstagramAccount, channelId: string) => {
    try {
      await unlinkInstagramFromChannel(acct.id, channelId)
      setAccountLinks((prev) => ({
        ...prev,
        [acct.id]: (prev[acct.id] ?? []).filter((c) => c !== channelId),
      }))
      setToast({ severity: 'success', message: 'Unlinked' })
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
    }
  }

  const onToggleMedia = async (acct: InstagramAccount) => {
    if (expandedMedia[acct.id]) {
      // collapse
      const next = { ...expandedMedia }
      delete next[acct.id]
      setExpandedMedia(next)
      return
    }
    setExpandedMedia((prev) => ({ ...prev, [acct.id]: 'loading' }))
    try {
      const out = await getInstagramMedia(acct.id, { limit: 12 })
      setExpandedMedia((prev) => ({ ...prev, [acct.id]: out.data }))
    } catch (err: unknown) {
      setToast({ severity: 'error', message: (err as Error).message })
      setExpandedMedia((prev) => {
        const next = { ...prev }
        delete next[acct.id]
        return next
      })
    }
  }

  const channelById = useMemo(
    () => Object.fromEntries(channels.map((c) => [c.id, c])),
    [channels],
  )

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Instagram Accounts</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={onConnect}>
          Connect Instagram
        </Button>
      </Stack>

      {accounts.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>No Instagram accounts connected yet.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Connect an Instagram Business account to publish from your channels.
          </Typography>
          <Button variant="contained" onClick={onConnect}>Connect Instagram</Button>
        </Card>
      ) : (
        <Stack spacing={2}>
          {accounts.map((acct) => {
            const linked = accountLinks[acct.id] ?? []
            const mediaState = expandedMedia[acct.id]
            return (
              <Card key={acct.id}>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Avatar src={acct.ig_profile_picture_url || undefined} sx={{ width: 56, height: 56 }}>
                      {(acct.ig_username || '?')[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        @{acct.ig_username}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {acct.ig_name} · {acct.account_type}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {acct.followers_count.toLocaleString()} followers · {acct.media_count} posts
                      </Typography>
                    </Box>
                    <Tooltip title="Refresh token"><IconButton onClick={() => onRefresh(acct)}><Refresh /></IconButton></Tooltip>
                    <Tooltip title="Disconnect"><IconButton color="error" onClick={() => onDisconnect(acct)}><Delete /></IconButton></Tooltip>
                  </Stack>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">Linked channels</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      {linked.map((channelId) => (
                        <Chip
                          key={channelId}
                          label={channelById[channelId]?.name || channelId}
                          onDelete={() => onUnlink(acct, channelId)}
                          size="small"
                        />
                      ))}
                      <Chip
                        icon={<Add />}
                        label="Link channel"
                        onClick={() => setLinkDialogFor(acct)}
                        variant="outlined"
                        size="small"
                      />
                    </Stack>
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => onToggleMedia(acct)}>
                      {mediaState ? 'Hide recent posts' : 'Show recent posts'}
                    </Button>
                    {mediaState === 'loading' && <CircularProgress size={20} sx={{ ml: 2 }} />}
                    {Array.isArray(mediaState) && mediaState.length > 0 && (
                      <ImageList cols={4} gap={6} sx={{ mt: 1 }}>
                        {mediaState.map((m) => (
                          <ImageListItem key={m.id} sx={{ position: 'relative' }}>
                            <img
                              src={m.thumbnail_url || m.media_url}
                              alt={m.caption?.slice(0, 40) || m.id}
                              style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 }}
                            />
                            <IconButton
                              size="small"
                              href={m.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,0.8)' }}
                            >
                              <OpenInNew fontSize="small" />
                            </IconButton>
                          </ImageListItem>
                        ))}
                      </ImageList>
                    )}
                    {Array.isArray(mediaState) && mediaState.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        No posts yet on this account.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Stack>
      )}

      <Dialog open={!!linkDialogFor} onClose={() => setLinkDialogFor(null)}>
        <DialogTitle>Link @{linkDialogFor?.ig_username} to a channel</DialogTitle>
        <DialogContent sx={{ minWidth: 360 }}>
          <Select
            fullWidth
            value={linkDialogChannelId}
            onChange={(e) => setLinkDialogChannelId(e.target.value)}
            displayEmpty
            sx={{ mt: 1 }}
          >
            <MenuItem value="" disabled>Pick a channel…</MenuItem>
            {channels.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name} · {c.brand_name}</MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogFor(null)}>Cancel</Button>
          <Button variant="contained" disabled={!linkDialogChannelId} onClick={onSaveLink}>Link</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  )
}
```

Caveat: this v1 doesn't show pre-populated linked-channels because the backend doesn't yet expose "channels for this IG account" in a single call. Users see chips appear as they link/unlink in this session. A future enhancement is `GET /accounts/:id/channels` (listed in Spec 2 follow-ups, not a blocker for shipping).

- [ ] **Step 2: Run frontend dev server**

In `frontend/`:
```bash
npm run dev
```

Expected: Vite compiles without TypeScript errors. Visit `http://localhost:5173/instagram` (the actual port may differ; check the Vite log).

- [ ] **Step 3: Commit the three frontend files together**

```bash
git add frontend/src/auth/constants.ts frontend/src/components/layout/Sidebar.tsx frontend/src/App.tsx frontend/src/lib/api/instagram.ts frontend/src/pages/InstagramPage.tsx frontend/src/pages/InstagramCallbackPage.tsx
git commit -m "feat(frontend): Instagram tab — connect, list, link to channels, recent posts"
```

---

## Task 14: End-to-end smoke

**Files:**
- (no edits — verification task)

- [ ] **Step 1: Verify Meta App configuration**

Open the Meta App used for IG (Meta for Developers → your app). Confirm:
- "Instagram Business Login" is configured
- App ID and App Secret are pasted into `backend/.env` (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`)
- The redirect URI `${frontend_origin}/instagram/callback` is added to the allowed callback list (e.g. `http://localhost:5173/instagram/callback` in dev)
- Your IG account is added as a test user OR the app is in Live mode for IG

If the app is in dev mode, only test users / business members can complete the flow.

- [ ] **Step 2: Run backend full test suite**

```bash
cd backend
npm run test
```

Expected: all tests pass, including the new `InstagramApiService`, `InstagramOAuthService`, `InstagramAccountRepository`, and `PublishingService` fan-out tests.

- [ ] **Step 3: Lint backend**

```bash
npm run lint -- src/services/InstagramOAuthServices.js src/services/InstagramApiService.js src/Controllers/InstagramOAuthController.js src/Routes/InstagramOAuthRoutes.js src/Repositories/InstagramAccountRepository.js src/services/PublishingService.js src/plugins/di.js src/modules/index.js
```

Expected: no NEW errors or warnings introduced beyond the pre-existing ones in unrelated files.

- [ ] **Step 4: Boot backend and frontend**

In two terminals:

```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

- [ ] **Step 5: Manual click-through**

In the browser:
1. Sign in to GrowthOS
2. Click **Instagram** in the sidebar → empty-state card with "Connect Instagram" button
3. Click **Connect Instagram** → redirected to `https://www.instagram.com/oauth/authorize?...`
4. Grant permissions → redirected back to `/instagram/callback?code=...`
5. The callback page shows "Connecting…" then a success snackbar, then auto-navigates to `/instagram`
6. The new account card appears with avatar, username, follower count
7. Click **Link channel** → pick a channel → save → chip appears
8. Click **Show recent posts** → up to 12 thumbnails appear
9. Click a thumbnail → opens IG permalink in a new tab
10. Click the X on a chip → unlinked
11. Click the trash icon → confirm → account is removed and the card disappears

If any step fails, debug from the corresponding code path. The most common dev issues:
- "Instagram App ID missing" → fill `backend/.env`
- "redirect_uri mismatch" → add the exact callback URL to the Meta App's allowed list
- "No channels in dropdown" → create a channel in the Channels tab first

- [ ] **Step 6: Verify fan-out (optional, requires a real publish)**

If a creative bundle exists in `ready` state and you've linked an IG account to its channel, POST to `/api/v1/publishing/creatives/<id>/publish` (use curl with the JWT). Confirm:
- `creative_bundles.status` becomes `published`
- `creative_bundles.render_job_id` holds an IG media ID
- `creative_bundles.published_targets` is a JSON array with one entry per linked IG account

Skip if no real publish target is available — the unit tests cover the fan-out logic.

- [ ] **Step 7: No commit needed (verification task)**

---

## Self-review checklist

After running the plan end-to-end, confirm against the spec ([2026-05-03-ig-connect-foundation-design.md](../specs/2026-05-03-ig-connect-foundation-design.md)):

- [ ] §4.1 schema additions — `instagram_accounts`, `channel_instagram_accounts`, `creative_bundles.published_targets` all present (Task 1)
- [ ] §4.2 env + config — all 5 env vars + `config.instagram` + `config.redirectUris.instagram` (Task 2)
- [ ] §4.3 repository methods — all 11 methods listed in the spec (Task 4)
- [ ] §4.4 OAuth service — entitlements / webhooks / IGSID / comment-scope probe / cross-org guard all dropped; `linkChannel`/`unlinkChannel`/`getMedia` added (Task 5)
- [ ] §4.5 API service — `exchangeForLongLivedToken`, `refreshLongLivedToken`, `getProfile`, `getPageId`, `getMedia` (Task 3)
- [ ] §4.6 controller — `request.user.organization_id`; `linkChannel`/`unlinkChannel`/`getMedia` added; entitlement branches removed (Task 6)
- [ ] §4.7 routes — all 9 routes present, mounted under `/api/v1/instagram`; insights route removed (Task 7)
- [ ] §4.8 DI wiring (Task 8)
- [ ] §4.9 server registration (Task 8)
- [ ] §4.10 PublishingService fan-out — linked-account discovery, fan-out loop, partial-success handling, legacy fallback (Task 9)
- [ ] §4.11 tests — 3 new test files + extended PublishingService test (Tasks 3, 4, 5, 9)
- [ ] §5 frontend — paths, sidebar, App route, callback page, page, API client (Tasks 10–13)
- [ ] §6 happy-path flow exercised manually (Task 14)
- [ ] Out-of-scope items NOT introduced: per-post insights, account insights time-series, charts, "yours-vs-all" toggle, scheduled refresh job, webhooks
