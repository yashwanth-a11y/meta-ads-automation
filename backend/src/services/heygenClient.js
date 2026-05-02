/**
 * HeyGen — avatar + TTS + optional stock/video background (HeyGen-style output).
 * Docs: https://docs.heygen.com/reference/create-an-avatar-video-v2
 */

const HEYGEN_API = 'https://api.heygen.com';

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

export function resolveHeyGenConfig() {
  const apiKey = process.env.HEYGEN_API_KEY?.trim();
  const avatarId = process.env.HEYGEN_AVATAR_ID?.trim();
  const voiceId = process.env.HEYGEN_VOICE_ID?.trim();
  if (!apiKey || !avatarId || !voiceId) return null;

  const explicitBg = process.env.HEYGEN_BACKGROUND_VIDEO_URL?.trim();
  const useStockLoop =
    explicitBg
      ? false
      : process.env.HEYGEN_USE_STOCK_VIDEO_BACKGROUND === 'true' ||
        process.env.HEYGEN_USE_STOCK_VIDEO_BACKGROUND === '1';

  const pollIntervalMs = parseInt(process.env.HEYGEN_POLL_INTERVAL_MS?.trim() || '4000', 10);
  const pollMaxAttempts = parseInt(process.env.HEYGEN_POLL_MAX_ATTEMPTS?.trim() || '450', 10);
  const requestTimeoutMs = parseInt(process.env.HEYGEN_REQUEST_TIMEOUT_MS?.trim() || '120000', 10);

  return {
    apiKey,
    avatarId,
    voiceId,
    caption: process.env.HEYGEN_CAPTIONS !== 'false' && process.env.HEYGEN_CAPTIONS !== '0',
    dimension: {
      width: Number(process.env.HEYGEN_VIDEO_WIDTH || 1080),
      height: Number(process.env.HEYGEN_VIDEO_HEIGHT || 1920),
    },
    /** Solid fallback when no video background is used */
    backgroundColor: process.env.HEYGEN_BACKGROUND_COLOR?.trim() || '#101018',
    /** User-supplied MP4 URL (must be reachable by HeyGen) */
    backgroundVideoUrl: explicitBg || null,
    /** Picks a curated loop per script when true */
    useStockVideoBackground: useStockLoop,
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? Math.min(30_000, Math.max(2000, pollIntervalMs)) : 4000,
    pollMaxAttempts: Number.isFinite(pollMaxAttempts) ? Math.min(900, Math.max(30, pollMaxAttempts)) : 450,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? Math.min(300_000, Math.max(30_000, requestTimeoutMs)) : 120_000,
  };
}

/**
 * @param {string} script
 * @param {string} hook
 * @param {string} caption
 * @param {ReturnType<typeof resolveHeyGenConfig>} cfg
 */
export function buildHeyGenVideoPayload(script, hook, caption, cfg) {
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
 * Creatives path: script + hook + caption → avatar speaks text (not raw pixel text-to-video).
 */
export async function heyGenGenerateAvatarVideoFromScript({ script, hook, caption }, cfg, hooks = {}) {
  const { onProgress, isCancelled } = hooks;
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
    return `${base}. Verify HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID in the HeyGen dashboard.`;
  }

  if (/timeout|timed out|abort/i.test(String(base))) {
    return `${base}. Try increasing HEYGEN_REQUEST_TIMEOUT_MS or HEYGEN_POLL_MAX_ATTEMPTS.`;
  }

  return base;
}
