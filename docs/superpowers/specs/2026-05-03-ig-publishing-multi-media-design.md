# IG Publishing — Multi-Media-Type Support — Design Spec

**Date:** 2026-05-03
**Status:** Draft (pending user spec review)
**Phase:** A of 4 (Publishing → OAuth → Scheduling → Composer UI)
**Owner:** GrowthOS team

---

## 1. Goal

Extend the existing [`PublishingService`](../../../backend/src/services/PublishingService.js) so it can post **every media type the Instagram Content Publishing API exposes** — single image, feed video, Reels, carousel (mixed image/video, up to 10), and Stories — with the full set of optional features the API offers (location, user tags, collaborators, alt text, cover frame, share-to-feed, audio name, paid partnership labels). Backend only. No schema changes. Works on the existing token + channel + bundle plumbing.

While we're in the file, pin the Graph URL to `env.META_API_VERSION` (already configured, not currently used at this call site).

## 2. Non-goals (phase A)

- Idempotency / double-publish protection (deferred to phase D — scheduling).
- Per-media-type polling timeouts (deferred to phase D).
- Rate-limit handling and back-off (deferred).
- IG Shopping / `product_tags` (no shopping module exists yet).
- Trial Reels (`trial_params`).
- Resumable upload (`upload_type=resumable` / rupload protocol). Our flow uses public S3/CloudFront URLs — large-file local uploads only become relevant in phase C composer.
- Schema migrations on `creative_bundles` or any other table.
- Frontend changes — phase C territory; a UI direction is sketched in §10 only to confirm the backend's spec shape will support it.
- New callers. The existing 4 call sites (scheduler auto-publish, approval final-publish, manual `/publish` route, manual `/retry` route) keep working unchanged in behavior.

## 3. Background — what already exists

**Reused unchanged** (~70% of phase A is wiring through this code):

