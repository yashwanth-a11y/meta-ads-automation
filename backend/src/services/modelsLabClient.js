/**
 * ModelsLab — text-to-video and image-to-video (API v6).
 * Docs: https://docs.modelslab.com/video-api/overview
 *
 * Auth: JSON body field `key` (not Bearer). Base host is modelslab.com — there is no api.modelslab.com.
 */

import axios from 'axios';

/** Official REST prefix; do not use https://api.modelslab.com (invalid DNS). */
const API_BASE_URL = 'https://modelslab.com/api/v6';

/**
 * Older examples used broken hosts. Force the documented v6 base URL when a bad value is set.
 */
export function normalizeModelsLabBaseUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return API_BASE_URL;
  if (/api\.modelslab\.com/i.test(s)) return API_BASE_URL;
  if (/api\.models\.run/i.test(s)) return API_BASE_URL;
  return s.replace(/\/$/, '');
}

export const MODELS_LAB_MODELS = {
  WAN_2_2: 'wan2.2',
  LTX_2_3: 'ltx-2.3',
  KLING_V2_MASTER: 'kling-v2-master',
  KLING_V2_PRO: 'kling-v2-pro',
  KLING_V1: 'kling-v1',
  WAN_2_1: 'wan2.1',
  WAN_1: 'wan1',
  STABLE_VIDEO: 'stable-video-diffusion',
  MODELSCOPE: 'modelscope',
  IMAGE_TO_VIDEO: 'kling-image-to-video',
  IMAGE_TO_VIDEO_PRO: 'kling-image-to-video-pro',
  ANIMATE_DIFF: 'animatediff',
};

const LEGACY_TEXT_MODEL_TO_API = {
  'kling-v2-master': 'wan2.2',
  'kling-v2-pro': 'wan2.2',
  'kling-v1': 'wan2.2',
  'wan2.1': 'wan2.2',
  wan1: 'wan2.2',
  'stable-video-diffusion': 'wan2.2',
  modelscope: 'wan2.2',
  'kling-image-to-video': 'wan2.2',
  'kling-image-to-video-pro': 'wan2.2',
  animatediff: 'wan2.2',
};

export function normalizeModelsLabTextModelId(modelId) {
  const id = (modelId || '').trim().toLowerCase();
  if (!id) return 'wan2.2';
  if (id === 'ltx-2.3' || id === 'ltx_2_3') return 'ltx-2.3';
  if (id === 'wan2.2' || id === 'wan2_2') return 'wan2.2';
  return LEGACY_TEXT_MODEL_TO_API[id] || 'wan2.2';
}

function aspectRatioToDimensions(aspectRatio) {
  const ar = (aspectRatio || '9:16').trim();
  const map = {
    '9:16': [288, 512],
    '16:9': [512, 288],
    '1:1': [512, 512],
    '4:5': [412, 512],
  };
  const pair = map[ar] || [288, 512];
  return { width: pair[0], height: pair[1] };
}

function extractVideoUrl(data) {
  return (
    data?.output?.[0] ||
    data?.proxy_links?.[0] ||
    data?.future_links?.[0] ||
    null
  );
}

function isAxiosTimeout(err) {
  const code = err?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true;
  const msg = String(err?.message || '');
  return /timeout of \d+ms exceeded/i.test(msg) || /\btimeout\b/i.test(msg);
}

/** Live API requires fps >= 16; public schema also caps fps at 16 — use 16. */
const ML_FPS_FIXED = 16;

/**
 * ModelsLab text2video: max 25 frames; fps must be 16 for this model — clip ≈ 1.56s.
 * cfg.duration / clipTargetSec reserved for future if the API exposes longer clips.
 */
export function computeModelsLabClipParams(_cfg) {
  const num_frames = 25;
  const fps = ML_FPS_FIXED;
  return { num_frames, fps, estDurationSec: num_frames / fps };
}

export function resolveModelsLabConfig() {
  const apiKey = process.env.MODELS_LAB_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = normalizeModelsLabBaseUrl(process.env.MODELS_LAB_BASE_URL);
  const defaultModel = process.env.MODELS_LAB_MODEL?.trim() || MODELS_LAB_MODELS.WAN_2_2;
  const duration = process.env.MODELS_LAB_DURATION?.trim() || '5';
  const aspectRatio = process.env.MODELS_LAB_ASPECT_RATIO?.trim() || '9:16';
  const numOutputs = parseInt(process.env.MODELS_LAB_NUM_OUTPUTS?.trim() || '1', 10);
  const httpTimeoutRaw = parseInt(process.env.MODELS_LAB_HTTP_TIMEOUT_MS?.trim() || '300000', 10);
  const httpTimeoutMs = Number.isFinite(httpTimeoutRaw)
    ? Math.min(900_000, Math.max(60_000, httpTimeoutRaw))
    : 300_000;

  return {
    apiKey,
    baseUrl,
    defaultModel,
    duration,
    aspectRatio,
    numOutputs,
    httpTimeoutMs,
  };
}

