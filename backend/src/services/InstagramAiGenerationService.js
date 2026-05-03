import { badRequest, notFound } from '../lib/errors.js';

// AI generation for Instagram posts.
//
// Two-step flow, mirrors the existing AdsService.generateAdImage pattern:
//   1) GPT-4o-mini takes a short user brief + the post type, expands it into
//      (a) the structured payload the image microservice expects AND
//      (b) the caption + hashtags to display in the composer for review.
//   2) We POST (a) to the AI image microservice; it generates a JPEG, uploads
//      to its own S3, and returns a public URL. We hand the URL back along
//      with the caption + hashtags for the user to review/edit before posting.
//
// Why a single GPT call: the image's mood and the caption's tone benefit from
// being authored together — splitting into two calls produces caption/visual
// drift. JSON mode keeps the parsing deterministic.
//
// Reels are intentionally unsupported: the microservice generates images
// only. Carousel generation is per-child — the composer calls this N times.

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

// IG image specs per type (from Meta's Content Publishing reference):
//   - Square feed post:    1080×1080 (1:1)   — also accepted: 4:5, 1.91:1
//   - Story:               1080×1920 (9:16)  STRICTLY 9:16 or container ERRORs
//   - Carousel image:      1080×1080 (1:1)   — all children must share aspect
// 1:1 is the safest universal default. Stories require 9:16. We hardcode JPEG
// because PNG is rejected by IG's /media endpoint with subcode 2207003.
const ASPECT_BY_TYPE = {
  image: '1:1',
  carousel: '1:1',
  story: '9:16',
};
const ALLOWED_TYPES = new Set(Object.keys(ASPECT_BY_TYPE));

const MAX_CAPTION_CHARS = 2200;
const MAX_HASHTAGS = 30;

