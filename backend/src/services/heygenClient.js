/**
 * HeyGen — two paths:
 * - v3 Video Agent (API key + prompt): https://developers.heygen.com/docs/quick-start
 * - v2 Avatar + TTS (API key + avatar_id + voice_id): https://docs.heygen.com/reference/create-an-avatar-video-v2
 */

const HEYGEN_API = 'https://api.heygen.com';

function heyGenV3Headers(apiKey) {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  };
}

/** Short MP4 loops acceptable as HeyGen background `url` when their CDN allows remote URLs. */
const STOCK_BACKGROUND_CLIPS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
];

function hashScript(s) {
  const str = typeof s === 'string' ? s : '';
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickStockBackground(script) {
  const i = hashScript(script) % STOCK_BACKGROUND_CLIPS.length;
  return STOCK_BACKGROUND_CLIPS[i];
}

function parseHeyGenPollSettings() {
  const pollIntervalMs = parseInt(process.env.HEYGEN_POLL_INTERVAL_MS?.trim() || '4000', 10);
  const pollMaxAttempts = parseInt(process.env.HEYGEN_POLL_MAX_ATTEMPTS?.trim() || '450', 10);
  const requestTimeoutMs = parseInt(process.env.HEYGEN_REQUEST_TIMEOUT_MS?.trim() || '120000', 10);
  return {
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? Math.min(30_000, Math.max(2000, pollIntervalMs)) : 4000,
    pollMaxAttempts: Number.isFinite(pollMaxAttempts) ? Math.min(900, Math.max(30, pollMaxAttempts)) : 450,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? Math.min(300_000, Math.max(30_000, requestTimeoutMs)) : 120_000,
  };
}

/**
 * @returns {null | ({
 *   mode: 'video_agent_v3',
 *   apiKey: string,
 *   callbackUrl: string | null,
 *   orientation: 'portrait' | 'landscape' | null,
 *   videoAgentMinSeconds: number,
 *   videoAgentMaxSeconds: number,
 *   pollIntervalMs: number,
 *   pollMaxAttempts: number,
 *   requestTimeoutMs: number,
 * } | {
 *   mode: 'avatar_v2',
 *   apiKey: string,
 *   avatarId: string,
 *   voiceId: string,
 *   caption: boolean,
 *   dimension: { width: number, height: number },
 *   backgroundColor: string,
 *   backgroundVideoUrl: string | null,
 *   useStockVideoBackground: boolean,
 *   pollIntervalMs: number,
 *   pollMaxAttempts: number,
 *   requestTimeoutMs: number,
 * })}
 */
export function resolveHeyGenConfig() {
  const apiKey = process.env.HEYGEN_API_KEY?.trim();
  if (!apiKey) return null;

  const useVideoAgent =
    process.env.HEYGEN_USE_VIDEO_AGENT === 'true' || process.env.HEYGEN_USE_VIDEO_AGENT === '1';
  const poll = parseHeyGenPollSettings();

  if (useVideoAgent) {
    const callbackUrl = process.env.HEYGEN_CALLBACK_URL?.trim() || null;
    const orientationRaw = process.env.HEYGEN_VIDEO_AGENT_ORIENTATION?.trim().toLowerCase();
    const orientation =
      orientationRaw === 'landscape' || orientationRaw === 'portrait' ? orientationRaw : null;

    const minSecRaw = parseInt(process.env.HEYGEN_VIDEO_AGENT_MIN_SECONDS?.trim() || '12', 10);
    const maxSecRaw = parseInt(process.env.HEYGEN_VIDEO_AGENT_MAX_SECONDS?.trim() || '60', 10);
    const videoAgentMinSeconds = Number.isFinite(minSecRaw) ? Math.min(120, Math.max(8, minSecRaw)) : 12;
    let videoAgentMaxSeconds = Number.isFinite(maxSecRaw) ? Math.min(180, Math.max(videoAgentMinSeconds, maxSecRaw)) : 60;

    return {
      mode: 'video_agent_v3',
      apiKey,
      callbackUrl,
      orientation,
      videoAgentMinSeconds,
      videoAgentMaxSeconds,
      ...poll,
    };
  }

  const avatarId = process.env.HEYGEN_AVATAR_ID?.trim();
  const voiceId = process.env.HEYGEN_VOICE_ID?.trim();
  if (!avatarId || !voiceId) return null;

  const explicitBg = process.env.HEYGEN_BACKGROUND_VIDEO_URL?.trim();
  const useStockLoop =
    explicitBg
      ? false
      : process.env.HEYGEN_USE_STOCK_VIDEO_BACKGROUND === 'true' ||
        process.env.HEYGEN_USE_STOCK_VIDEO_BACKGROUND === '1';

  return {
    mode: 'avatar_v2',
    apiKey,
    avatarId,
    voiceId,
    caption: process.env.HEYGEN_CAPTIONS !== 'false' && process.env.HEYGEN_CAPTIONS !== '0',
    dimension: {
      width: Number(process.env.HEYGEN_VIDEO_WIDTH || 1080),
      height: Number(process.env.HEYGEN_VIDEO_HEIGHT || 1920),
    },
    backgroundColor: process.env.HEYGEN_BACKGROUND_COLOR?.trim() || '#101018',
    backgroundVideoUrl: explicitBg || null,
    useStockVideoBackground: useStockLoop,
    ...poll,
  };
}

/**
 * @param {string} script
 * @param {string} hook
 * @param {string} caption
 * @param {Extract<ReturnType<typeof resolveHeyGenConfig>, { mode: 'avatar_v2' }>} cfg
 */
export function buildHeyGenVideoPayload(script, hook, caption, cfg) {
  if (cfg.mode !== 'avatar_v2') {
    throw new Error('buildHeyGenVideoPayload requires avatar_v2 config');
  }

  const parts = [hook, script, caption].filter((x) => typeof x === 'string' && x.trim());
  const inputText = parts.join('\n\n').trim().slice(0, 4800);

  let background;
  const videoUrl =
    cfg.backgroundVideoUrl ||
    (cfg.useStockVideoBackground ? pickStockBackground(script) : null);

  if (videoUrl) {
    background = {
      type: 'video',
      url: videoUrl,
      fit: 'cover',
      play_style: 'loop',
    };
  } else {
    background = {
      type: 'color',
      value: cfg.backgroundColor,
    };
  }

  return {
    caption: cfg.caption,
    dimension: cfg.dimension,
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: cfg.avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          voice_id: cfg.voiceId,
          input_text: inputText,
          speed: 1,
        },
        background,
      },
    ],
  };
}