export function buildModelsLabPrompt(script) {
  const main = (script || '').trim();
  const lines = [
    'Generate cinematic video footage based on this script: scene beats, action, mood, pacing and visual style should match the script.',
    '',
    `SCRIPT:\n${main || '(empty)'}`,
    '',
    'Style: vertical 9:16 format, cinematic lighting, smooth camera movements, coherent and professional visuals.',
  ];
  return lines.join('\n').slice(0, 2500);
}

export function createModelsLabClient(cfg) {
  const timeout = cfg.httpTimeoutMs ?? 300_000;
  const client = axios.create({
    baseURL: cfg.baseUrl.replace(/\/$/, ''),
    headers: {
      'Content-Type': 'application/json',
    },
    timeout,
  });

  client.interceptors.request.use((config) => {
    const body = config.data;
    if (body && typeof body === 'object' && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
      config.data = { ...body, key: cfg.apiKey };
    } else if (config.method === 'post' && !config.data) {
      config.data = { key: cfg.apiKey };
    }
    return config;
  });

  return client;
}

export async function modelsLabTextToVideo(client, prompt, cfg, meta = {}) {
  const { width, height } = aspectRatioToDimensions(cfg.aspectRatio);
  const { num_frames, fps } = computeModelsLabClipParams(cfg);
  const payload = {
    prompt,
    model_id: normalizeModelsLabTextModelId(cfg.defaultModel),
    negative_prompt: 'low quality, blurry, static',
    height,
    width,
    num_frames,
    fps,
    num_inference_steps: 20,
    guidance_scale: 7,
    output_type: 'mp4',
  };

  if (meta.external_task_id) {
    payload.track_id = String(meta.external_task_id)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120);
  }

  try {
    const response = await client.post('/video/text2video', payload);
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.messege || err.message;
    throw new Error(`Models Lab text-to-video error: ${msg}`);
  }
}

export async function modelsLabImageToVideo(client, imageUrl, prompt, cfg, meta = {}) {
  const { width, height } = aspectRatioToDimensions(cfg.aspectRatio);
  const { num_frames, fps } = computeModelsLabClipParams(cfg);
  const payload = {
    init_image: imageUrl,
    model_id: normalizeModelsLabTextModelId(cfg.defaultModel),
    prompt: prompt || 'Continue the motion from this image naturally',
    height,
    width,
    num_frames,
    fps,
    num_inference_steps: 20,
    min_guidance_scale: 1,
    max_guidance_scale: 3,
    output_type: 'mp4',
  };

  if (meta.external_task_id) {
    payload.track_id = String(meta.external_task_id)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120);
  }

  try {
    const response = await client.post('/video/img2video', payload);
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.messege || err.message;
    throw new Error(`Models Lab image-to-video error: ${msg}`);
  }
}

export async function modelsLabPollStatus(client, taskId, hooks = {}) {
  const { isCancelled, onProgress } = hooks;
  const maxAttempts = 240;
  const pollInterval = 3000;
  const id = encodeURIComponent(String(taskId));

  for (let i = 0; i < maxAttempts; i++) {
    if (isCancelled?.()) throw new Error('Models Lab: render superseded');

    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const response = await client.post(`/video/fetch/${id}`, {});
      const data = response.data;
      const status = (data.status || '').toLowerCase();

      if (status === 'success') {
        const videoUrl = extractVideoUrl(data);
        if (!videoUrl) {
          throw new Error(`Models Lab: completed but no video URL — ${JSON.stringify(data).slice(0, 320)}`);
        }
        onProgress?.(100);
        return videoUrl;
      }

      if (status === 'error' || status === 'failed') {
        throw new Error(data.message || data.messege || 'Models Lab task failed');
      }

      if (status === 'processing') {
        const eta = data.eta;
        const progress = eta != null ? Math.min(95, 30 + (200 - Math.min(eta, 200)) * 0.3) : 50 + (i % 10);
        onProgress?.(Math.round(progress));
        continue;
      }

      const maybeUrl = extractVideoUrl(data);
      if (maybeUrl) {
        onProgress?.(100);
        return maybeUrl;
      }
    } catch (err) {
      if (err.response?.status === 404) {
        continue;
      }
      if (isAxiosTimeout(err)) {
        continue;
      }
      if (err instanceof Error && err.message.startsWith('Models Lab:')) {
        throw err;
      }
      const msg = err.response?.data?.message || err.response?.data?.messege || err.message;
      throw new Error(`Models Lab poll error: ${msg}`);
    }
  }

  throw new Error(
    'Models Lab: timed out waiting for video (exceeded poll attempts). Try MODELS_LAB_HTTP_TIMEOUT_MS=600000 if fetches are slow.',
  );
}

