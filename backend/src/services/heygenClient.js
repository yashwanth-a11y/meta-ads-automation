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

export async function heyGenCreateVideo(payload, apiKey) {
  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
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

export async function heyGenFetchVideoStatus(videoId, apiKey) {
  const url = `${HEYGEN_API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
  });
  const json = await res.json().catch(() => ({}));
  const ok = Number(json.code) === 100 || json.code === '100';
  if (!res.ok || !ok) {
    throw new Error(json.message || `HeyGen status HTTP ${res.status}`);
  }
  return json.data;
}