export async function heyGenCreateVideo(payload, apiKey, requestTimeoutMs = 120_000) {
  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  const json = await res.json().catch(() => ({}));

  if (json.error) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : json.error?.message || JSON.stringify(json.error);
    throw new Error(msg || `HeyGen ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(json.message || `HeyGen HTTP ${res.status}`);
  }

  const videoId = json.data?.video_id;
  if (!videoId) throw new Error('HeyGen: missing video_id');
  return videoId;
}

/**
 * Rough narration length (~140 wpm) so Video Agent prompts match HeyGen docs (“Create a 45-second …”).
 */
export function estimateSpeechSecondsFromCopy(parts, padRatio = 1.12) {
  const script = typeof parts.script === 'string' ? parts.script : '';
  const hook = typeof parts.hook === 'string' ? parts.hook : '';
  const caption = typeof parts.caption === 'string' ? parts.caption : '';
  const full = `${hook}\n${script}\n${caption}`.trim();
  const words = full.split(/\s+/).filter(Boolean).length;
  const wpm = 140;
  const raw = (words / wpm) * 60 * padRatio;
  return Number.isFinite(raw) ? Math.ceil(raw) : 24;
}

/**
 * Turn creative fields into a single Video Agent prompt (v3).
 * HeyGen recommends stating explicit duration in the prompt — vague “short” tends to yield ~few-second clips.
 * @param {{ script?: string, hook?: string, caption?: string }} parts
 * @param {{ minSec?: number, maxSec?: number }} [dur]
 */
export function buildVideoAgentPrompt(parts, dur = {}) {
  const script = typeof parts.script === 'string' ? parts.script.trim() : '';
  const hook = typeof parts.hook === 'string' ? parts.hook.trim() : '';
  const caption = typeof parts.caption === 'string' ? parts.caption.trim() : '';

  const minSec =
    typeof dur.minSec === 'number' && Number.isFinite(dur.minSec)
      ? dur.minSec
      : parseInt(process.env.HEYGEN_VIDEO_AGENT_MIN_SECONDS?.trim() || '12', 10);
  const maxSec =
    typeof dur.maxSec === 'number' && Number.isFinite(dur.maxSec)
      ? dur.maxSec
      : parseInt(process.env.HEYGEN_VIDEO_AGENT_MAX_SECONDS?.trim() || '60', 10);

  const lo = Number.isFinite(minSec) ? Math.min(120, Math.max(8, minSec)) : 12;
  let hi = Number.isFinite(maxSec) ? Math.min(180, Math.max(lo, maxSec)) : 60;

  const estimated = estimateSpeechSecondsFromCopy(parts);
  const targetSec = Math.min(hi, Math.max(lo, estimated));

  const lines = [];
  lines.push(
    `Create an approximately ${targetSec}-second portrait vertical marketing video with a presenter.`,
    `Speak the full script below at natural pacing (about ${targetSec} seconds total); do not summarize or compress it into a teaser or bumper.`,
    'Match tone: clear, confident, social-ad friendly.',
  );
  if (hook) lines.push(`Opening hook / attention line:\n${hook}`);
  if (script) lines.push(`Script to deliver (speak clearly, conversational):\n${script}`);
  if (caption) lines.push(`Include or close with this line where it fits:\n${caption}`);
  const out = lines.join('\n\n').trim().slice(0, 8000);
  return out || `Create a 30-second portrait vertical marketing video with a presenter promoting the product in an upbeat tone.`;
}

/**
 * POST /v3/video-agents — returns video_id (async render).
 * @param {{ prompt: string, callback_url?: string, orientation?: string, avatar_id?: string, voice_id?: string }} body
 */
export async function heyGenVideoAgentCreate(body, apiKey, requestTimeoutMs = 120_000) {
  const res = await fetch(`${HEYGEN_API}/v3/video-agents`, {
    method: 'POST',
    headers: heyGenV3Headers(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || JSON.stringify(json.data || json);
    throw new Error(typeof msg === 'string' ? msg : `HeyGen v3 HTTP ${res.status}`);
  }
  const videoId = json.data?.video_id;
  if (!videoId) throw new Error('HeyGen v3: missing video_id in response');
  return videoId;
}

export async function heyGenFetchVideoV3(videoId, apiKey, requestTimeoutMs = 60_000) {
  const res = await fetch(`${HEYGEN_API}/v3/videos/${encodeURIComponent(videoId)}`, {
    headers: { 'X-Api-Key': apiKey },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || `HeyGen v3 status HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : String(msg));
  }
  return json.data;
}