function sanitizeHashtag(raw) {
  if (typeof raw !== 'string') return null;
  // Strip leading hashes/whitespace; allow letters, digits, underscore, period.
  const cleaned = raw.replace(/^#+/, '').trim();
  if (!cleaned) return null;
  // Spaces inside a hashtag aren't valid on IG — collapse them.
  const oneToken = cleaned.split(/\s+/)[0];
  // Drop any character outside the IG-accepted set.
  const safe = oneToken.replace(/[^\p{L}\p{N}_.]/gu, '');
  return safe || null;
}

function dedupeHashtags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

export class InstagramAiGenerationService {
  constructor({ logger, instagramAccountRepository, aiImageClient }) {
    this.logger = logger;
    this.repository = instagramAccountRepository;
    this.aiImageClient = aiImageClient;
  }

  async generatePost({ organizationId, accountId, prompt, postType = 'image', contextHint }) {
    if (!organizationId) throw badRequest('organizationId required');
    if (!accountId) throw badRequest('accountId required');
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      throw badRequest('Prompt must be at least 5 characters.');
    }
    if (!ALLOWED_TYPES.has(postType)) {
      throw badRequest(
        `AI generation is supported for image, carousel, and story posts. "${postType}" requires a video file.`,
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('OpenAI API key not configured.'), { statusCode: 500 });
    }

    const account = await this.repository.findById(accountId);
    if (!account || account.organization_id !== organizationId) {
      throw notFound('Instagram account not found');
    }
    if (!account.is_active) {
      throw badRequest('Instagram account is not active — reconnect to use AI generation.');
    }

    const aspectRatio = ASPECT_BY_TYPE[postType];
    const businessName = account.ig_name || account.ig_username || 'Our brand';
    const handle = account.ig_username ? `@${account.ig_username}` : null;

    // ── Step 1: GPT-4o-mini → image payload + caption + hashtags ─────────────
    const refined = await this._refineWithGpt({
      apiKey,
      userPrompt: prompt,
      postType,
      aspectRatio,
      businessName,
      handle,
      contextHint,
    });

    // ── Step 2: image microservice → public JPEG URL ─────────────────────────
    const microPayload = {
      ...refined.image_payload,
      // Force the values that aren't safe to delegate to the LLM:
      aspect_ratio: aspectRatio,             // postType-correct, not LLM-guessed
      output_format: 'jpeg',                 // IG requires JPEG
      upload_to_s3: true,
      organization_id: organizationId,       // microservice S3-key namespacing
    };

    let microResponse;
    try {
      microResponse = await this.aiImageClient.generate(microPayload);
    } catch (err) {
      // The microservice client throws { code, message } already. Re-shape
      // to AppError-ish so the controller's existing handler maps it cleanly.
      const code = Number.isInteger(err?.code) ? err.code : 502;
      throw Object.assign(new Error(err?.message || 'Image generation failed.'), {
        statusCode: code,
      });
    }

    const imageUrl = microResponse?.image_url;
    if (!imageUrl || typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) {
      throw Object.assign(
        new Error('Image microservice did not return a usable URL.'),
        { statusCode: 502 },
      );
    }

    return {
      image_url: imageUrl,
      caption: refined.caption,
      hashtags: refined.hashtags,
      post_type: postType,
      aspect_ratio: aspectRatio,
      width: microResponse.width ?? null,
      height: microResponse.height ?? null,
      mime_type: microResponse.mime_type ?? 'image/jpeg',
      // Echo the final prompt the microservice actually used (it may have
      // been sanitized further). Useful for "regenerate with tweaks" UX.
      refined_prompt: microResponse.final_prompt || refined.image_payload.prompt,
      // The microservice URL is what publish + cleanup use. Surface it
      // explicitly so the frontend can pass it back as cleanup_ai_urls.
      ai_microservice_url: imageUrl,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal: GPT-4o-mini refinement. Returns { image_payload, caption, hashtags }.
  // ──────────────────────────────────────────────────────────────────────────
  async _refineWithGpt({ apiKey, userPrompt, postType, aspectRatio, businessName, handle, contextHint }) {
    const ctx = contextHint && typeof contextHint === 'object' ? contextHint : {};
    const ctxLines = [
      ctx.industry ? `Industry: ${ctx.industry}` : null,
      ctx.brand_description ? `Brand: ${ctx.brand_description}` : null,
      ctx.target_audience ? `Audience: ${ctx.target_audience}` : null,
      ctx.tone ? `Tone: ${ctx.tone}` : null,
    ].filter(Boolean).join('\n');

    const typeBlurb = {
      image: 'A single feed post (square 1:1). Caption can be conversational and detailed.',
      carousel: 'One slide of a carousel. Caption applies to the whole carousel — keep it broad.',
      story: 'A vertical 9:16 story. Caption is unused (stories have no caption) — return an empty string for it.',
    }[postType];

    const system = `You are a senior Instagram social-media director for ${businessName}${handle ? ` (${handle})` : ''}.
The user gives you a short brief; you produce (a) a precise image-generation payload AND (b) a ready-to-post caption and hashtag set.

POST TYPE: ${postType} — ${typeBlurb}
ASPECT RATIO: ${aspectRatio} (locked — do not change in the payload, the server enforces it).
${ctxLines ? `\nCONTEXT (use implicitly to inform mood, voice, framing — DO NOT mention literal context phrases in the image):\n${ctxLines}\n` : ''}
Reply with VALID JSON ONLY matching this schema. No prose, no markdown.

{
  "image_payload": {
    "prompt": "Detailed visual description (60-180 words) — describe scene, subjects, lighting, composition, color palette. NEVER include any readable text inside the image (no headlines, no offers).",
    "business_name": "${businessName}",
    "tagline": "",
    "call_to_action": "LEARN_MORE",
    "campaign_type": "social_media_post",
    "target_audience": "Audience descriptor in 5-12 words",
    "brand_colors": ["#hex","#hex","#hex"],
    "logo_position": "bottom-right",
    "style": "photorealistic | cinematic | flat_illustration | 3d_render | minimal",
    "mood": "Two-word mood descriptor (e.g. \\"calm and inviting\\")"
  },
  "caption": "${postType === 'story' ? '(empty string for stories)' : 'A natural Instagram caption — 1 to 4 short paragraphs, no emoji spam. Up to 2200 chars total. Do not embed hashtags inline; they go in the hashtags array.'}",
  "hashtags": [${postType === 'story' ? '' : '"3 to 12 relevant hashtags, no leading #, no spaces, no special characters"'}]
}

RULES:
- Never put readable text inside the image (no headlines, no offers, no logos with text).
- Pick brand_colors from typical industry palettes if no hint is given.
- Keep the caption authentic — sound like a person, not an ad. No "🚀 Don't miss out!"-tier copy.
- Hashtags: lowercase, no leading #, no spaces. Mix of broad + niche tags. ${postType === 'story' ? 'For story posts, return an empty hashtags array.' : ''}
- Default style to "photorealistic" unless the brief explicitly suggests otherwise.`;

    let resp;
    try {
      resp = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1200,
        }),
      });
    } catch (err) {
      throw Object.assign(new Error(`OpenAI request failed: ${err.message}`), {
        statusCode: 502,
      });
    }

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      this.logger?.error?.({ message: '[Instagram.AI] OpenAI refine failed', body });
      const reason = body?.error?.message || `OpenAI returned ${resp.status}`;
      throw Object.assign(new Error(reason), { statusCode: 502 });
    }

    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    let parsed;
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      this.logger?.warn?.({ message: '[Instagram.AI] Could not parse JSON', text });
      throw Object.assign(
        new Error('AI returned an invalid response — try rephrasing your brief.'),
        { statusCode: 502 },
      );
    }

    return this._normalizeRefined({ parsed, userPrompt, postType, businessName });
  }

  _normalizeRefined({ parsed, userPrompt, postType, businessName }) {
    const rawImg = parsed?.image_payload || {};

    const allowedStyles = ['photorealistic', 'cinematic', 'flat_illustration', '3d_render', 'minimal'];
    const image_payload = {
      prompt: String(rawImg.prompt || userPrompt).slice(0, 2000),
      business_name: String(rawImg.business_name || businessName).slice(0, 80),
      tagline: rawImg.tagline ? String(rawImg.tagline).slice(0, 60) : '',
      call_to_action: String(rawImg.call_to_action || 'LEARN_MORE'),
      campaign_type: rawImg.campaign_type || 'social_media_post',
      target_audience: String(rawImg.target_audience || '').slice(0, 120),
      brand_colors:
        Array.isArray(rawImg.brand_colors) && rawImg.brand_colors.length > 0
          ? rawImg.brand_colors.slice(0, 5).map((c) => String(c).slice(0, 12))
          : ['#1A1A1A', '#FFFFFF'],
      logo_position: rawImg.logo_position || 'bottom-right',
      style: allowedStyles.includes(rawImg.style) ? rawImg.style : 'photorealistic',
      mood: String(rawImg.mood || 'natural and inviting').slice(0, 60),
    };

    // Caption: stories carry no caption. For everything else clamp to IG max.
    let caption = '';
    if (postType !== 'story') {
      caption = typeof parsed?.caption === 'string' ? parsed.caption.trim() : '';
      // Defensive — strip any stray hashtags the model dropped inline; we
      // surface those separately so the frontend can render chips.
      caption = caption.replace(/(?:^|\s)#[\p{L}\p{N}_.]+/gu, '').trim();
      if (caption.length > MAX_CAPTION_CHARS) {
        caption = caption.slice(0, MAX_CAPTION_CHARS - 1).trimEnd() + '…';
      }
    }

    // Hashtags: sanitize, dedupe, cap.
    let hashtags = [];
    if (postType !== 'story') {
      const rawTags = Array.isArray(parsed?.hashtags) ? parsed.hashtags : [];
      hashtags = dedupeHashtags(rawTags.map(sanitizeHashtag).filter(Boolean)).slice(0, MAX_HASHTAGS);
    }

    return { image_payload, caption, hashtags };
  }
}
