import { randomUUID } from 'node:crypto';

import { AppError, badRequest, notFound } from '../lib/errors.js';
import {
  buildKlingPrompt,
  createKlingClient,
  formatKlingRenderError,
  klingGenerateAndPoll,
  resolveKlingConfig,
} from './klingClient.js';
import {
  buildModelsLabPrompt,
  createModelsLabClient,
  formatModelsLabRenderError,
  modelsLabGenerateAndPoll,
  modelsLabGenerateImageToVideoAndPoll,
  resolveModelsLabConfig,
} from './modelsLabClient.js';
import {
  buildShotstackVideoStitchPayload,
  pollShotstackRenderUntilDone,
  resolveShotstackEditConfig,
  submitShotstackRender,
} from './shotstackClient.js';
import { parseScenesFromScript } from './storyboardSceneParser.js';
import {
  formatHeyGenRenderError,
  heyGenGenerateAvatarVideoFromScript,
  resolveHeyGenConfig,
} from './heygenClient.js';
import {
  createReplicateClient,
  formatReplicateRenderError,
  replicateGenerateTextToVideo,
  replicateGenerateImageToVideo,
  resolveReplicateConfig,
} from './replicateVideoClient.js';
import {
  createOpenAIClient,
  enhancePromptForVideo,
  generateStoryboardScriptFromBrief,
  resolveOpenAIConfig,
} from './promptEnhancerService.js';

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

  /**
   * Rewrite script via OpenAI for clearer scene/visual direction (requires OPENAI_API_KEY).
   */
  async enhanceScript(_organizationId, body = {}) {
    const raw = typeof body.script === 'string' ? body.script : '';
    const trimmed = raw.trim();
    if (!trimmed) throw badRequest('Provide a non-empty script to enhance.');

    const oa = resolveOpenAIConfig();
    if (!oa) {
      throw new AppError('Script enhancement requires OPENAI_API_KEY in the backend environment.', {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const client = createOpenAIClient(oa);
    let enhanced;
    try {
      enhanced = await enhancePromptForVideo(client, trimmed, oa, { throwOnFailure: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Script enhancement failed';
      throw new AppError(msg, { statusCode: 502, code: 'ENHANCEMENT_FAILED' });
    }

    const capped =
      enhanced.length > MAX_SCRIPT_CHARS ? enhanced.slice(0, MAX_SCRIPT_CHARS) : enhanced;
    const bundle = bundleFromUserScript({ script: capped });
    if (!bundle) throw badRequest('Enhancement produced an empty script.');
    return { script: bundle.script, hook: bundle.hook, caption: bundle.caption };
  }

  /**
   * Draft a voiceover/storyboard script from a short idea (requires OPENAI_API_KEY).
   */
  async generateScriptFromBrief(_organizationId, body = {}) {
    const raw = typeof body.prompt === 'string' ? body.prompt : '';
    const trimmed = raw.trim();
    if (!trimmed) throw badRequest('Provide a non-empty prompt or brief to generate a script.');

    const styleRaw = typeof body.style === 'string' ? body.style.trim() : '';
    const style = styleRaw ? styleRaw.slice(0, 120) : 'cinematic';

    const oa = resolveOpenAIConfig();
    if (!oa) {
      throw new AppError('Script generation requires OPENAI_API_KEY in the backend environment.', {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const client = createOpenAIClient(oa);
    let generated;
    try {
      generated = await generateStoryboardScriptFromBrief(client, trimmed, oa, style);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Script generation failed';
      throw new AppError(msg, { statusCode: 502, code: 'SCRIPT_GENERATION_FAILED' });
    }

    const capped =
      generated.length > MAX_SCRIPT_CHARS ? generated.slice(0, MAX_SCRIPT_CHARS) : generated;
    const bundle = bundleFromUserScript({ script: capped });
    if (!bundle) throw badRequest('Generation produced an empty script.');
    return { script: bundle.script, hook: bundle.hook, caption: bundle.caption };
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

  /**
   * Start image-to-video render (Models Lab only)
   */
  startImageToVideoRender(organizationId, creativeId, body = {}) {
    const m = orgMap(this._byOrg, organizationId);
    const existing = m.get(creativeId);
    if (!existing) throw notFound('Creative not found');

    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    if (!imageUrl) throw badRequest('Provide a valid image URL for image-to-video generation');

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

    const jobId = randomUUID();
    existing.render = {
      jobId,
      status: 'queued',
      progress: 0,
      videoUrl: null,
      error: null,
      generationType: 'image-to-video',
    };
    existing.updatedAt = new Date().toISOString();

    void this._runImageToVideoRenderPipeline(m, creativeId, jobId, existing, imageUrl);

    return {
      jobId,
      status: existing.render.status,
      creativeId,
      generationType: 'image-to-video',
    };
  }

  async _runImageToVideoRenderPipeline(map, creativeId, jobId, row, imageUrl) {
    const modelsLabCfg = resolveModelsLabConfig();
    const replicateCfg = resolveReplicateConfig();

    // Priority: Models Lab → Replicate
    if (modelsLabCfg) {
      try {
        await this._runModelsLabImageToVideoRender(map, creativeId, jobId, modelsLabCfg, row, imageUrl);
      } catch (err) {
        const detail = formatModelsLabRenderError(err);
        this._touchRender(map, creativeId, jobId, {
          status: 'failed',
          progress: 0,
          videoUrl: null,
          error: detail,
        });
        this.log?.error?.({ err, creativeId, jobId }, 'Models Lab image-to-video render failed');
      }
      return;
    }

    if (!replicateCfg) {
      this._touchRender(map, creativeId, jobId, {
        status: 'failed',
        progress: 0,
        videoUrl: null,
        error: 'Image-to-video generation requires MODELS_LAB_API_KEY or REPLICATE_API_KEY in the backend environment.',
      });
      return;
    }

    try {
      await this._runReplicateImageToVideoRender(map, creativeId, jobId, replicateCfg, row, imageUrl);
    } catch (err) {
      const detail = formatReplicateRenderError(err);
      this._touchRender(map, creativeId, jobId, {
        status: 'failed',
        progress: 0,
        videoUrl: null,
        error: detail,
      });
      this.log?.error?.({ err, creativeId, jobId }, 'Replicate image-to-video render failed');
    }
  }

  /** Script → Models Lab, HeyGen (avatar+TTS), Replicate, or Kling. */
  async _runRenderPipeline(map, creativeId, jobId, row) {
    const modelsLabCfg = resolveModelsLabConfig();
    const heyGenCfg = resolveHeyGenConfig();
    const replicateCfg = resolveReplicateConfig();
    const klingCfg = resolveKlingConfig();

    // Priority: Models Lab → HeyGen → Replicate → Kling
    if (modelsLabCfg) {
      try {
        await this._runModelsLabRender(map, creativeId, jobId, modelsLabCfg, row);
      } catch (err) {
        const detail = formatModelsLabRenderError(err);
        this._touchRender(map, creativeId, jobId, {
          status: 'failed',
          progress: 0,
          videoUrl: null,
          error: detail,
        });
        this.log?.error?.({ err, creativeId, jobId }, 'Models Lab render failed');
      }
      return;
    }

    if (heyGenCfg) {
      try {
        await this._runHeyGenRender(map, creativeId, jobId, heyGenCfg, row);
      } catch (err) {
        const detail = formatHeyGenRenderError(err);
        this._touchRender(map, creativeId, jobId, {
          status: 'failed',
          progress: 0,
          videoUrl: null,
          error: detail,
        });
        this.log?.error?.({ err, creativeId, jobId }, 'HeyGen render failed');
      }
      return;
    }

    if (replicateCfg) {
      try {
        await this._runReplicateRender(map, creativeId, jobId, replicateCfg, row);
      } catch (err) {
        const detail = formatReplicateRenderError(err);
        this._touchRender(map, creativeId, jobId, {
          status: 'failed',
          progress: 0,
          videoUrl: null,
          error: detail,
        });
        this.log?.error?.({ err, creativeId, jobId }, 'Replicate render failed');
      }
      return;
    }

    if (!klingCfg) {
      this._touchRender(map, creativeId, jobId, {
        status: 'failed',
        progress: 0,
        videoUrl: null,
        error:
          'Video generation requires MODELS_LAB_API_KEY, HeyGen (HEYGEN_API_KEY + HEYGEN_AVATAR_ID + HEYGEN_VOICE_ID), REPLICATE_API_KEY, or KLING keys in the backend environment.',
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

  async _runHeyGenRender(map, creativeId, jobId, cfg, row) {
    const script = typeof row.script === 'string' ? row.script : '';
    const hook = typeof row.hook === 'string' ? row.hook : '';
    const caption = typeof row.caption === 'string' ? row.caption : '';

    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const url = await heyGenGenerateAvatarVideoFromScript(
      { script, hook, caption },
      cfg,
      {
        isCancelled: () => {
          const cur = map.get(creativeId);
          return !cur?.render || cur.render.jobId !== jobId;
        },
        onProgress: (n) => this._touchRender(map, creativeId, jobId, { progress: n }),
      },
    );

    this._touchRender(map, creativeId, jobId, {
      status: 'completed',
      progress: 100,
      videoUrl: url,
    });
    this.log?.info?.({ creativeId, jobId }, 'HeyGen render completed');
  }

  async _runModelsLabRender(map, creativeId, jobId, cfg, row) {
    const { script } = row;

    const maxScenesRaw = parseInt(process.env.MODELS_LAB_MAX_SCENES?.trim() || '24', 10);
    const maxScenes = Number.isFinite(maxScenesRaw)
      ? Math.min(32, Math.max(1, maxScenesRaw))
      : 24;
    const allScenes = parseScenesFromScript(script);
    const scenes = allScenes.slice(0, maxScenes);

    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const isCancelled = () => {
      const cur = map.get(creativeId);
      return !cur?.render || cur.render.jobId !== jobId;
    };

    if (scenes.length >= 2) {
      const stitchCfg = resolveShotstackEditConfig();
      if (!stitchCfg) {
        throw new Error(
          'Multi-scene scripts need SHOTSTACK_API_KEY or SHOTSTACK_STAGE_API_KEY in the backend environment to merge scene clips. Models Lab only outputs a few seconds per clip.',
        );
      }

      const client = createModelsLabClient(cfg);
      const clipMeta = [];
      const span = 82;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneCfg = { ...cfg, clipTargetSec: scene.targetDurationSec };
        const base = 6 + (i / scenes.length) * span;

        const url = await modelsLabGenerateAndPoll(
          client,
          scene.prompt,
          sceneCfg,
          {
            isCancelled,
            onProgress: (n) => {
              const p = base + (n / 100) * (span / scenes.length);
              this._touchRender(map, creativeId, jobId, { progress: Math.min(92, Math.round(p)) });
            },
          },
          { external_task_id: `${creativeId}_${jobId}_s${scene.index}` },
        );

        clipMeta.push({
          src: url,
          lengthSec: Math.min(8, Math.max(2, scene.targetDurationSec)),
        });
      }

      this._touchRender(map, creativeId, jobId, { progress: 90 });

      const payload = buildShotstackVideoStitchPayload(clipMeta);
      const renderId = await submitShotstackRender(stitchCfg, payload);

      const finalUrl = await pollShotstackRenderUntilDone(stitchCfg, renderId, {
        isCancelled,
        onProgress: (n) =>
          this._touchRender(map, creativeId, jobId, { progress: 90 + Math.round(n * 0.1) }),
      });

      this._touchRender(map, creativeId, jobId, {
        status: 'completed',
        progress: 100,
        videoUrl: finalUrl,
      });
      this.log?.info?.(
        { creativeId, jobId, sceneCount: scenes.length },
        'Models Lab multi-scene render completed',
      );
      return;
    }

    const client = createModelsLabClient(cfg);
    const singleScene = scenes.length === 1 ? scenes[0] : null;
    const prompt = singleScene ? singleScene.prompt : buildModelsLabPrompt(script);
    const runCfg = singleScene
      ? { ...cfg, clipTargetSec: singleScene.targetDurationSec }
      : cfg;

    const url = await modelsLabGenerateAndPoll(
      client,
      prompt,
      runCfg,
      {
        isCancelled,
        onProgress: (n) => this._touchRender(map, creativeId, jobId, { progress: n }),
      },
      { external_task_id: `${creativeId}_${jobId}` },
    );

    this._touchRender(map, creativeId, jobId, {
      status: 'completed',
      progress: 100,
      videoUrl: url,
    });
    this.log?.info?.({ creativeId, jobId }, 'Models Lab render completed');
  }

  async _runModelsLabImageToVideoRender(map, creativeId, jobId, cfg, row, imageUrl) {
    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const client = createModelsLabClient(cfg);
    const prompt = row.script ? buildModelsLabPrompt(row.script) : '';

    const url = await modelsLabGenerateImageToVideoAndPoll(
      client,
      imageUrl,
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
    this.log?.info?.({ creativeId, jobId }, 'Models Lab image-to-video render completed');
  }

  async _runReplicateRender(map, creativeId, jobId, cfg, row) {
    const { script } = row;

    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const client = createReplicateClient(cfg);
    const prompt = (script || '').trim() || 'A serene landscape';

    const url = await replicateGenerateTextToVideo(
      client,
      prompt,
      cfg,
      {
        isCancelled: () => {
          const cur = map.get(creativeId);
          return !cur?.render || cur.render.jobId !== jobId;
        },
        onProgress: (n) => this._touchRender(map, creativeId, jobId, { progress: n }),
      },
      { seed: Math.floor(Math.random() * 1000000) },
    );

    this._touchRender(map, creativeId, jobId, {
      status: 'completed',
      progress: 100,
      videoUrl: url,
    });
    this.log?.info?.({ creativeId, jobId }, 'Replicate render completed');
  }

  async _runReplicateImageToVideoRender(map, creativeId, jobId, cfg, row, imageUrl) {
    this._touchRender(map, creativeId, jobId, { status: 'processing', progress: 6 });

    const client = createReplicateClient(cfg);
    const prompt = row.script ? (row.script.trim() || 'Continue the motion naturally') : 'Continue the motion naturally';

    const i2vCfg = { ...cfg, model: cfg.imageModel || cfg.model };

    const url = await replicateGenerateImageToVideo(
      client,
      imageUrl,
      prompt,
      i2vCfg,
      {
        isCancelled: () => {
          const cur = map.get(creativeId);
          return !cur?.render || cur.render.jobId !== jobId;
        },
        onProgress: (n) => this._touchRender(map, creativeId, jobId, { progress: n }),
      },
      { seed: Math.floor(Math.random() * 1000000) },
    );

    this._touchRender(map, creativeId, jobId, {
      status: 'completed',
      progress: 100,
      videoUrl: url,
    });
    this.log?.info?.({ creativeId, jobId }, 'Replicate image-to-video render completed');
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
