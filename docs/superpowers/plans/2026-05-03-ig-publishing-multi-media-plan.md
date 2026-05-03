# IG Publishing — Multi-Media-Type Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `backend/src/services/PublishingService.js` to publish every Instagram Content Publishing API media type (image, feed video, Reels, carousel, story) with the full feature surface (location, user tags, collaborators, alt text, cover frame, share-to-feed, audio name, paid partnership), while pinning the Graph URL to a versioned form. No schema changes. No frontend work. First tests in `backend/src/`.

**Architecture:** Service-only abstraction (option (a) from the spec). One generic public method `publishMedia(channel, spec)` validates a discriminated-union `MediaSpec` and dispatches to a per-type internal builder. Existing public method `publish(channel, bundle)` is renamed to `publishBundle` and becomes a thin shim that builds a `reels` spec from a `creative_bundles` row and delegates to `publishMedia`. Existing helpers (`_waitForContainer`, `_publishContainer`, `_getPageToken`, `_sleep`) are reused unchanged.

**Tech Stack:** Node 20+, ES modules, Fastify, Drizzle (Postgres), axios, vitest, pino. Spec at [docs/superpowers/specs/2026-05-03-ig-publishing-multi-media-design.md](../specs/2026-05-03-ig-publishing-multi-media-design.md).

---

## File Structure

**Modified:**
- [`backend/src/services/PublishingService.js`](../../../backend/src/services/PublishingService.js) — main work. Header constant change, new private + public methods, the existing `_createContainer` is removed in favor of `_createReelsContainer`, the existing `publish` becomes `publishBundle`.
- [`backend/src/scheduler.js`](../../../backend/src/scheduler.js) — line 192 caller rename.
- [`backend/src/services/ApprovalService.js`](../../../backend/src/services/ApprovalService.js) — line 266 caller rename.
- [`backend/src/modules/publishing/routes.js`](../../../backend/src/modules/publishing/routes.js) — lines 28 and 38 caller rename.

**Created:**
- `backend/vitest.config.js` — minimal vitest config so test discovery works under `backend/tests/`.
- `backend/tests/services/PublishingService.test.js` — first tests under `backend/`. New tests added across tasks.

**Touched indirectly (no edits, just reference):**
- [`backend/src/lib/errors.js`](../../../backend/src/lib/errors.js) — `badRequest()` is the validation-error factory used throughout.
- [`backend/src/config/env.js`](../../../backend/src/config/env.js) — `env.META_API_BASE_URL` and `env.META_API_VERSION` are already configured.

---

## Conventions used by every task

- All commands run from `backend/`.
- `npm run test` runs `vitest run` (one-shot). For watching while developing, use `npm run test:watch`.
- `npm run lint` runs eslint on the whole package.
- Each task ends with a commit. The user's working agreement is "don't auto-commit", so when executed in a real session, the engineer may pause for explicit approval before each commit step.
- The existing `console.log/warn/error` style in `PublishingService.js` is preserved. Don't migrate to a structured logger in this phase.
- Use `vi.mock('axios')` to keep tests offline. Stub `_getPageToken` per-instance to avoid mocking the database for `publishMedia` tests.

---

## Task 1: Test infrastructure