/**
 * Poll GET /v3/videos/:id until completed or failed.
 */
export async function heyGenPollVideoUntilDoneV3(videoId, apiKey, hooks = {}, cfg = {}) {
  const { isCancelled, onProgress } = hooks;
  const interval = cfg.pollIntervalMs ?? 10_000;
  const max = cfg.pollMaxAttempts ?? 450;
  const reqTimeout = cfg.requestTimeoutMs ?? 60_000;

  for (let i = 0; i < max; i++) {
    if (isCancelled?.()) throw new Error('HeyGen: render superseded');
    if (i > 0) {
      await new Promise((r) => setTimeout(r, interval));
    }

    let data;
    try {
      data = await heyGenFetchVideoV3(videoId, apiKey, reqTimeout);
    } catch {
      continue;
    }

    const st = String(data.status || '').toLowerCase();

    if (st === 'completed') {
      const url = data.video_url;
      if (!url) throw new Error('HeyGen v3: completed but no video_url');
      onProgress?.(100);
      return url;
    }

    if (st === 'failed') {
      const err = data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err?.detail ||
            err?.message ||
            data.failure_message ||
            data.failure_code ||
            JSON.stringify(err || {});
      throw new Error(msg || 'HeyGen v3 render failed');
    }

    onProgress?.(Math.min(92, 12 + Math.floor((i / max) * 80)));
  }

  throw new Error('HeyGen v3: timed out waiting for video');
}

