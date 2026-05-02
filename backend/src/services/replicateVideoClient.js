/**
 * Replicate video generation.
 * Default models are official Replicate slugs (no pinned hash) so they track current versions.
 * Legacy Zeroscope hashes often fail with "version does not exist" after models are removed.
 */

import axios from 'axios';

const REPLICATE_API_URL = 'https://api.replicate.com/v1';

/** Official models — use `owner/name` so Replicate resolves the active version (see Replicate HTTP API). */
export const VIDEO_MODELS = {
  TEXT_TO_VIDEO_WAN_25_FAST: 'wan-video/wan-2.5-t2v-fast',
  IMAGE_TO_VIDEO_WAN_25_FAST: 'wan-video/wan-2.5-i2v-fast',

  /** @deprecated Model may be removed from Replicate; prefer TEXT_TO_VIDEO_WAN_25_FAST */
  TEXT_TO_VIDEO_ZEROSCOPE: 'arielreplicate/zeroscope-v2-xl:9f747673945c62801b13b1ef2d7d5e2c0f862464da821fff180726baf18f37e6',
  TEXT_TO_VIDEO_MODELSCOPE: 'camenduru/modelscope-text-to-video:278beede08009af4ff1cd29d200953f0cf8397aeb19ccbc9b197101b30b3e6c9',
  TEXT_TO_VIDEO_STABLE: 'stability-ai/stable-video-diffusion:3f0457e4619daec51aa397c8b0165c02076eb1f38efb033e6379d4374d7cc721',
  IMAGE_TO_VIDEO_ZEROSCOPE: 'arielreplicate/zeroscope-v2-xl:9f747673945c62801b13b1ef2d7d5e2c0f862464da821fff180726baf18f37e6',
  IMAGE_TO_VIDEO_DYNAMICRAFTER: 'camenduru/dynamicrafter:d6d7e73694bd291bb401950378304588027e305d68890a56290eb300aeb8dc67',
  ANIMATE_DIFF: 'camenduru/animatediff:bae9e66cac896651454b963b797044c0f8374dc2461c7e1697b1b01b2cd3ac33',
};

function modelRefLower(cfg) {
  return String(cfg?.model || '').toLowerCase();
}

/** Wan 2.5 T2V / I2V on Replicate use `size` like "1280*720", not zeroscope's video_length/fps. */
function isWan25Family(cfg) {
  const m = modelRefLower(cfg);
  return m.includes('wan-video/wan-2.5') || (m.includes('wan-2.5') && (m.includes('t2v') || m.includes('i2v')));
}

/** Older community models that expect prompt + video_length + fps. */
function isLegacyZeroscopeLike(cfg) {
  const m = modelRefLower(cfg);
  return m.includes('zeroscope') || m.includes('modelscope-text-to-video') || m.includes('dynamicrafter');
}

/** If user points REPLICATE_MODEL at a T2V slug, image-to-video should use the matching I2V model. */
function defaultImageModelForEnv(textModel) {
  const t = (textModel || '').toLowerCase();
  if (t.includes('wan-2.5') && t.includes('t2v')) {
    return VIDEO_MODELS.IMAGE_TO_VIDEO_WAN_25_FAST;
  }
  return textModel;
}

export function resolveReplicateConfig() {
  const apiKey = process.env.REPLICATE_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.REPLICATE_MODEL?.trim() || VIDEO_MODELS.TEXT_TO_VIDEO_WAN_25_FAST;
  const imageModel =
    process.env.REPLICATE_IMAGE_MODEL?.trim() || defaultImageModelForEnv(model);
  const videoLength = parseInt(process.env.REPLICATE_VIDEO_LENGTH?.trim() || '4', 10);
  const fps = parseInt(process.env.REPLICATE_FPS?.trim() || '8', 10);
  const videoSize = process.env.REPLICATE_VIDEO_SIZE?.trim() || '';

  return {
    apiKey,
    model,
    imageModel,
    videoLength,
    fps,
    videoSize,
  };
}