**Files:**
- Create: `backend/vitest.config.js`
- Create: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the first sanity test (will fail because the file doesn't exist yet)**

Create `backend/tests/services/PublishingService.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PublishingService } from '../../src/services/PublishingService.js';

describe('PublishingService — smoke', () => {
  it('instantiates', () => {
    const svc = new PublishingService();
    expect(svc).toBeInstanceOf(PublishingService);
  });
});
```

- [ ] **Step 2: Add a vitest config so tests are discovered cleanly**

Create `backend/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
```

- [ ] **Step 3: Run the test to confirm it passes**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: 1 passed (PublishingService instantiates).

If it fails because `env` validation rejects something, you're missing required env vars from [`backend/.env`](../../../backend/.env). Ensure `JWT_SECRET`, `APPROVAL_LINK_SECRET`, `TOKEN_ENCRYPTION_KEY` are set (they already are in dev).

- [ ] **Step 4: Commit**

```bash
git add backend/vitest.config.js backend/tests/services/PublishingService.test.js
git commit -m "test: add vitest config and first PublishingService smoke test"
```

---

## Task 2: Pin Graph URL to env-versioned base

**Files:**
- Modify: `backend/src/services/PublishingService.js:5-9` (the `IG_API_BASE` constant)
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/services/PublishingService.test.js`:

```js
import axios from 'axios';
import { vi } from 'vitest';
import { env } from '../../src/config/env.js';

vi.mock('axios');

describe('PublishingService — Graph URL', () => {
  it('uses env.META_API_VERSION when calling Graph', async () => {
    const svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('tok');
    axios.post.mockResolvedValueOnce({ data: { id: 'CONTAINER_1' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });
    axios.post.mockResolvedValueOnce({ data: { id: 'MEDIA_1' } });

    // Call the existing reels path through the legacy method to sanity check pinning.
    // After Task 10 this test will be replaced by a publishMedia-based one.
    await svc.publish(
      { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' },
      { id: 'b1', video_url: 'https://example.com/v.mp4', caption: 'hi', hashtags: [] },
    );

    const expectedPrefix = `${env.META_API_BASE_URL}/${env.META_API_VERSION}/`;
    expect(axios.post.mock.calls[0][0].startsWith(expectedPrefix)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: FAIL — the URL still starts with `https://graph.facebook.com/IG_USER/...` (no version segment).

- [ ] **Step 3: Pin the constant**

In `backend/src/services/PublishingService.js`, replace:

```js
const IG_API_BASE = 'https://graph.facebook.com';
```

with:

```js
import { env } from '../config/env.js';
// ...
const IG_API_BASE = `${env.META_API_BASE_URL}/${env.META_API_VERSION}`;
```

If `env` is not already imported in that file, add the import next to the existing imports near the top. (`env` is currently NOT imported in PublishingService.js.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "fix(publishing): pin IG Graph URL to env.META_API_VERSION"
```

---

## Task 3: Caption validation (length, hashtag count, mention count)

**Files:**
- Modify: `backend/src/services/PublishingService.js` — replace the body of `_buildCaption` (currently at line 196) with a validating version.
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```js
import { badRequest } from '../../src/lib/errors.js';

describe('PublishingService._buildCaption', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('joins caption + hashtags', () => {
    const out = svc._buildCaption({ caption: 'hello', hashtags: ['ai', 'dev'] });
    expect(out).toBe('hello\n\n#ai #dev');
  });

  it('rejects caption longer than 2200 chars', () => {
    expect(() => svc._buildCaption({ caption: 'x'.repeat(2201), hashtags: [] }))
      .toThrowError(/2200/);
  });

  it('rejects more than 30 hashtags', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(() => svc._buildCaption({ caption: 'hi', hashtags: tags }))
      .toThrowError(/hashtag/i);
  });

  it('rejects more than 20 @mentions in caption', () => {
    const mentions = Array.from({ length: 21 }, (_, i) => `@u${i}`).join(' ');
    expect(() => svc._buildCaption({ caption: mentions, hashtags: [] }))
      .toThrowError(/mention/i);
  });

  it('returns empty string if no caption and no hashtags', () => {
    expect(svc._buildCaption({})).toBe('');
  });
});

beforeEach(() => { vi.clearAllMocks(); });
```

The `beforeEach` at the bottom is module-scope; if Vitest already has a top-level `beforeEach`, reuse it instead of duplicating.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: 3-4 of the new tests FAIL (the existing helper truncates instead of throwing).

- [ ] **Step 3: Replace `_buildCaption`**

Replace the existing method in `backend/src/services/PublishingService.js` (currently lines 196-203) with:

```js
_buildCaption({ caption, hashtags } = {}) {
  const cap = typeof caption === 'string' ? caption : '';
  const tags = Array.isArray(hashtags) ? hashtags : [];

  if (cap.length > 2200) {
    throw badRequest('Caption exceeds 2200 characters', { length: cap.length });
  }
  if (tags.length > 30) {
    throw badRequest('Caption has more than 30 hashtags', { count: tags.length });
  }
  const mentionMatches = cap.match(/@[A-Za-z0-9._]+/g) ?? [];
  if (mentionMatches.length > 20) {
    throw badRequest('Caption has more than 20 @-mentions', { count: mentionMatches.length });
  }
  if (!cap && tags.length === 0) return '';
  const tagBlock = tags.length ? `\n\n${tags.map((h) => `#${h}`).join(' ')}` : '';
  const out = `${cap}${tagBlock}`;
  if (out.length > 2200) {
    throw badRequest('Caption + hashtags combined exceed 2200 characters', { length: out.length });
  }
  return out;
}
```

Add `import { badRequest } from '../lib/errors.js';` at the top of the file if not already imported.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- tests/services/PublishingService.test.js`
Expected: PASS for all `_buildCaption` cases. The pre-existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): validate caption length, hashtag and mention counts"
```

---

## Task 4: MediaSpec JSDoc typedefs and `_validateSpec` skeleton

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
describe('PublishingService._validateSpec', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('rejects when type is missing', () => {
    expect(() => svc._validateSpec({})).toThrowError(/type/i);
  });

  it('rejects unknown type', () => {
    expect(() => svc._validateSpec({ type: 'audio' })).toThrowError(/type/i);
  });

  it('accepts a known type and dispatches (smoke — image with url)', () => {
    expect(() => svc._validateSpec({ type: 'image', image_url: 'https://x/a.jpg' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (`_validateSpec is not a function`).

- [ ] **Step 3: Add the JSDoc typedefs and the dispatcher skeleton**

In `backend/src/services/PublishingService.js`, just above the class declaration, add:

```js
/**
 * @typedef {object} UserTag
 * @property {string} username
 * @property {number} [x]   // 0..1, REQUIRED for image
 * @property {number} [y]   // 0..1, REQUIRED for image
 *
 * @typedef {object} Partnership
 * @property {true} is_paid_partnership
 * @property {string[]} [sponsor_ig_user_ids]    // ≤2
 *
 * @typedef {object} CarouselChild
 * @property {'image'|'video'} kind
 * @property {string} [image_url]
 * @property {string} [video_url]
 * @property {UserTag[]} [user_tags]
 * @property {string} [alt_text]                 // image children only
 *
 * @typedef {object} ImageSpec
 * @property {'image'} type
 * @property {string} image_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [alt_text]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} VideoSpec
 * @property {'video'} type
 * @property {string} video_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [cover_url]
 * @property {number} [thumb_offset_ms]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} ReelsSpec
 * @property {'reels'} type
 * @property {string} video_url
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string} [location_id]
 * @property {UserTag[]} [user_tags]
 * @property {string[]} [collaborators]
 * @property {string} [cover_url]
 * @property {number} [thumb_offset_ms]
 * @property {boolean} [share_to_feed]      // defaults true
 * @property {string} [audio_name]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} CarouselSpec
 * @property {'carousel'} type
 * @property {CarouselChild[]} children      // 2..10
 * @property {string} [caption]
 * @property {string[]} [hashtags]
 * @property {string[]} [collaborators]
 * @property {Partnership} [partnership]
 *
 * @typedef {object} StorySpec
 * @property {'story'} type
 * @property {string} [image_url]
 * @property {string} [video_url]
 * @property {UserTag[]} [user_tags]
 *
 * @typedef {ImageSpec|VideoSpec|ReelsSpec|CarouselSpec|StorySpec} MediaSpec
 */

const MEDIA_TYPES = new Set(['image', 'video', 'reels', 'carousel', 'story']);
```

Inside the class, near the other internal helpers, add:

```js
/** @param {MediaSpec} spec */
_validateSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw badRequest('MediaSpec is required', { spec });
  }
  if (!MEDIA_TYPES.has(spec.type)) {
    throw badRequest(`Unknown MediaSpec type: ${spec.type}`, { allowed: [...MEDIA_TYPES] });
  }
  // Per-type validation lands in subsequent tasks.
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): MediaSpec typedefs and _validateSpec skeleton"
```

---

## Task 5: `_validateSpec` for non-carousel types (image, video, reels, story)

**Files:**
- Modify: `backend/src/services/PublishingService.js` — extend `_validateSpec`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService._validateSpec — image', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires image_url', () => {
    expect(() => svc._validateSpec({ type: 'image' })).toThrowError(/image_url/);
  });
  it('rejects oversize alt_text', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg', alt_text: 'a'.repeat(1001),
    })).toThrowError(/alt_text/i);
  });
  it('requires x and y on user_tags for image', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      user_tags: [{ username: 'u' }],
    })).toThrowError(/x.*y/i);
  });
  it('rejects collaborators > 3', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      collaborators: ['a', 'b', 'c', 'd'],
    })).toThrowError(/collaborator/i);
  });
});

describe('PublishingService._validateSpec — video', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires video_url', () => {
    expect(() => svc._validateSpec({ type: 'video' })).toThrowError(/video_url/);
  });
  it('rejects reels-only fields', () => {
    expect(() => svc._validateSpec({
      type: 'video', video_url: 'https://x/v.mp4', share_to_feed: true,
    })).toThrowError(/share_to_feed/);
    expect(() => svc._validateSpec({
      type: 'video', video_url: 'https://x/v.mp4', audio_name: 'song',
    })).toThrowError(/audio_name/);
  });
});

describe('PublishingService._validateSpec — reels', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires video_url', () => {
    expect(() => svc._validateSpec({ type: 'reels' })).toThrowError(/video_url/);
  });
  it('accepts cover_url and thumb_offset_ms together', () => {
    expect(() => svc._validateSpec({
      type: 'reels', video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg', thumb_offset_ms: 1000,
    })).not.toThrow();
  });
  it('rejects audio_name longer than 30 chars', () => {
    expect(() => svc._validateSpec({
      type: 'reels', video_url: 'https://x/v.mp4', audio_name: 'a'.repeat(31),
    })).toThrowError(/audio_name/);
  });
});

describe('PublishingService._validateSpec — story', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires exactly one of image_url or video_url', () => {
    expect(() => svc._validateSpec({ type: 'story' })).toThrowError(/image_url.*video_url|video_url.*image_url/);
    expect(() => svc._validateSpec({
      type: 'story', image_url: 'https://x/a.jpg', video_url: 'https://x/v.mp4',
    })).toThrowError(/exactly one/i);
  });
  it('rejects caption/hashtags/collaborators/partnership', () => {
    expect(() => svc._validateSpec({
      type: 'story', image_url: 'https://x/a.jpg', caption: 'hi',
    })).toThrowError(/caption/);
  });
});

describe('PublishingService._validateSpec — partnership', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('rejects sponsor_ig_user_ids longer than 2', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      partnership: { is_paid_partnership: true, sponsor_ig_user_ids: ['1', '2', '3'] },
    })).toThrowError(/sponsor/i);
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — many of these fail.

- [ ] **Step 3: Implement per-type validation**

Replace the body of `_validateSpec` in `backend/src/services/PublishingService.js`:

```js
/** @param {MediaSpec} spec */
_validateSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw badRequest('MediaSpec is required', { spec });
  }
  if (!MEDIA_TYPES.has(spec.type)) {
    throw badRequest(`Unknown MediaSpec type: ${spec.type}`, { allowed: [...MEDIA_TYPES] });
  }

  // Common: collaborators (≤3), partnership (sponsor_ig_user_ids ≤2)
  if (spec.collaborators !== undefined) {
    if (!Array.isArray(spec.collaborators) || spec.collaborators.length > 3) {
      throw badRequest('collaborators must be an array of at most 3 usernames', {
        collaborators: spec.collaborators,
      });
    }
  }
  if (spec.partnership) {
    const ids = spec.partnership.sponsor_ig_user_ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 2)) {
      throw badRequest('partnership.sponsor_ig_user_ids must be an array of at most 2', { ids });
    }
  }

  switch (spec.type) {
    case 'image':
      this._validateImageSpec(spec);
      break;
    case 'video':
      this._validateVideoSpec(spec);
      break;
    case 'reels':
      this._validateReelsSpec(spec);
      break;
    case 'carousel':
      this._validateCarouselSpec(spec);
      break;
    case 'story':
      this._validateStorySpec(spec);
      break;
  }
}