export async function modelsLabGenerateAndPoll(client, prompt, cfg, hooks = {}, meta = {}) {
  const { isCancelled, onProgress } = hooks;

  onProgress?.(12);

  const taskData = await modelsLabTextToVideo(client, prompt, cfg, meta);
  const st = (taskData.status || '').toLowerCase();

  if (st === 'error') {
    throw new Error(taskData.message || taskData.messege || 'Models Lab text-to-video failed');
  }

  if (st === 'success') {
    const url = extractVideoUrl(taskData);
    if (url) {
      onProgress?.(100);
      return url;
    }
  }

  const taskId = taskData.id ?? taskData.task_id;
  if (taskId == null) {
    throw new Error(`Models Lab: missing task id — ${JSON.stringify(taskData).slice(0, 320)}`);
  }

  onProgress?.(22);

  return modelsLabPollStatus(client, taskId, hooks);
}

export async function modelsLabGenerateImageToVideoAndPoll(
  client,
  imageUrl,
  prompt,
  cfg,
  hooks = {},
  meta = {}
) {
  const { isCancelled, onProgress } = hooks;

  onProgress?.(12);

  const taskData = await modelsLabImageToVideo(client, imageUrl, prompt, cfg, meta);
  const st = (taskData.status || '').toLowerCase();

  if (st === 'error') {
    throw new Error(taskData.message || taskData.messege || 'Models Lab image-to-video failed');
  }

  if (st === 'success') {
    const url = extractVideoUrl(taskData);
    if (url) {
      onProgress?.(100);
      return url;
    }
  }

  const taskId = taskData.id ?? taskData.task_id;
  if (taskId == null) {
    throw new Error(`Models Lab: missing task id — ${JSON.stringify(taskData).slice(0, 320)}`);
  }

  onProgress?.(22);

  return modelsLabPollStatus(client, taskId, hooks);
}

export function formatModelsLabRenderError(err) {
  const base = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? {});
  const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;

  if (status === 429 || /balance|credit|insufficient/i.test(String(base))) {
    return `${base}. Check your Models Lab account balance and API quota. Top up credits if needed.`;
  }

  if (status === 401 || /unauthorized|invalid.*key|invalid.*token/i.test(String(base))) {
    return `${base}. Verify your Models Lab API key is correct and has not expired.`;
  }

  if (status === 400 || /invalid.*prompt|invalid.*image/i.test(String(base))) {
    return `${base}. Check your input prompt and image URL are valid.`;
  }

  if (/timeout|ECONNABORTED|ETIMEDOUT/i.test(String(base))) {
    return `${base}. Increase MODELS_LAB_HTTP_TIMEOUT_MS (default 300000 ms) if ModelsLab responses are slow.`;
  }

  return base;
}

export function getAvailableModelsLabModels() {
  return {
    textToVideo: [
      {
        id: MODELS_LAB_MODELS.WAN_2_2,
        name: 'WAN 2.2 (default)',
        description: 'Text-to-video per ModelsLab API v6',
        speed: 'Fast',
        quality: 'High',
        costPerSecond: 'per ModelsLab pricing',
      },
      {
        id: MODELS_LAB_MODELS.LTX_2_3,
        name: 'LTX 2.3',
        description: 'Alternative text-to-video model',
        speed: 'Medium',
        quality: 'High',
        costPerSecond: 'per ModelsLab pricing',
      },
    ],
    imageToVideo: [
      {
        id: MODELS_LAB_MODELS.WAN_2_2,
        name: 'WAN 2.2 image-to-video',
        description: 'Animate an image into video (img2video)',
        speed: 'Medium',
        quality: 'High',
        costPerSecond: 'per ModelsLab pricing',
      },
      {
        id: MODELS_LAB_MODELS.LTX_2_3,
        name: 'LTX 2.3 image-to-video',
        description: 'Alternative image-to-video model',
        speed: 'Medium',
        quality: 'High',
        costPerSecond: 'per ModelsLab pricing',
      },
    ],
    animation: [],
  };
}
