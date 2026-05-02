import { forbidden, notImplemented } from '../../lib/errors.js';

function requireTenant(request) {
  const org = request.tenantId ?? request.user?.organization_id;
  if (!org) throw forbidden('Missing organization context');
  return org;
}

// MS1 — creative bundle + render job (in-memory per org; swap for DB + queue later).
export default async function routes(app) {
  const service = app.creativeService;

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
            script: { type: 'string', description: 'Voiceover / storyboard text used for Kling text-to-video.' },
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
        description: 'Start async Kling text-to-video render. Optional body.script updates copy first.',
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