_validateImageSpec(spec) {
  if (!isHttpUrl(spec.image_url)) {
    throw badRequest('image_url is required and must be an http(s) URL', { image_url: spec.image_url });
  }
  if (typeof spec.alt_text === 'string' && spec.alt_text.length > 1000) {
    throw badRequest('alt_text exceeds 1000 characters', { length: spec.alt_text.length });
  }
  validateImageUserTags(spec.user_tags);
}

_validateVideoSpec(spec) {
  if (!isHttpUrl(spec.video_url)) {
    throw badRequest('video_url is required and must be an http(s) URL', { video_url: spec.video_url });
  }
  if (spec.share_to_feed !== undefined) {
    throw badRequest('share_to_feed is reels-only; use type="reels"');
  }
  if (spec.audio_name !== undefined) {
    throw badRequest('audio_name is reels-only; use type="reels"');
  }
  validateOptionalCoverFields(spec);
}

_validateReelsSpec(spec) {
  if (!isHttpUrl(spec.video_url)) {
    throw badRequest('video_url is required and must be an http(s) URL', { video_url: spec.video_url });
  }
  if (typeof spec.audio_name === 'string' && spec.audio_name.length > 30) {
    throw badRequest('audio_name exceeds 30 characters', { length: spec.audio_name.length });
  }
  validateOptionalCoverFields(spec);
}

