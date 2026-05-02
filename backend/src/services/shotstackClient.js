/**
 * Shotstack Edit API — vertical MP4 with script text burned in.
 * Docs: https://shotstack.io/docs/guide/getting-started/hello-world-using-curl/
 */

import axios from 'axios';

export function resolveShotstackEditConfig() {
  const useProd = process.env.SHOTSTACK_EDIT_ENV === 'production';
  if (useProd && process.env.SHOTSTACK_PRODUCTION_API_KEY) {
    return {
      baseUrl: 'https://api.shotstack.io/edit/v1',
      apiKey: process.env.SHOTSTACK_PRODUCTION_API_KEY,
    };
  }
  const stageKey =
    process.env.SHOTSTACK_STAGE_API_KEY || process.env.SHOTSTACK_API_KEY;
  if (stageKey) {
    return {
      baseUrl: 'https://api.shotstack.io/edit/stage',
      apiKey: stageKey,
    };
  }
  return null;
}

/**
 * Stitch MP4 URLs end-to-end (Creatives multi-scene Models Lab output).
 * @param {{ src: string, lengthSec: number }[]} clips
 */
export function buildShotstackVideoStitchPayload(clips) {
  let start = 0;
  const trackClips = clips.map((c) => {
    const len = Math.max(1, Math.min(12, Number(c.lengthSec) || 3));
    const clip = {
      asset: {
        type: 'video',
        src: c.src,
      },
      start,
      length: len,
    };
    start += len;
    return clip;
  });

  return {
    timeline: {
      tracks: [{ clips: trackClips }],
    },
    output: {
      format: 'mp4',
      size: {
        width: 1080,
        height: 1920,
      },
    },
  };
}

export async function submitShotstackRender(cfg, payload) {
  const res = await axios.post(`${cfg.baseUrl}/render`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
    },
    timeout: 120000,
  });
  const id = res.data?.response?.id;
  if (!id) {
    throw new Error(`Shotstack: no render id — ${JSON.stringify(res.data).slice(0, 400)}`);
  }
  return id;
}

export async function pollShotstackRenderUntilDone(cfg, renderId, hooks = {}) {
  const { onProgress, isCancelled } = hooks;
  const maxAttempts = 450;

  for (let i = 0; i < maxAttempts; i++) {
    if (isCancelled?.()) throw new Error('Shotstack: merge superseded');

    await new Promise((r) => setTimeout(r, 2000));

    const res = await axios.get(`${cfg.baseUrl}/render/${renderId}`, {
      headers: { 'x-api-key': cfg.apiKey },
      timeout: 60000,
    });

    const resp = res.data?.response;
    const status = resp?.status;

    if (status === 'done') {
      const url = resp?.url;
      if (!url) throw new Error('Shotstack: render done but no output URL');
      onProgress?.(100);
      return url;
    }

    if (status === 'failed') {
      throw new Error(resp?.error || 'Shotstack merge failed');
    }

    onProgress?.(90 + Math.min(9, Math.floor(i / 30)));
  }

  throw new Error('Shotstack: timed out waiting for merged video');
}

/**
 * @param {string} script
 * @param {string} hook
 * @param {string} [caption]
 */
export function buildShotstackEditPayload(script, hook, caption) {
  const hookLine = (hook || '').trim().slice(0, 140);
  // Preserve line breaks so on-video copy matches the user's script layout.
  const excerpt = (script || '').trim().slice(0, 950);
  const cap = (caption || '').trim().slice(0, 220);

  let textBody = hookLine ? `${hookLine}\n\n${excerpt}` : excerpt;
  if (cap) textBody = `${textBody}\n\n${cap}`;
  textBody = textBody.slice(0, 1200);

  const clipLength = Math.min(24, Math.max(5, Math.ceil(textBody.length / 55)));

  return {
    timeline: {
      soundtrack: {
        src: 'https://s3-ap-southeast-2.amazonaws.com/shotstack-assets/music/moment.mp3',
        effect: 'fadeOut',
      },
      tracks: [
        {
          clips: [
            {
              asset: {
                type: 'text',
                text: textBody,
                font: {
                  family: 'Montserrat ExtraBold',
                  color: '#FFFFFF',
                  size: 24,
                },
                alignment: {
                  horizontal: 'center',
                },
              },
              start: 0,
              length: clipLength,
              transition: {
                in: 'fade',
                out: 'fade',
              },
            },
          ],
        },
      ],
    },
    output: {
      format: 'mp4',
      size: {
        width: 1080,
        height: 1920,
      },
    },
  };
}

/**
 * Random stock MP4 URLs — NOT generated from your script (misleading as “script video”).
 * Demo MP4 helper (Creatives pipeline no longer uses this; kept for ad-hoc tooling if needed).
 */
export function demoVideoUrlForScript(script) {
  const samples = [
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  ];
  const s = typeof script === 'string' ? script : '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return samples[Math.abs(h) % samples.length];
}