export async function heyGenFetchVideoStatus(videoId, apiKey, requestTimeoutMs = 60_000) {
  const url = `${HEYGEN_API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  const ok = Number(json.code) === 100 || json.code === '100';
  if (!res.ok || !ok) {
    throw new Error(json.message || `HeyGen status HTTP ${res.status}`);
  }
  return json.data;
}

/**
 * Poll until HeyGen returns a final video URL (avatar + TTS flow).
 */
export async function heyGenPollVideoUntilDone(videoId, apiKey, hooks = {}, cfg = {}) {
  const { isCancelled, onProgress } = hooks;
  const interval = cfg.pollIntervalMs ?? 4000;
  const max = cfg.pollMaxAttempts ?? 450;
  const reqTimeout = cfg.requestTimeoutMs ?? 60_000;

  for (let i = 0; i < max; i++) {
    if (isCancelled?.()) throw new Error('HeyGen: render superseded');

    if (i > 0) {
      await new Promise((r) => setTimeout(r, interval));
    }

    let data;
    try {
      data = await heyGenFetchVideoStatus(videoId, apiKey, reqTimeout);
    } catch {
      continue;
    }

    const st = (data.status || '').toLowerCase();

    if (st === 'completed') {
      const url = data.video_url;
      if (!url) throw new Error('HeyGen: completed but no video_url');
      onProgress?.(100);
      return url;
    }

    if (st === 'failed') {
      const err = data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err?.detail || err?.message || JSON.stringify(err || {});
      throw new Error(msg || 'HeyGen render failed');
    }

    onProgress?.(Math.min(92, 12 + Math.floor((i / max) * 80)));
  }

  throw new Error('HeyGen: timed out waiting for video');
}

/**
 * Creatives path: script + hook + caption → either v3 Video Agent (prompt) or v2 avatar + TTS.
 */
export async function heyGenGenerateAvatarVideoFromScript({ script, hook, caption }, cfg, hooks = {}) {
  const { onProgress, isCancelled } = hooks;

  if (cfg.mode === 'video_agent_v3') {
    const prompt = buildVideoAgentPrompt(
      { script, hook, caption },
      { minSec: cfg.videoAgentMinSeconds, maxSec: cfg.videoAgentMaxSeconds },
    );
    const body = { prompt };
    if (cfg.callbackUrl) body.callback_url = cfg.callbackUrl;
    if (cfg.orientation) body.orientation = cfg.orientation;

    onProgress?.(8);
    const videoId = await heyGenVideoAgentCreate(body, cfg.apiKey, cfg.requestTimeoutMs);
    onProgress?.(18);

    return heyGenPollVideoUntilDoneV3(videoId, cfg.apiKey, { isCancelled, onProgress }, cfg);
  }

  if (cfg.mode !== 'avatar_v2') {
    throw new Error('HeyGen: invalid config mode');
  }

  const payload = buildHeyGenVideoPayload(script, hook, caption, cfg);

  onProgress?.(8);
  const videoId = await heyGenCreateVideo(payload, cfg.apiKey, cfg.requestTimeoutMs);
  onProgress?.(18);

  return heyGenPollVideoUntilDone(videoId, cfg.apiKey, { isCancelled, onProgress }, cfg);
}

export function formatHeyGenRenderError(err) {
  const base = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? {});

  if (/invalid.*key|unauthorized|401|403/i.test(String(base))) {
    return `${base}. Check HEYGEN_API_KEY and that the key is active in HeyGen.`;
  }

  if (/avatar|voice/i.test(String(base))) {
    return `${base}. Verify HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID, or set HEYGEN_USE_VIDEO_AGENT=true for v3 Video Agent (API key only).`;
  }

  if (/timeout|timed out|abort/i.test(String(base))) {
    return `${base}. Try increasing HEYGEN_REQUEST_TIMEOUT_MS or HEYGEN_POLL_MAX_ATTEMPTS.`;
  }

  return base;
}