_validateStorySpec(spec) {
  const hasImage = isHttpUrl(spec.image_url);
  const hasVideo = isHttpUrl(spec.video_url);
  if (hasImage === hasVideo) {
    throw badRequest('story requires exactly one of image_url or video_url');
  }
  for (const forbidden of ['caption', 'hashtags', 'collaborators', 'partnership']) {
    if (spec[forbidden] !== undefined) {
      throw badRequest(`${forbidden} is not supported on stories`, { forbidden });
    }
  }
}
```

Add these module-level helpers near the top of the file (next to `MEDIA_TYPES`):

```js
function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function validateImageUserTags(tags) {
  if (!Array.isArray(tags)) return;
  for (const t of tags) {
    if (!t || typeof t.username !== 'string') {
      throw badRequest('user_tags entry requires a username', { tag: t });
    }
    if (typeof t.x !== 'number' || typeof t.y !== 'number' || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) {
      throw badRequest('user_tags on images require x and y in [0,1]', { tag: t });
    }
  }
}

function validateOptionalCoverFields(spec) {
  if (spec.cover_url !== undefined && !isHttpUrl(spec.cover_url)) {
    throw badRequest('cover_url must be an http(s) URL', { cover_url: spec.cover_url });
  }
  if (spec.thumb_offset_ms !== undefined && (typeof spec.thumb_offset_ms !== 'number' || spec.thumb_offset_ms < 0)) {
    throw badRequest('thumb_offset_ms must be a non-negative number', { thumb_offset_ms: spec.thumb_offset_ms });
  }
}
```

`_validateCarouselSpec` is a stub for Task 6 — add `_validateCarouselSpec(spec) { /* see Task 6 */ }` so the switch compiles.

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — all current tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): per-type _validateSpec for image/video/reels/story"
```

---

## Task 6: `_validateSpec` for carousel

