import { randomUUID } from 'node:crypto';

import { badRequest, notFound } from '../lib/errors.js';
import {
  buildKlingPrompt,
  createKlingClient,
  formatKlingRenderError,
  klingGenerateAndPoll,
  resolveKlingConfig,
} from './klingClient.js';

const MAX_SCRIPT_CHARS = 12000;

/** Derive stored hook/caption from script only (internal fields; prompts use script). */
function bundleFromUserScript(body) {
  if (!body || typeof body.script !== 'string') return null;
  const raw = body.script.trim();
  if (!raw) return null;

  const script = raw.length > MAX_SCRIPT_CHARS ? raw.slice(0, MAX_SCRIPT_CHARS) : raw;

  const firstLine = script.split(/\r?\n/).find((line) => line.trim());
  const hook = (firstLine?.trim() || script.slice(0, 120)).slice(0, 200);
  const oneLine = script.replace(/\s+/g, ' ').trim();
  const caption =
    oneLine.length <= 220 ? oneLine : `${oneLine.slice(0, 217).trim()}…`;

  return { script, hook, caption };
}

function orgMap(store, orgId) {
  if (!store.has(orgId)) store.set(orgId, new Map());
  return store.get(orgId);
}

export class CreativeService {
  constructor({ logger } = {}) {
    this.log = logger;
    /** @type {Map<string, Map<string, object>>} */
    this._byOrg = new Map();
  }

  list(organizationId) {
    const m = orgMap(this._byOrg, organizationId);
    return [...m.values()]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        render: c.render
          ? { status: c.render.status, progress: c.render.progress, videoUrl: c.render.videoUrl }
          : null,
      }));
  }

  get(organizationId, creativeId) {
    const m = orgMap(this._byOrg, organizationId);
    const c = m.get(creativeId);
    if (!c) throw notFound('Creative not found');
    return this._toDto(c);
  }

  _toDto(c) {
    return {
      id: c.id,
      script: c.script,
      hook: c.hook,
      caption: c.caption,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      render: c.render
        ? {
            jobId: c.render.jobId,
            status: c.render.status,
            progress: c.render.progress,
            videoUrl: c.render.videoUrl,
            error: c.render.error,
          }
        : null,
    };
  }

  async generate(organizationId, body = {}) {
    const bundle = bundleFromUserScript(body);
    if (!bundle) throw badRequest('Provide a non-empty script.');

    const id = randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      organizationId,
      ...bundle,
      createdAt: now,
      updatedAt: now,
      render: null,
    };
    orgMap(this._byOrg, organizationId).set(id, row);
    return this._toDto(row);
  }

  async regenerate(organizationId, creativeId, body = {}) {
    const m = orgMap(this._byOrg, organizationId);
    const existing = m.get(creativeId);
    if (!existing) throw notFound('Creative not found');

    const bundle = bundleFromUserScript(body);
    if (!bundle) throw badRequest('Provide a non-empty script.');

    existing.script = bundle.script;
    existing.hook = bundle.hook;
    existing.caption = bundle.caption;
    existing.updatedAt = new Date().toISOString();
    existing.render = null;

    return this._toDto(existing);
  }

  /**
   * @param {object} [body] Optional `{ script }` to snapshot editor content before rendering.
   */
  startRender(organizationId, creativeId, body = {}) {
    const m = orgMap(this._byOrg, organizationId);
    const existing = m.get(creativeId);
    if (!existing) throw notFound('Creative not found');

    const incomingScript = typeof body.script === 'string' ? body.script.trim() : '';
    if (incomingScript) {
      const bundle = bundleFromUserScript(body);
      if (bundle) {
        existing.script = bundle.script;
        existing.hook = bundle.hook;
        existing.caption = bundle.caption;
        existing.updatedAt = new Date().toISOString();
      }
    }

    const script = typeof existing.script === 'string' ? existing.script.trim() : '';
    if (!script) throw badRequest('Cannot render: creative has no script');

    const jobId = randomUUID();
    existing.render = {
      jobId,
      status: 'queued',
      progress: 0,
      videoUrl: null,
      error: null,
    };
    existing.updatedAt = new Date().toISOString();

    void this._runRenderPipeline(m, creativeId, jobId, existing);

    return {
      jobId,
      status: existing.render.status,
      creativeId,
    };
  }

  /** Script → Kling text-to-video only (no other providers). */
  async _runRenderPipeline(map, creativeId, jobId, row) {
    const klingCfg = resolveKlingConfig();
    if (!klingCfg) {
      this._touchRender(map, creativeId, jobId, {
        status: 'failed',
        progress: 0,
        videoUrl: null,
        error:
          'Video generation uses Kling only. Set KLING_ACCESS_KEY and KLING_SECRET_KEY in the backend environment.',
      });
      return;
    }

    try {
      await this._runKlingRender(map, creativeId, jobId, klingCfg, row);
    } catch (err) {
      const detail = formatKlingRenderError(err);
      this._touchRender(map, creativeId, jobId, {
        status: 'failed',
        progress: 0,
        videoUrl: null,
        error: detail,
      });
      this.log?.error?.({ err, creativeId, jobId }, 'Kling render failed');
    }
  }

  async _runKlingRender(map, creativeId, jobId, cfg, row) {
    const { script } = row;

    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const api = createKlingClient(cfg);
    const prompt = buildKlingPrompt(script);

    const url = await klingGenerateAndPoll(
      api,
      prompt,
      cfg,
      {
        isCancelled: () => {
          const cur = map.get(creativeId);
          return !cur?.render || cur.render.jobId !== jobId;
        },
        onProgress: (n) => this._touchRender(map, creativeId, jobId, { progress: n }),
      },
      { external_task_id: `${creativeId}_${jobId}` },
    );

    this._touchRender(map, creativeId, jobId, {
      status: 'completed',
      progress: 100,
      videoUrl: url,
    });
    this.log?.info?.({ creativeId, jobId }, 'Kling render completed');
  }

  _touchRender(map, creativeId, jobId, patch) {
    const cur = map.get(creativeId);
    if (!cur?.render || cur.render.jobId !== jobId) return false;
    Object.assign(cur.render, patch);
    cur.updatedAt = new Date().toISOString();
    return true;
  }

  renderStatus(organizationId, creativeId) {
    const m = orgMap(this._byOrg, organizationId);
    const existing = m.get(creativeId);
    if (!existing) throw notFound('Creative not found');
    if (!existing.render) {
      return { status: 'idle', progress: 0, videoUrl: null, jobId: null };
    }
    return {
      jobId: existing.render.jobId,
      status: existing.render.status,
      progress: existing.render.progress,
      videoUrl: existing.render.videoUrl,
      error: existing.render.error,
    };
  }
}