export function createReplicateClient(cfg) {
  return axios.create({
    baseURL: REPLICATE_API_URL,
    headers: {
      Authorization: `Token ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 120000,
  });
}

export function prepareTextToVideoInput(prompt, cfg, meta = {}) {
  const base = {
    prompt: prompt || 'A serene landscape',
    ...(meta.seed != null && meta.seed !== '' ? { seed: meta.seed } : {}),
  };

  if (isWan25Family(cfg)) {
    const size =
      meta.size ||
      cfg.videoSize ||
      process.env.REPLICATE_VIDEO_SIZE?.trim() ||
      '720*1280';
    return { ...base, size };
  }

  if (isLegacyZeroscopeLike(cfg)) {
    return {
      ...base,
      video_length: cfg.videoLength || 4,
      fps: cfg.fps || 8,
    };
  }

  return {
    ...base,
    video_length: cfg.videoLength || 4,
    fps: cfg.fps || 8,
  };
}

export function prepareImageToVideoInput(imageUrl, prompt, cfg, meta = {}) {
  const base = {
    image: imageUrl,
    prompt: prompt || 'Continue the motion naturally',
    ...(meta.seed != null && meta.seed !== '' ? { seed: meta.seed } : {}),
  };

  if (isWan25Family(cfg)) {
    const size =
      meta.size ||
      cfg.videoSize ||
      process.env.REPLICATE_VIDEO_SIZE?.trim() ||
      '720*1280';
    return { ...base, size };
  }

  if (isLegacyZeroscopeLike(cfg)) {
    return {
      ...base,
      video_length: cfg.videoLength || 4,
      fps: cfg.fps || 8,
    };
  }

  return {
    ...base,
    video_length: cfg.videoLength || 4,
    fps: cfg.fps || 8,
  };
}

export async function submitReplicateJob(client, modelId, input) {
  try {
    const response = await client.post('/predictions', {
      version: modelId,
      input,
    });

    return {
      id: response.data.id,
      status: response.data.status,
      output: response.data.output,
      error: response.data.error,
    };
  } catch (err) {
    const message = err.response?.data?.detail || err.message;
    throw new Error(`Replicate submission error: ${message}`);
  }
}

export async function pollReplicateStatus(client, jobId, hooks = {}) {
  const { isCancelled, onProgress } = hooks;
  const maxAttempts = 240;
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    if (isCancelled?.()) throw new Error('Replicate: generation superseded');

    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const response = await client.get(`/predictions/${jobId}`);
      const data = response.data;
      const status = data.status?.toLowerCase() || 'processing';

      const progressMap = {
        starting: 10,
        processing: 50,
        succeeded: 100,
      };
      const progress = progressMap[status] || 50;
      onProgress?.(progress);

      if (status === 'succeeded') {
        const output = data.output;
        const videoUrl = Array.isArray(output) ? output[0] : output;
        if (!videoUrl) {
          throw new Error(`Replicate: succeeded but no output — ${JSON.stringify(data).slice(0, 320)}`);
        }
        return videoUrl;
      }

      if (status === 'failed') {
        const error = data.error || 'Unknown error';
        throw new Error(`Replicate generation failed: ${error}`);
      }

      continue;
    } catch (err) {
      if (err.response?.status === 404) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Replicate: timed out waiting for video (20+ minutes)');
}

export async function replicateGenerateTextToVideo(client, prompt, cfg, hooks = {}, meta = {}) {
  const { onProgress } = hooks;

  onProgress?.(5);

  const input = prepareTextToVideoInput(prompt, cfg, meta);
  const job = await submitReplicateJob(client, cfg.model, input);

  if (!job.id) {
    throw new Error(`Replicate: missing job id — ${JSON.stringify(job).slice(0, 320)}`);
  }

  onProgress?.(15);

  return pollReplicateStatus(client, job.id, hooks);
}

export async function replicateGenerateImageToVideo(
  client,
  imageUrl,
  prompt,
  cfg,
  hooks = {},
  meta = {}
) {
  const { onProgress } = hooks;

  onProgress?.(5);

  const input = prepareImageToVideoInput(imageUrl, prompt, cfg, meta);
  const job = await submitReplicateJob(client, cfg.model, input);

  if (!job.id) {
    throw new Error(`Replicate: missing job id — ${JSON.stringify(job).slice(0, 320)}`);
  }

  onProgress?.(15);

  return pollReplicateStatus(client, job.id, hooks);
}

export function formatReplicateRenderError(err) {
  const base = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? {});

  if (/version does not exist|does not exist \(or perhaps you don't have permission/i.test(String(base))) {
    return `${base} Set REPLICATE_MODEL to an official slug such as wan-video/wan-2.5-t2v-fast (text) or wan-video/wan-2.5-i2v-fast (image), or pin a valid version id from the model's API page on replicate.com.`;
  }

  if (/invalid.*key|unauthorized|authentication/i.test(String(base))) {
    return `${base}. Check your Replicate API key is correct.`;
  }

  if (/insufficient.*balance|credit|rate.*limit/i.test(String(base))) {
    return `${base}. Check your Replicate account balance and usage limits.`;
  }

  if (/timeout|timed out/i.test(String(base))) {
    return `${base}. The video generation took too long. Try with a shorter prompt or simpler scene.`;
  }

  return base;
}

export function getAvailableModels() {
  return {
    textToVideo: [
      {
        id: VIDEO_MODELS.TEXT_TO_VIDEO_WAN_25_FAST,
        name: 'Wan 2.5 T2V Fast (default)',
        description: 'Official text-to-video; uses size (e.g. 720*1280) instead of fps/length',
        type: 'text-to-video',
        default: true,
      },
      {
        id: VIDEO_MODELS.TEXT_TO_VIDEO_ZEROSCOPE,
        name: 'Zeroscope V2 XL (legacy)',
        description: 'May be unavailable if the pinned version was removed',
        type: 'text-to-video',
      },
      {
        id: VIDEO_MODELS.TEXT_TO_VIDEO_MODELSCOPE,
        name: 'ModelScope Text2Video',
        description: 'Open-source text-to-video model',
        type: 'text-to-video',
      },
      {
        id: VIDEO_MODELS.TEXT_TO_VIDEO_STABLE,
        name: 'Stable Video Diffusion',
        description: 'May require model access on Replicate',
        type: 'text-to-video',
      },
    ],
    imageToVideo: [
      {
        id: VIDEO_MODELS.IMAGE_TO_VIDEO_WAN_25_FAST,
        name: 'Wan 2.5 I2V Fast (default)',
        description: 'Official image-to-video',
        type: 'image-to-video',
        default: true,
      },
      {
        id: VIDEO_MODELS.IMAGE_TO_VIDEO_ZEROSCOPE,
        name: 'Zeroscope V2 XL (legacy)',
        description: 'May be unavailable',
        type: 'image-to-video',
      },
      {
        id: VIDEO_MODELS.IMAGE_TO_VIDEO_DYNAMICRAFTER,
        name: 'DynamiCrafter',
        description: 'Community image-to-video',
        type: 'image-to-video',
      },
    ],
    animation: [
      {
        id: VIDEO_MODELS.ANIMATE_DIFF,
        name: 'AnimateDiff',
        description: 'Generate animations from prompts',
        type: 'animation',
      },
    ],
  };
}