**Files:**
- Modify: `backend/src/services/PublishingService.js` — fill in `_validateCarouselSpec`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService._validateSpec — carousel', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('rejects fewer than 2 children', () => {
    expect(() => svc._validateSpec({
      type: 'carousel',
      children: [{ kind: 'image', image_url: 'https://x/a.jpg' }],
    })).toThrowError(/2.*10|children/i);
  });

  it('rejects more than 10 children', () => {
    const children = Array.from({ length: 11 }, () => ({ kind: 'image', image_url: 'https://x/a.jpg' }));
    expect(() => svc._validateSpec({ type: 'carousel', children }))
      .toThrowError(/2.*10|10/);
  });

  it('rejects child with mismatched kind/url', () => {
    expect(() => svc._validateSpec({
      type: 'carousel',
      children: [
        { kind: 'image', video_url: 'https://x/v.mp4' },
        { kind: 'image', image_url: 'https://x/b.jpg' },
      ],
    })).toThrowError(/image_url/);
  });

  it('accepts 2 children with mixed image+video', () => {
    expect(() => svc._validateSpec({
      type: 'carousel',
      children: [
        { kind: 'image', image_url: 'https://x/a.jpg' },
        { kind: 'video', video_url: 'https://x/v.mp4' },
      ],
    })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails on the new carousel cases.

- [ ] **Step 3: Implement `_validateCarouselSpec`**

Replace the stub:

```js
_validateCarouselSpec(spec) {
  if (!Array.isArray(spec.children) || spec.children.length < 2 || spec.children.length > 10) {
    throw badRequest('carousel children must contain 2 to 10 items', {
      count: Array.isArray(spec.children) ? spec.children.length : null,
    });
  }
  for (const child of spec.children) {
    if (!child || (child.kind !== 'image' && child.kind !== 'video')) {
      throw badRequest('carousel child must declare kind="image" or kind="video"', { child });
    }
    if (child.kind === 'image' && !isHttpUrl(child.image_url)) {
      throw badRequest('carousel image child requires a valid image_url', { child });
    }
    if (child.kind === 'video' && !isHttpUrl(child.video_url)) {
      throw badRequest('carousel video child requires a valid video_url', { child });
    }
    if (child.kind === 'image') {
      validateImageUserTags(child.user_tags);
      if (typeof child.alt_text === 'string' && child.alt_text.length > 1000) {
        throw badRequest('child alt_text exceeds 1000 characters', { length: child.alt_text.length });
      }
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _validateCarouselSpec — 2..10 mixed children"
```

---

## Task 7: `_buildCommonParams` helper

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService._buildCommonParams', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('includes caption built from caption + hashtags', () => {
    const p = svc._buildCommonParams({ type: 'image', image_url: 'x', caption: 'hi', hashtags: ['a'] });
    expect(p.caption).toBe('hi\n\n#a');
  });
  it('JSON-encodes user_tags and collaborators', () => {
    const p = svc._buildCommonParams({
      type: 'image', image_url: 'x',
      user_tags: [{ username: 'u', x: 0.5, y: 0.5 }],
      collaborators: ['a', 'b'],
    });
    expect(p.user_tags).toBe(JSON.stringify([{ username: 'u', x: 0.5, y: 0.5 }]));
    expect(p.collaborators).toBe(JSON.stringify(['a', 'b']));
  });
  it('passes location_id when set', () => {
    expect(svc._buildCommonParams({ type: 'image', image_url: 'x', location_id: '12345' })
      .location_id).toBe('12345');
  });
  it('expands partnership flags', () => {
    const p = svc._buildCommonParams({
      type: 'image', image_url: 'x',
      partnership: { is_paid_partnership: true, sponsor_ig_user_ids: ['111'] },
    });
    expect(p.is_paid_partnership).toBe('true');
    expect(p.branded_content_sponsor_ids).toBe(JSON.stringify(['111']));
  });
  it('omits empty fields', () => {
    const p = svc._buildCommonParams({ type: 'image', image_url: 'x' });
    expect('caption' in p).toBe(false);
    expect('user_tags' in p).toBe(false);
    expect('collaborators' in p).toBe(false);
    expect('location_id' in p).toBe(false);
    expect('is_paid_partnership' in p).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (`_buildCommonParams` undefined).

- [ ] **Step 3: Implement**

Add inside the class:

```js
/** @param {MediaSpec} spec */
_buildCommonParams(spec) {
  const out = {};
  const caption = this._buildCaption({ caption: spec.caption, hashtags: spec.hashtags });
  if (caption) out.caption = caption;
  if (spec.location_id) out.location_id = String(spec.location_id);
  if (Array.isArray(spec.user_tags) && spec.user_tags.length) {
    out.user_tags = JSON.stringify(spec.user_tags);
  }
  if (Array.isArray(spec.collaborators) && spec.collaborators.length) {
    out.collaborators = JSON.stringify(spec.collaborators);
  }
  if (typeof spec.alt_text === 'string' && spec.alt_text.length) {
    out.alt_text = spec.alt_text;
  }
  if (spec.partnership?.is_paid_partnership) {
    out.is_paid_partnership = 'true';
    if (spec.partnership.sponsor_ig_user_ids?.length) {
      out.branded_content_sponsor_ids = JSON.stringify(spec.partnership.sponsor_ig_user_ids);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _buildCommonParams helper for shared IG container fields"
```

---

## Task 8: `_createImageContainer` and `publishMedia` for image

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService.publishMedia — image', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('creates image container then publishes; returns mediaId/containerId', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON_1' } })   // create container
      .mockResolvedValueOnce({ data: { id: 'MED_1' } });  // publish
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const out = await svc.publishMedia(channel, {
      type: 'image',
      image_url: 'https://x/a.jpg',
      caption: 'hi',
      hashtags: ['a'],
      alt_text: 'photo',
      location_id: '999',
      collaborators: ['friend1'],
    });

    expect(out).toEqual({ containerId: 'CON_1', mediaId: 'MED_1' });

    const [createUrl, , createOpts] = axios.post.mock.calls[0];
    expect(createUrl).toMatch(new RegExp(`/IG_USER/media$`));
    expect(createOpts.params).toMatchObject({
      image_url: 'https://x/a.jpg',
      caption: 'hi\n\n#a',
      access_token: 'TOK',
      alt_text: 'photo',
      location_id: '999',
      collaborators: JSON.stringify(['friend1']),
    });
    expect(createOpts.params.media_type).toBeUndefined();

    const [publishUrl, , publishOpts] = axios.post.mock.calls[1];
    expect(publishUrl).toMatch(new RegExp(`/IG_USER/media_publish$`));
    expect(publishOpts.params).toMatchObject({ creation_id: 'CON_1', access_token: 'TOK' });
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (`publishMedia is not a function`).

- [ ] **Step 3: Implement**

Add inside the class:

```js
async publishMedia(channel, spec) {
  this._validateSpec(spec);
  if (!channel?.instagram_account_id) {
    throw badRequest('Channel is missing instagram_account_id');
  }
  const token = await this._getPageToken(channel.organization_id);
  if (!token) {
    throw badRequest('No Meta access token configured for this organization');
  }
  const igUserId = channel.instagram_account_id;
  let containerId;
  switch (spec.type) {
    case 'image':
      containerId = await this._createImageContainer({ spec, igUserId, token });
      break;
    // other branches added in Tasks 9-12
    default:
      throw badRequest(`publishMedia does not yet handle type=${spec.type}`);
  }
  await this._waitForContainer({ igUserId, token, containerId });
  const mediaId = await this._publishContainer({ igUserId, token, containerId });
  return { containerId, mediaId };
}

async _createImageContainer({ spec, igUserId, token }) {
  const params = {
    ...this._buildCommonParams(spec),
    image_url: spec.image_url,
    access_token: token,
  };
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Image container created: ${data.id}`);
  return data.id;
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): publishMedia and _createImageContainer for type=image"
```

---

## Task 9: `_createVideoContainer` and `publishMedia` for video

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService.publishMedia — video (feed)', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('sends media_type=VIDEO and respects cover_url', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const out = await svc.publishMedia(channel, {
      type: 'video',
      video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg',
    });
    expect(out.mediaId).toBe('MED');

    const params = axios.post.mock.calls[0][2].params;
    expect(params).toMatchObject({
      media_type: 'VIDEO',
      video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg',
      access_token: 'TOK',
    });
    expect(params.share_to_feed).toBeUndefined();
    expect(params.audio_name).toBeUndefined();
  });

  it('uses thumb_offset when cover_url not provided', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    await svc.publishMedia(channel, {
      type: 'video', video_url: 'https://x/v.mp4', thumb_offset_ms: 1500,
    });
    expect(axios.post.mock.calls[0][2].params.thumb_offset).toBe(1500);
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (default branch in switch throws).

- [ ] **Step 3: Implement**

Add the case inside `publishMedia`'s switch:

```js
case 'video':
  containerId = await this._createVideoContainer({ spec, igUserId, token });
  break;