- [`PublishingService._waitForContainer`](../../../backend/src/services/PublishingService.js#L128) — generic poller. Already works for any container type (image, reels, carousel parent, story). No edit.
- [`PublishingService._publishContainer`](../../../backend/src/services/PublishingService.js#L153) — final `media_publish` call. Type-agnostic. No edit.
- [`PublishingService._getPageToken`](../../../backend/src/services/PublishingService.js#L170) — pulls and AES-256-GCM-decrypts a Page access token from `meta_ad_accounts`. No edit.
- [`PublishingService._sleep`](../../../backend/src/services/PublishingService.js#L205) — utility. No edit.
- The `creative_bundles` status lifecycle (`publishing` → `published` / rolled back to `ready`, IG media id stashed in `render_job_id`). Moved unchanged into the new `publishBundle` shim.
- The 4 call sites — all keep calling the service the same way; only the method name changes.

**Modified in place:**

- [`_buildCaption`](../../../backend/src/services/PublishingService.js#L196) — already truncates to 2200 chars. Add hashtag-count (≤30) and mention-count (≤20) validation; throw `badRequest` on overflow rather than silently truncating.
- [`IG_API_BASE`](../../../backend/src/services/PublishingService.js#L9) — change from `'https://graph.facebook.com'` to `` `${env.META_API_BASE_URL}/${env.META_API_VERSION}` `` (e.g. `https://graph.facebook.com/v21.0`). All Graph URLs in the service flow through this constant.

**Brand new for phase A:**

- `publishMedia(channel, spec) → { mediaId, containerId }` — public method. Validates the spec, dispatches to the right container builder, runs the existing poll → publish flow. **No DB writes.**
- `_validateSpec(spec)` — per-type validation; throws `AppError` (400) on bad input.
- Five type-specific container builders, each ~20-40 lines: `_createImageContainer`, `_createVideoContainer`, `_createReelsContainer`, `_createCarouselContainer`, `_createStoryContainer`.
- `_buildCommonParams(spec)` — produces the params shared across types (caption, location_id, user_tags JSON, collaborators JSON, paid-partnership pair, alt_text).
- `publishBundle(channel, bundle) → { published, mediaId }` — replaces today's [`publish(channel, bundle)`](../../../backend/src/services/PublishingService.js#L17). Same body, with two changes: (1) builds a `reels` `MediaSpec` from the bundle and delegates to `publishMedia`, (2) wires `bundle.thumbnail_url → cover_url` (currently dropped on the floor at publish time).

## 4. IG API rules we design against

Source: [POST /<IG_USER_ID>/media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/), [Content Publishing overview](https://developers.facebook.com/docs/instagram-platform/content-publishing/), as of v21.0.

1. **Media types** that we support: `IMAGE` (default, no media_type param needed), `VIDEO` (feed video, no Reels-tab placement), `REELS`, `CAROUSEL`, `STORIES`. `VIDEO` and `REELS` are genuinely different — `REELS` with `share_to_feed=true` appears in *both* feed and the Reels tab; `VIDEO` is feed-only and never enters the Reels tab. Reels-only params (`audio_name`, `share_to_feed`) don't apply to `VIDEO`.
2. **Caption limits**: 2200 chars, 30 hashtags, 20 @-mentions. Carousel children cannot have captions; alt_text is image-only; story has no caption at all.
3. **Carousel** is two-stage: each child posted separately with `is_carousel_item=true` (children must reach `FINISHED` before parent), then a parent with `media_type=CAROUSEL&children=ID1,ID2,...`. 2 to 10 children. Mixed image/video allowed; Reels not allowed as children.
4. **Reels-specific**: `cover_url` takes precedence over `thumb_offset` if both given. `share_to_feed` defaults true. `audio_name` can only be renamed once.
5. **User tags** are JSON-encoded array. Image: each tag MUST include `x` and `y` (both 0..1). Reels/Story: just `username`.
6. **Collaborators**: max 3 IG usernames; JSON-encoded array of strings. Not supported on stories.
7. **Paid partnership**: `is_paid_partnership=true` enables the label; `branded_content_sponsor_ids` (array, max 2) names the sponsor IG user IDs. Not on stories.
8. **Polling**: GET `/{container_id}?fields=status_code` returns one of `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, `PUBLISHED`. We treat `FINISHED` as "ready to publish"; `ERROR` and `EXPIRED` are terminal failures; everything else is a continue-polling signal. Existing 6-min cap (24 × 15s) stays — per-type caps are phase D's problem.
9. **Rate limit**: 100 published posts per IG user per rolling 24h. Carousels count as 1. Phase A does not handle the cap (out of scope §2); a Graph error code surfaces as a thrown error from the existing flow.
10. **Permissions** the token must already hold (handled by phase B): `instagram_content_publish`, `instagram_basic`, `pages_show_list`, `pages_read_engagement`. Phase A assumes the token from `meta_ad_accounts.page_access_token_encrypted` is correct — same assumption as today.

---

## 5. Architecture

### 5.1 Public surface after phase A

```js
// New — pure, no DB writes. Callable from any future entry point (composer, scheduler).
publishingService.publishMedia(channel, spec) → { mediaId, containerId }

// Replaces today's publish(channel, bundle). Same external behavior; rename
// for clarity now that there's a generic counterpart. Owns creative_bundles
// status transitions.
publishingService.publishBundle(channel, bundle) → { published, mediaId }

// Existing, unchanged: listJobs(orgId), getJob(bundleId, orgId).
```

### 5.2 `MediaSpec` shape (TypeScript-style, JSDoc'd in JS)

```ts
type UserTag = {
  username: string;
  x?: number;     // 0..1, REQUIRED for image
  y?: number;     // 0..1, REQUIRED for image
};

type Partnership = {
  is_paid_partnership: true;
  sponsor_ig_user_ids?: string[];   // ≤2
};

type CarouselChild = {
  kind: 'image' | 'video';
  image_url?: string;
  video_url?: string;
  user_tags?: UserTag[];
  alt_text?: string;                // image children only
};

type MediaSpec =
  | {
      type: 'image';
      image_url: string;
      caption?: string;
      hashtags?: string[];
      location_id?: string;
      user_tags?: UserTag[];
      collaborators?: string[];     // ≤3
      alt_text?: string;            // ≤1000 chars
      partnership?: Partnership;
    }
  | {
      type: 'video';                // feed-only video; not placed in Reels tab
      video_url: string;
      caption?: string;
      hashtags?: string[];
      location_id?: string;
      user_tags?: UserTag[];
      collaborators?: string[];
      cover_url?: string;
      thumb_offset_ms?: number;
      partnership?: Partnership;
    }
  | {
      type: 'reels';
      video_url: string;
      caption?: string;
      hashtags?: string[];
      location_id?: string;
      user_tags?: UserTag[];
      collaborators?: string[];
      cover_url?: string;
      thumb_offset_ms?: number;
      share_to_feed?: boolean;      // defaults true; reels-only
      audio_name?: string;          // reels-only
      partnership?: Partnership;
    }
  | {
      type: 'carousel';
      children: CarouselChild[];    // 2..10
      caption?: string;
      hashtags?: string[];
      collaborators?: string[];
      partnership?: Partnership;
      // No location_id / user_tags on the parent — only on children.
    }
  | {
      type: 'story';
      image_url?: string;
      video_url?: string;           // exactly one of image_url / video_url
      user_tags?: UserTag[];
      // No caption, no hashtags, no collaborators, no partnership — IG doesn't
      // accept them on stories.
    };
```

### 5.3 Internal flow

```
publishMedia(channel, spec)
 ├─ _validateSpec(spec)                                    // throws AppError 400 on bad input
 ├─ token = await _getPageToken(channel.organization_id)   // existing helper
 ├─ containerId = await dispatch:
 │     image    → _createImageContainer(spec, ig, token)
 │     video    → _createVideoContainer(spec, ig, token)
 │     reels    → _createReelsContainer(spec, ig, token)
 │     story    → _createStoryContainer(spec, ig, token)
 │     carousel → _createCarouselContainer(spec, ig, token):
 │                  ├─ for each child: _createImageContainer or _createVideoChildContainer
 │                  │     with is_carousel_item=true → childId
 │                  ├─ for each childId: await _waitForContainer
 │                  └─ POST media_type=CAROUSEL&children=ID1,ID2,... → parentId
 ├─ await _waitForContainer({ containerId, token })        // existing poller
 └─ mediaId = await _publishContainer({ containerId, token })
 → return { mediaId, containerId }
```

### 5.4 `publishBundle(channel, bundle)` — body

Equivalent to today's `publish(channel, bundle)`. Reads:

```js
const spec = {
  type: 'reels',
  video_url: bundle.video_url,
  cover_url: bundle.thumbnail_url ?? undefined,
  caption: bundle.caption,
  hashtags: bundle.hashtags ?? [],
};
const { mediaId } = await this.publishMedia(channel, spec);
// existing creative_bundles updates: status='published', render_job_id=mediaId.
```

Error handling and status rollback identical to today.

---

## 6. Validation rules (`_validateSpec`)

Each violation throws `badRequest(message, { details })` from [`backend/src/lib/errors.js`](../../../backend/src/lib/errors.js).

**All types:**
- `type` must be one of `image | video | reels | carousel | story`.
- `caption + '\n' + hashtagBlock` ≤ 2200 chars (existing truncation kept as a fallback for over-2200 input — but if user sent ≥2201 we throw, since silent truncation is surprising).
- `hashtags.length` ≤ 30.
- Mention count in caption ≤ 20 (count `@` followed by a word char run).
- `collaborators.length` ≤ 3 if present.
- `partnership.sponsor_ig_user_ids.length` ≤ 2 if present.

**Image:**
- `image_url` required, must look like an http(s) URL.
- `alt_text` ≤ 1000 chars if present.
- Each `user_tags[i]` requires both `x` and `y` in `[0, 1]`.

**Video (feed video):**
- `video_url` required, http(s).
- `cover_url` (http(s)) or `thumb_offset_ms` (≥0) both optional. If both given, prefer `cover_url`, log a debug note.
- Reject `share_to_feed` and `audio_name` if accidentally passed (defensive — these are reels-only).

**Reels:**
- `video_url` required, http(s).
- Either `cover_url` (http(s)) or `thumb_offset_ms` (≥0), not both required (cover_url wins per Graph). If both given, prefer `cover_url`, log a debug note.
- `audio_name` ≤ 30 chars if present (IG soft limit).

**Carousel:**
- `children.length` between 2 and 10.
- Each child must declare `kind` and the matching URL (`image_url` for image, `video_url` for video).
- `user_tags` on a video child: just `username` (x/y not required).

**Story:**
- Exactly one of `image_url` or `video_url`.
- Reject `caption`, `hashtags`, `collaborators`, `partnership` if accidentally passed (defensive — points to a caller bug).

---

## 7. API version pinning

Single-line conceptual change at the top of the file:

```js
// before
const IG_API_BASE = 'https://graph.facebook.com';
// after
const IG_API_BASE = `${env.META_API_BASE_URL}/${env.META_API_VERSION}`;
```

`env.META_API_BASE_URL` defaults to `https://graph.facebook.com` and `env.META_API_VERSION` defaults to `v21.0` (already in [`env.js`](../../../backend/src/config/env.js#L37-L38)). All five Graph endpoints in this file flow through `IG_API_BASE`. Behavioral diff: requests now hit `/v21.0/...` explicitly instead of relying on Meta's unversioned default (which they deprecate aggressively).

---

## 8. Error handling

| Layer | Behavior |
|---|---|
| Validation (pre-network) | `AppError` 400 with `code: 'VALIDATION_ERROR'` and `details` describing the offending field. |
| Token missing / channel missing IG ID | Existing `{ published: false, reason: '...' }` warn-and-skip path **stays only on `publishBundle`**. `publishMedia` throws — calling code that doesn't have a `creative_bundles` row to update has nothing to "skip" gracefully. |
| Graph API error on container POST | Throw `Error(`IG container creation failed: ${graphErrorMessage} (code=${code}/${subcode})`)`. The route layer turns this into a 500. |
| Container enters `ERROR` / `EXPIRED` during polling | Existing throw stays. |
| Polling exceeds 6 min (24 × 15s) | Existing throw stays. Per-type caps deferred. |
| `publishBundle` catches any thrown error | Rolls bundle status back to `ready`, rethrows so callers can surface the failure. Identical to today. |

Logging continues to use `console.log` / `console.warn` / `console.error` to match the rest of `PublishingService`. Migrating this file to a structured logger is out of scope.

---

## 9. Testing

Vitest is configured but `backend/src/` has zero tests today. Phase A introduces the first one.

**File:** `backend/tests/services/PublishingService.test.js`

**Approach:**
- Mock `axios` via `vi.mock('axios')`. No real Graph traffic.
- For each media type: assert (a) the exact Graph URL hit (proves version pinning), (b) the exact param payload, (c) that the poll → publish flow runs and returns `{ mediaId, containerId }`.

**Cases covered:**
1. `publishMedia` rejects unknown `type`.
2. Image: caption-only, full-feature (location, user_tags, collaborators, alt_text, partnership), and validation failures (missing url, bad x/y, oversize alt_text).
3. Video (feed-only): with `cover_url`, with `thumb_offset_ms`, with location/user_tags/collaborators. Validation failures (no video_url; reels-only fields like `share_to_feed` or `audio_name` are rejected).
4. Reels: with `cover_url`, with `thumb_offset_ms`, with `share_to_feed=false`, with `audio_name`. Validation failures (no video_url, both cover & offset is OK — cover wins).
5. Carousel: 2 children (1 image + 1 video), 10 children boundary, 1-child rejection, 11-child rejection, child without matching URL.
6. Story: image-only, video-only, both rejected, neither rejected.
7. Polling state machine: `IN_PROGRESS` → `FINISHED`, `ERROR` throws, `EXPIRED` throws, max-attempts throws.
8. `publishBundle`: existing behavior round-trip — status `publishing` → `published`, `render_job_id` set, rollback on failure.
9. Caption validation: 2201 chars rejected, 31 hashtags rejected, 21 mentions rejected.

Real-IG smoke test deferred to phase B (when OAuth issues a real token).

---

## 10. Forward-looking UI direction (phase C — *not built in phase A*)

**Why this section exists:** the user asked for confirmation that the backend will support a clean composer UI. Every form field below maps 1:1 to a `MediaSpec` field in §5.2 — no client-side translation needed.

**Sidebar:** a new "Instagram" item in [`Sidebar.tsx`](../../../frontend/src/components/layout/Sidebar.tsx) between **Approvals** and **Creatives**. Use `PhotoCameraOutlined` (or `InstagramOutlined`).

**Page tabs (sub-routes under `/instagram`):**

1. **Connections** — channels with their IG connection state; "Connect Instagram" CTA per channel (powered by phase B).
2. **Composer** — two-pane:
    - **Left form:** channel picker → segmented control (Image / Video / Reels / Carousel / Story) → media block (drag-drop S3 upload OR paste URL; carousel = sortable children list with per-child user tags; video and reels = optional cover frame upload OR `thumb_offset` slider on the video) → caption textarea with live `2200 / 30 # / 20 @` counter → collapsible "Advanced" panel (location autocomplete, click-to-place user tags for image, collaborators chip input ≤3, alt text for image ≤1000, audio name for reels-only, share-to-feed toggle for reels-only, paid partnership toggle with sponsor selector).
    - **Right preview:** IG-style mockup that updates live, in a `GlassCard`.
    - **Action bar:** "Save draft" / "Schedule…" / "Post now".
3. **Posts** — grid of published posts (status, IG link, basic metrics from a future insights call).
4. **Scheduled** — phase D table grouped by date with edit/cancel.

**Style matches existing:** `GlassCard`, `PageHeader`, `alpha('#22D3EE', …)` accent, MUI v5 `slotProps`, TanStack Query `qk` pattern, `adsApi`-style API client.

**Implication for phase A:** none — but the spec shape is what unblocks phase C from going live with real publishing.

---

## 11. Sequencing inside phase A

Suggested implementation order (the writing-plans pass will refine):

1. Add the `MediaSpec` JSDoc typedefs and `_validateSpec` (no behavior change yet — just compile-clean).
2. Pin `IG_API_BASE` to versioned URL.
3. Add `_buildCommonParams`.
4. Add `_createImageContainer`, `_createVideoContainer`, `_createReelsContainer`, `_createStoryContainer`. Wire into a stub `publishMedia` that handles only the non-carousel branches.
5. Add `_createCarouselContainer` (the only multi-step one).
6. Add `publishBundle` (rename + wires `cover_url` from `thumbnail_url`).
7. Update the 4 caller sites to use `publishBundle`.
8. Add tests.
9. Lint + sanity-run the dev server.

Caller updates and the bundle wrapper come last so the existing flow keeps working until the new code is fully exercised by tests.

---

## 12. Open questions / assumptions

- **Mention validation regex:** counting `@` followed by `[A-Za-z0-9._]+` runs. IG's actual mention parsing is fuzzier; this is a conservative guard, not a perfect mirror.
- **Caption truncation behavior:** I've chosen to *throw* on >2200 chars rather than truncate, which is a behavior change vs. today's silent slice at line 202. If you prefer silent truncation, flag it on review.
- **Story limits:** the API doesn't enforce caption rejection (just ignores it), but we reject defensively. Same for `hashtags` etc. on story.
- **`audio_name` length:** 30-char cap is a documented soft limit; if Graph rejects something shorter, we surface the Graph error.

---

## 13. Out-of-band notes

- Pre-existing dead env entries to be aware of (NOT touched in phase A): `EMAIL_FROM=approvals@example.com` in `.env` is read as `FROM_EMAIL` in `env.js` — already flagged in the Brevo email work earlier today.
- `@aws-sdk/client-sesv2` was added during a brief SES experiment that was reverted in favor of Brevo. Still in `package.json`. Not relevant to phase A; uninstall when convenient.
