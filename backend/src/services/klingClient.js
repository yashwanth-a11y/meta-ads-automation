/**
 * Kling AI — text-to-video (uses JWT from Access Key + Secret Key).
 * Uses `kling-api` against https://api-singapore.klingai.com (override via KLING_API_BASE_URL).
 */

import { KlingAPI } from 'kling-api';

const MAX_PROMPT = 2500;

export function resolveKlingConfig() {
  const accessKey = process.env.KLING_ACCESS_KEY?.trim();
  const secretKey = process.env.KLING_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) return null;

  const baseUrl = process.env.KLING_API_BASE_URL?.trim();
  const modelName = process.env.KLING_MODEL?.trim() || 'kling-v2-master';
  const duration = process.env.KLING_DURATION?.trim() || '5';
  const aspectRatio = process.env.KLING_ASPECT_RATIO?.trim() || '9:16';
  const mode = process.env.KLING_MODE?.trim() === 'pro' ? 'pro' : 'std';
  const sound =
    process.env.KLING_SOUND === 'on' || process.env.KLING_SOUND === 'off'
      ? process.env.KLING_SOUND
      : undefined;

  return {
    accessKey,
    secretKey,
    baseUrl: baseUrl || undefined,
    modelName,
    duration,
    aspectRatio,
    mode,
    sound,
  };
}

/**
 * Voiceover / storyboard script → single text2video prompt (no separate hook/caption).
 */
export function buildKlingPrompt(script) {
  const main = (script || '').trim();
  const lines = [
    'Generate video footage that follows this voiceover / storyboard script: scene beats, action, mood, and pacing should match the script.',
    '',
    `SCRIPT:\n${main || '(empty)'}`,
    '',
    'Format: vertical 9:16, cinematic lighting, smooth camera, coherent subjects.',
  ];
  return lines.join('\n').slice(0, MAX_PROMPT);
}

export function createKlingClient(cfg) {
  return new KlingAPI({
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    baseUrl: cfg.baseUrl,
  });
}

/**
 * Maps common Kling API failures to a clear operator-facing string (Creatives render error).
 * @param {unknown} err
 */
export function formatKlingRenderError(err) {
  const base =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? {});
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
  const requestId =
    typeof err === 'object' && err !== null && err.requestId ? String(err.requestId) : '';

  // Kling returns 429 + code 1102 when credits/balance are insufficient (message varies by locale).
  if (code === 1102 || /balance/i.test(String(base))) {
    const hint =
      ' Top up Kling credits in the Kling AI billing console — your keys are valid but the account has no usable balance.';
    const rid = requestId ? ` request_id=${requestId}` : '';
    return `${base}.${hint}${rid}`;
  }

  const rid = requestId ? ` request_id=${requestId}` : '';
  return rid ? `${base}${rid}` : base;
}

/** Kling wraps payloads as `{ code, message, data?: { task_id, task_status, ... } }`. */
function assertKlingBusinessOk(body, context) {
  if (!body || typeof body !== 'object') return;
  const c = body.code;
  if (c !== undefined && Number(c) !== 0) {
    const msg = typeof body.message === 'string' ? body.message : JSON.stringify(body);
    throw new Error(`Kling ${context}: ${msg} (code=${c})`);
  }
}

function getTaskInner(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.data && typeof body.data === 'object' && ('task_id' in body.data || 'task_status' in body.data)) {
    return body.data;
  }
  if ('task_id' in body || 'task_status' in body) return body;
  return body.data ?? null;
}

function extractTaskId(response) {
  const inner = getTaskInner(response);
  return inner?.task_id ?? inner?.taskId ?? response?.task_id;
}

function extractVideoUrl(response) {
  const inner = getTaskInner(response);
  const videos = inner?.task_result?.videos ?? response?.task_result?.videos;
  const first = Array.isArray(videos) ? videos[0] : null;
  return first?.url ?? first?.resource ?? null;
}

function extractTaskStatus(response) {
  const inner = getTaskInner(response);
  return inner?.task_status ?? response?.task_status;
}

function extractFailureMessage(response) {
  const inner = getTaskInner(response);
  const msg = inner?.task_status_msg ?? response?.task_status_msg;
  return typeof msg === 'string' ? msg : JSON.stringify(msg ?? response ?? {});
}

/**
 * @param {InstanceType<typeof KlingAPI>} api
 * @param {{ isCancelled?: () => boolean; onProgress?: (n: number) => void }} hooks
 */
export async function klingGenerateAndPoll(api, prompt, cfg, hooks = {}, meta = {}) {
  const { isCancelled, onProgress } = hooks;

  const params = {
    prompt,
    model_name: cfg.modelName,
    duration: String(cfg.duration || '5'),
    aspect_ratio: cfg.aspectRatio,
    mode: cfg.mode,
  };
  if (cfg.sound) params.sound = cfg.sound;
  if (meta.external_task_id) {
    params.external_task_id = String(meta.external_task_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  }

  onProgress?.(12);
  const task = await api.textToVideo(params);
  assertKlingBusinessOk(task, 'text2video create');
  const taskId = extractTaskId(task);
  if (!taskId) {
    throw new Error(`Kling: missing task id — ${JSON.stringify(task).slice(0, 320)}`);
  }

  onProgress?.(22);

  const byStatus = {
    submitted: 34,
    processing: 58,
  };

  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (isCancelled?.()) throw new Error('Kling: render superseded');

    const res = await api.queryTextToVideoTask(taskId);
    assertKlingBusinessOk(res, 'text2video status');
    const status = extractTaskStatus(res);
    onProgress?.(byStatus[status] ?? 46);

    if (status === 'succeed') {
      const url = extractVideoUrl(res);
      if (!url) throw new Error(`Kling: succeed but no URL — ${JSON.stringify(res).slice(0, 320)}`);
      return url;
    }
    if (status === 'failed') {
      throw new Error(extractFailureMessage(res) || 'Kling task failed');
    }
  }

  throw new Error('Kling: timed out waiting for video');
}