```

Add the helper:

```js
async _createVideoContainer({ spec, igUserId, token }) {
  const params = {
    ...this._buildCommonParams(spec),
    media_type: 'VIDEO',
    video_url: spec.video_url,
    access_token: token,
  };
  if (spec.cover_url) params.cover_url = spec.cover_url;
  if (spec.thumb_offset_ms !== undefined) params.thumb_offset = spec.thumb_offset_ms;
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Video container created: ${data.id}`);
  return data.id;
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _createVideoContainer for feed-only video"
```

---

## Task 10: `_createReelsContainer` and `publishMedia` for reels (replaces hardcoded path)

**Files:**
- Modify: `backend/src/services/PublishingService.js` — remove the existing `_createContainer` (the hardcoded REELS one) and add `_createReelsContainer`. Add the case in `publishMedia`. The existing `publish(channel, bundle)` keeps using the new internal helper so the legacy public method still works until Task 13 renames it.
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService.publishMedia — reels', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('sends media_type=REELS with reels-only fields', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    await svc.publishMedia(channel, {
      type: 'reels',
      video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg',
      share_to_feed: false,
      audio_name: 'My Anthem',
    });
    const params = axios.post.mock.calls[0][2].params;
    expect(params).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg',
      share_to_feed: 'false',
      audio_name: 'My Anthem',
      access_token: 'TOK',
    });
  });

  it('defaults share_to_feed to true when omitted', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    await svc.publishMedia(channel, { type: 'reels', video_url: 'https://x/v.mp4' });
    expect(axios.post.mock.calls[0][2].params.share_to_feed).toBe('true');
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (default branch).

- [ ] **Step 3: Implement**

Add the switch case:

```js
case 'reels':
  containerId = await this._createReelsContainer({ spec, igUserId, token });
  break;
```

Add the helper, and **delete** the existing private `_createContainer` (currently line 108-126):

```js
async _createReelsContainer({ spec, igUserId, token }) {
  const params = {
    ...this._buildCommonParams(spec),
    media_type: 'REELS',
    video_url: spec.video_url,
    share_to_feed: String(spec.share_to_feed ?? true),
    access_token: token,
  };
  if (spec.cover_url) params.cover_url = spec.cover_url;
  if (spec.thumb_offset_ms !== undefined) params.thumb_offset = spec.thumb_offset_ms;
  if (spec.audio_name) params.audio_name = spec.audio_name;
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Reels container created: ${data.id}`);
  return data.id;
}
```

Update the existing `publish(channel, bundle)` body — replace its call to `this._createContainer({...})` with a call to `_createReelsContainer` so the legacy method remains functional during the transition. Specifically replace this block in `publish`:

```js
// Step 1: Create media container (Reels)
const containerId = await this._createContainer({
  igUserId: channel.instagram_account_id,
  token,
  videoUrl: bundle.video_url,
  caption,
});
```

with:

```js
// Step 1: Create media container (Reels)
const containerId = await this._createReelsContainer({
  spec: {
    type: 'reels',
    video_url: bundle.video_url,
    caption: bundle.caption,
    hashtags: bundle.hashtags ?? [],
    cover_url: bundle.thumbnail_url ?? undefined,
  },
  igUserId: channel.instagram_account_id,
  token,
});
```

(`caption` local variable becomes unused — remove the `_buildCaption(bundle)` line; `_createReelsContainer` builds its own caption via `_buildCommonParams`.)

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — all PASS, including the existing legacy `publish(...)` Graph URL pinning test from Task 2.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _createReelsContainer with full reels feature surface"
```

---

## Task 11: `_createStoryContainer` and `publishMedia` for story

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService.publishMedia — story', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('image story sends media_type=STORIES + image_url', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    await svc.publishMedia(channel, { type: 'story', image_url: 'https://x/a.jpg' });
    const params = axios.post.mock.calls[0][2].params;
    expect(params).toMatchObject({
      media_type: 'STORIES',
      image_url: 'https://x/a.jpg',
      access_token: 'TOK',
    });
    expect(params.video_url).toBeUndefined();
  });

  it('video story sends media_type=STORIES + video_url', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    await svc.publishMedia(channel, { type: 'story', video_url: 'https://x/v.mp4' });
    const params = axios.post.mock.calls[0][2].params;
    expect(params).toMatchObject({
      media_type: 'STORIES',
      video_url: 'https://x/v.mp4',
      access_token: 'TOK',
    });
    expect(params.image_url).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (default branch).

- [ ] **Step 3: Implement**

Add the switch case:

```js
case 'story':
  containerId = await this._createStoryContainer({ spec, igUserId, token });
  break;
```

Add the helper:

```js
async _createStoryContainer({ spec, igUserId, token }) {
  const params = {
    media_type: 'STORIES',
    access_token: token,
  };
  if (spec.image_url) params.image_url = spec.image_url;
  if (spec.video_url) params.video_url = spec.video_url;
  if (Array.isArray(spec.user_tags) && spec.user_tags.length) {
    params.user_tags = JSON.stringify(spec.user_tags);
  }
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG container creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Story container created: ${data.id}`);
  return data.id;
}
```

Note: stories ignore caption/hashtags/collaborators/partnership — `_validateStorySpec` already rejects them, so we don't merge `_buildCommonParams` here.

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _createStoryContainer for image and video stories"
```

---

## Task 12: `_createCarouselContainer` and `publishMedia` for carousel

