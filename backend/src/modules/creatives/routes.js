import { PassThrough } from 'node:stream';

import { AppError, badRequest, forbidden, notImplemented } from '../../lib/errors.js';
import { resolveOpenAIConfig, streamStoryboardScriptFromBrief } from '../../services/promptEnhancerService.js';

function requireTenant(request) {
  const org = request.tenantId ?? request.user?.organization_id;
  if (!org) throw forbidden('Missing organization context');
  return org;
}

// MS1 — creative bundle + render job (in-memory per org; swap for DB + queue later).
export default async function routes(app) {
  const service = app.creativeService;
  const adsService = app.adsService;

  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request) => {
    const orgId = requireTenant(request);
    return { creatives: service.list(orgId) };
  });

  app.post(
    '/generate',
    {
      schema: {
        description: 'Create a creative from a non-empty script (required).',
        tags: ['creatives'],
        body: {
          type: 'object',
          required: ['script'],
          properties: {
            script: { type: 'string', description: 'Voiceover / storyboard text for the configured video backend.' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const creative = await service.generate(orgId, request.body ?? {});
      return { creative };
    },
  );

  app.post(
    '/enhance-script',
    {
      schema: {
        description:
          'Rewrite the script with GPT (OPENAI_API_KEY) for clearer visuals and pacing before video generation.',
        tags: ['creatives'],
        body: {
          type: 'object',
          required: ['script'],
          properties: {
            script: { type: 'string', description: 'Voiceover / storyboard text to enhance.' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const result = await service.enhanceScript(orgId, request.body ?? {});
      return result;
    },
  );

  app.post(
    '/generate-script',
    {
      schema: {
        description:
          'Draft a voiceover/storyboard script from a short idea using GPT (OPENAI_API_KEY). Optional style tweaks tone.',
        tags: ['creatives'],
        body: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: {
              type: 'string',
              description: 'Product, offer, audience, or story idea to expand into a script.',
            },
            style: {
              type: 'string',
              description: 'Optional tone hint (e.g. upbeat, minimal, luxury).',
            },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      return service.generateScriptFromBrief(orgId, request.body ?? {});
    },
  );

  app.post(
    '/generate-script-stream',
    {
      schema: {
        description:
          'Stream a voiceover/storyboard script from a brief (SSE). Same OpenAI model as generate-script; tokens arrive in real time.',
        tags: ['creatives'],
        body: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: { type: 'string' },
            style: { type: 'string', description: 'Optional tone hint.' },
          },
        },
      },
    },
    async (request, reply) => {
      requireTenant(request);

      const body = request.body ?? {};
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) throw badRequest('Provide a non-empty prompt or brief to generate a script.');

      const styleRaw = typeof body.style === 'string' ? body.style.trim() : '';
      const style = styleRaw ? styleRaw.slice(0, 120) : 'cinematic';

      const oa = resolveOpenAIConfig();
      if (!oa) {
        throw new AppError('Script generation requires OPENAI_API_KEY in the backend environment.', {
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const out = new PassThrough();
      const abort = new AbortController();
      request.raw.on('close', () => abort.abort());

      void (async () => {
        try {
          await streamStoryboardScriptFromBrief(prompt, oa, style, {
            signal: abort.signal,
            onDelta: (t) => {
              if (!out.writableEnded) out.write(`data: ${JSON.stringify({ t })}\n\n`);
            },
          });
          if (!out.writableEnded) out.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream failed';
          if (!out.writableEnded) out.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        } finally {
          out.end();
        }
      })();

      return reply
        .code(200)
        .header('Content-Type', 'text/event-stream; charset=utf-8')
        .header('Cache-Control', 'no-cache, no-transform')
        .header('Connection', 'keep-alive')
        .header('X-Accel-Buffering', 'no')
        .send(out);
    },
  );

  app.get(
    '/:creativeId/render-status',
    {
      schema: {
        description: 'Poll video render job for a creative',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const status = service.renderStatus(orgId, creativeId);
      return { render: status };
    },
  );

  app.post(
    '/:creativeId/render',
    {
      schema: {
        description: 'Start async script→video (Models Lab, HeyGen, Replicate, or Kling). Optional body.script updates copy first.',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            script: { type: 'string', description: 'If non-empty, updates creative script before render.' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const job = service.startRender(orgId, creativeId, request.body ?? {});
      return { job };
    },
  );

  app.post(
    '/:creativeId/render-image-to-video',
    {
      schema: {
        description: 'Start async image-to-video render (Models Lab only).',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['imageUrl'],
          properties: {
            imageUrl: { type: 'string', description: 'URL of the image to convert to video.' },
            script: { type: 'string', description: 'Optional script for generating narrative or style context.' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const job = service.startImageToVideoRender(orgId, creativeId, request.body ?? {});
      return { job };
    },
  );

  app.post(
    '/:creativeId/regenerate',
    {
      schema: {
        description: 'Replace creative script (non-empty required).',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['script'],
          properties: {
            script: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const creative = await service.regenerate(orgId, creativeId, request.body ?? {});
      return { creative };
    },
  );

  app.post(
    '/:creativeId/publish-meta',
    {
      schema: {
        description:
          'Upload the rendered video to the connected Meta ad account, create an ad creative (Page + video), and return Ads Manager link.',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: 'Creative title (maps to video title).' },
            primaryText: { type: 'string', description: 'Body copy on the creative.' },
            destinationUrl: { type: 'string', description: 'Optional https link for LEARN_MORE CTA.' },
          },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const creative = service.get(orgId, creativeId);
      const r = creative.render;
      if (!r || r.status !== 'completed' || !r.videoUrl) {
        throw badRequest('Video must finish rendering before publishing to Meta.');
      }

      const body = request.body ?? {};
      const result = await adsService.publishStudioRenderVideoToMeta(orgId, {
        videoUrl: r.videoUrl,
        name: creative.hook || `Creative ${creativeId.slice(0, 8)}`,
        headline: typeof body.headline === 'string' ? body.headline : creative.hook,
        primaryText: typeof body.primaryText === 'string' ? body.primaryText : creative.caption,
        destinationUrl: typeof body.destinationUrl === 'string' ? body.destinationUrl : undefined,
      });
      return { publish: result };
    },
  );

  app.get(
    '/:creativeId',
    {
      schema: {
        description: 'Get one creative by id',
        tags: ['creatives'],
        params: {
          type: 'object',
          required: ['creativeId'],
          properties: { creativeId: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const orgId = requireTenant(request);
      const { creativeId } = request.params;
      const creative = service.get(orgId, creativeId);
      return { creative };
    },
  );

  app.post('/:creativeId/score', async () => {
    throw notImplemented('creatives.score');
  });

  app.get('/:creativeId/score', async () => {
    throw notImplemented('creatives.scoreGet');
  });
}