**Files:**
- Modify: `backend/src/services/PublishingService.js`
- Modify: `backend/tests/services/PublishingService.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('PublishingService.publishMedia — carousel', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('creates each child, polls each, then creates parent and publishes', async () => {
    // Order: child1 create, child2 create, child1 status, child2 status,
    // parent create, parent status, parent publish.
    axios.post
      .mockResolvedValueOnce({ data: { id: 'C1' } })   // child 1 create
      .mockResolvedValueOnce({ data: { id: 'C2' } })   // child 2 create
      .mockResolvedValueOnce({ data: { id: 'PAR' } })  // parent create
      .mockResolvedValueOnce({ data: { id: 'MED' } }); // publish
    axios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } })  // child 1
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } })  // child 2
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } }); // parent

    const out = await svc.publishMedia(channel, {
      type: 'carousel',
      caption: 'multi',
      children: [
        { kind: 'image', image_url: 'https://x/a.jpg' },
        { kind: 'video', video_url: 'https://x/v.mp4' },
      ],
    });

    expect(out).toEqual({ containerId: 'PAR', mediaId: 'MED' });

    // Child 1 — image, is_carousel_item=true
    expect(axios.post.mock.calls[0][2].params).toMatchObject({
      image_url: 'https://x/a.jpg',
      is_carousel_item: 'true',
      access_token: 'TOK',
    });
    // Child 2 — video, is_carousel_item=true
    expect(axios.post.mock.calls[1][2].params).toMatchObject({
      media_type: 'VIDEO',
      video_url: 'https://x/v.mp4',
      is_carousel_item: 'true',
      access_token: 'TOK',
    });
    // Parent — CAROUSEL with children
    expect(axios.post.mock.calls[2][2].params).toMatchObject({
      media_type: 'CAROUSEL',
      children: 'C1,C2',
      caption: 'multi',
      access_token: 'TOK',
    });
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (default branch).

- [ ] **Step 3: Implement**

Add the switch case:

```js
case 'carousel':
  containerId = await this._createCarouselContainer({ spec, igUserId, token });
  break;
```

Add the helper:

```js
async _createCarouselContainer({ spec, igUserId, token }) {
  // Stage 1 — create each child
  const childIds = [];
  for (const child of spec.children) {
    const childId = await this._createCarouselChildContainer({ child, igUserId, token });
    childIds.push(childId);
  }

  // Stage 2 — wait for each child to FINISHED
  for (const childId of childIds) {
    await this._waitForContainer({ igUserId, token, containerId: childId });
  }

  // Stage 3 — create the parent CAROUSEL container
  const params = {
    ...this._buildCommonParams(spec),
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    access_token: token,
  };
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG carousel parent creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Carousel parent container created: ${data.id} (children: ${childIds.join(',')})`);
  return data.id;
}

async _createCarouselChildContainer({ child, igUserId, token }) {
  const params = { is_carousel_item: 'true', access_token: token };
  if (child.kind === 'image') {
    params.image_url = child.image_url;
    if (Array.isArray(child.user_tags) && child.user_tags.length) {
      params.user_tags = JSON.stringify(child.user_tags);
    }
    if (child.alt_text) params.alt_text = child.alt_text;
  } else {
    params.media_type = 'VIDEO';
    params.video_url = child.video_url;
    if (Array.isArray(child.user_tags) && child.user_tags.length) {
      params.user_tags = JSON.stringify(child.user_tags);
    }
  }
  const { data } = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params, timeout: 30_000,
  });
  if (!data?.id) throw new Error(`IG carousel child creation failed: ${JSON.stringify(data)}`);
  console.log(`[Publishing] Carousel child created: ${data.id}`);
  return data.id;
}
```

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): _createCarouselContainer for 2..10 mixed children"
```

---

## Task 13: `publishBundle` wrapper

**Files:**
- Modify: `backend/src/services/PublishingService.js` — replace the existing `publish(channel, bundle)` (currently lines 17-83) with `publishBundle(channel, bundle)` that delegates to `publishMedia` and owns the `creative_bundles` lifecycle. Wire `bundle.thumbnail_url → cover_url`.
- Modify: `backend/tests/services/PublishingService.test.js` — add bundle-specific lifecycle tests; remove the legacy `svc.publish(...)` test from Task 2 and replace with `publishBundle`.

- [ ] **Step 1: Write the failing tests**

Add a new describe block (and adjust the older Task 2 test to use `publishBundle` — find the test added in Task 2 titled "uses env.META_API_VERSION" and rename `svc.publish(...)` to `svc.publishBundle(...)`):

```js
import { db } from '../../src/db/index.js';

vi.mock('../../src/db/index.js', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
  },
}));

describe('PublishingService.publishBundle', () => {
  let svc;
  const channel = { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' };
  const baseBundle = {
    id: 'b1', video_url: 'https://x/v.mp4', thumbnail_url: 'https://x/thumb.jpg',
    caption: 'hi', hashtags: ['a'],
  };

  beforeEach(() => {
    svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('TOK');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
  });

  it('publishes a bundle as a reels post and stamps render_job_id', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { id: 'CON' } })
      .mockResolvedValueOnce({ data: { id: 'MED' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });

    const result = await svc.publishBundle(channel, baseBundle);
    expect(result).toEqual({ published: true, mediaId: 'MED' });

    // Reels container POST received cover_url from bundle.thumbnail_url
    expect(axios.post.mock.calls[0][2].params.cover_url).toBe('https://x/thumb.jpg');
    expect(axios.post.mock.calls[0][2].params.media_type).toBe('REELS');
  });

  it('skips when channel has no instagram_account_id', async () => {
    const result = await svc.publishBundle({ ...channel, instagram_account_id: null }, baseBundle);
    expect(result).toEqual({ published: false, reason: expect.stringMatching(/instagram_account_id/i) });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('skips when bundle has no video_url', async () => {
    const result = await svc.publishBundle(channel, { ...baseBundle, video_url: null });
    expect(result.published).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rolls bundle status back on container ERROR', async () => {
    axios.post.mockResolvedValueOnce({ data: { id: 'CON' } });
    axios.get.mockResolvedValueOnce({ data: { status_code: 'ERROR' } });
    await expect(svc.publishBundle(channel, baseBundle)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

`npm run test -- tests/services/PublishingService.test.js` — fails (`publishBundle is not a function`).

- [ ] **Step 3: Implement**

Replace the entire existing `publish(channel, bundle)` method (currently at lines 17-83 of `PublishingService.js`) with:

```js
async publishBundle(channel, bundle) {
  if (!channel.instagram_account_id) {
    console.warn(`[Publishing] Channel ${channel.id} has no instagram_account_id — skipping publish`);
    return { published: false, reason: 'No instagram_account_id on channel' };
  }
  if (!bundle.video_url) {
    return { published: false, reason: 'Bundle has no video_url' };
  }
  // Token check — surface as skip rather than throw to preserve existing behavior.
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
      })
      .where(eq(creativeBundles.id, bundle.id));

    console.log(`[Publishing] Bundle ${bundle.id} published → IG media ID: ${mediaId}`);
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
```

The legacy `publish` is now removed. `publishMedia` already does its own `_getPageToken` call, so the bundle wrapper does an early "probe" check just to decide whether to skip-or-publish (matching today's warn-and-skip semantics).

- [ ] **Step 4: Run, expect pass**

`npm run test -- tests/services/PublishingService.test.js` — PASS, including the renamed Task 2 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/PublishingService.js backend/tests/services/PublishingService.test.js
git commit -m "feat(publishing): publishBundle wrapper delegating to publishMedia"
```

---

## Task 14: Update the 4 caller sites

**Files:**
- Modify: `backend/src/scheduler.js:191-194`
- Modify: `backend/src/services/ApprovalService.js:265-266`
- Modify: `backend/src/modules/publishing/routes.js:28`
- Modify: `backend/src/modules/publishing/routes.js:38`

- [ ] **Step 1: Update scheduler**

In `backend/src/scheduler.js`, change line 192 from:

```js
await publishingService.publish(channel, bundle).catch((err) => {
```

to:

```js
await publishingService.publishBundle(channel, bundle).catch((err) => {
```

- [ ] **Step 2: Update ApprovalService**

In `backend/src/services/ApprovalService.js`, change line 266 from:

```js
const result = await publishingService.publish(channel, bundle);
```

to:

```js
const result = await publishingService.publishBundle(channel, bundle);
```

- [ ] **Step 3: Update publishing routes (manual publish + retry)**

In `backend/src/modules/publishing/routes.js`, lines 28 and 38, change:

```js
const result = await publishingService.publish(channel, job);
```

to:

```js
const result = await publishingService.publishBundle(channel, job);
```

(Both occurrences.)

- [ ] **Step 4: Run lint and full test suite**

```bash
npm run lint
npm run test
```

Expected: lint shows only the pre-existing warnings already in the project; tests all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scheduler.js backend/src/services/ApprovalService.js backend/src/modules/publishing/routes.js
git commit -m "refactor(publishing): rename publish → publishBundle at all 4 call sites"
```

---

## Task 15: Lint pass and dev-server smoke

**Files:**
- (no edits expected — this is a verification task)

- [ ] **Step 1: Lint the changed files**

```bash
npm run lint -- src/services/PublishingService.js src/scheduler.js src/services/ApprovalService.js src/modules/publishing/routes.js
```

Expected: no NEW errors or warnings introduced (the pre-existing 1 error and 11 warnings in unrelated files are out of scope).

- [ ] **Step 2: Run the full test suite**

```bash
npm run test
```

Expected: all PublishingService tests PASS.

- [ ] **Step 3: Boot the dev server and confirm it starts cleanly**

```bash
npm run dev
```

Expected: the server starts without throwing, there are no missing-import errors, and the `/api/v1/publishing` route group registers (look for the route table in the boot log if logging is verbose, otherwise no errors is sufficient).

Stop the server (Ctrl+C) once it has booted.

- [ ] **Step 4: Manual sanity check (optional but recommended)**

If a real Meta account + IG-linked Page is wired in dev (`meta_ad_accounts` populated and a channel with `instagram_account_id` set), POST to `/api/v1/publishing/creatives/<id>/publish` for a `ready` bundle and confirm:
- The Graph URL hit is `https://graph.facebook.com/v21.0/...` (check logs).
- The bundle moves to `published` and `render_job_id` is populated with the IG media ID.

Skip if no real connection is available — phase B will provide one.

- [ ] **Step 5: Commit anything that changed**

If there were no edits, this task does not produce a commit. Otherwise:

```bash
git add -A
git commit -m "chore(publishing): post-implementation cleanup"
```

---

## Self-review checklist

After running the plan end-to-end, confirm against the spec ([2026-05-03-ig-publishing-multi-media-design.md](../specs/2026-05-03-ig-publishing-multi-media-design.md)):

- [ ] All 5 media types (`image`, `video`, `reels`, `carousel`, `story`) reachable via `publishMedia`.
- [ ] Every IG feature in §1/§5.2 of the spec is wired (`location_id`, `user_tags`, `collaborators`, `alt_text`, `cover_url`, `thumb_offset_ms`, `share_to_feed`, `audio_name`, paid partnership).
- [ ] `IG_API_BASE` uses `env.META_API_VERSION` (verifiable in axios.post mock URLs in tests).
- [ ] No DB schema changes; no frontend changes.
- [ ] `publishBundle` round-trip preserves the existing creative_bundles status flow.
- [ ] All 4 caller sites updated to `publishBundle`.
- [ ] Out-of-scope items (idempotency, per-type poll caps, rate limit handling, `product_tags`, resumable upload, `trial_params`) are NOT introduced.
