import { crmService } from '../../services/CrmService.js';

export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;
  const actor = (req) => req.user.email ?? null;

  // ─── Stages ───────────────────────────────────────────────────────────────

  app.get('/stages', async (req) => crmService.listStages(orgId(req)));

  app.post('/stages', async (req, reply) => {
    const stage = await crmService.createStage(orgId(req), req.body);
    return reply.code(201).send(stage);
  });

  app.patch('/stages/:stageId', async (req) =>
    crmService.updateStage(orgId(req), req.params.stageId, req.body),
  );

  app.delete('/stages/:stageId', async (req, reply) => {
    await crmService.deleteStage(orgId(req), req.params.stageId);
    return reply.code(204).send();
  });

  app.post('/stages/reorder', async (req) =>
    crmService.reorderStages(orgId(req), req.body.ordered_ids),
  );

  // ─── Source Stats ─────────────────────────────────────────────────────────

  app.get('/source-stats', async (req) => crmService.getSourceStats(orgId(req)));

  // ─── Meta Sync ────────────────────────────────────────────────────────────

  app.post('/sync-meta', async (req) => crmService.syncFromMeta(orgId(req), actor(req)));

  // ─── Bulk Actions ─────────────────────────────────────────────────────────

  app.post('/bulk', async (req) => {
    const { action, lead_ids, stage_id } = req.body;
    if (action === 'delete') return crmService.bulkDelete(orgId(req), lead_ids);
    if (action === 'stage') return crmService.bulkUpdateStage(orgId(req), lead_ids, stage_id, actor(req));
    return { error: 'Unknown action' };
  });

  // ─── Export ───────────────────────────────────────────────────────────────

  app.get('/export', async (req, reply) => {
    const csv = await crmService.exportCSV(orgId(req), req.query);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="leads.csv"')
      .send(csv);
  });

  // ─── Import ───────────────────────────────────────────────────────────────

  app.post('/import', async (req) => crmService.importCSV(orgId(req), req.body.rows, actor(req)));

  // ─── Lead CRUD ────────────────────────────────────────────────────────────

  app.get('/', async (req) => {
    const { page, page_size, search, stage_id, source, owner_email, follow_up_before, follow_up_after, sort_by, sort_dir } = req.query;
    return crmService.listLeads(orgId(req), {
      page: page ? parseInt(page) : 1,
      pageSize: page_size ? parseInt(page_size) : 25,
      search,
      stageId: stage_id,
      source,
      ownerEmail: owner_email,
      followUpBefore: follow_up_before,
      followUpAfter: follow_up_after,
      sortBy: sort_by,
      sortDir: sort_dir,
    });
  });

  app.post('/', async (req, reply) => {
    const lead = await crmService.createLead(orgId(req), req.body, actor(req));
    return reply.code(201).send(lead);
  });

  app.get('/:leadId', async (req) => crmService.getLead(orgId(req), req.params.leadId));

  app.patch('/:leadId', async (req) =>
    crmService.updateLead(orgId(req), req.params.leadId, req.body, actor(req)),
  );

  app.delete('/:leadId', async (req, reply) => {
    await crmService.deleteLead(orgId(req), req.params.leadId);
    return reply.code(204).send();
  });

  app.get('/:leadId/activities', async (req) =>
    crmService.getActivities(orgId(req), req.params.leadId),
  );

  app.post('/:leadId/notes', async (req) =>
    crmService.addNote(orgId(req), req.params.leadId, req.body.text, actor(req)),
  );

  app.post('/:leadId/assign', async (req) =>
    crmService.assignLead(orgId(req), req.params.leadId, req.body.owner_email, actor(req)),
  );

  app.post('/:leadId/status', async (req) =>
    crmService.changeStage(orgId(req), req.params.leadId, req.body.stage_id, actor(req)),
  );

  app.post('/:leadId/ai-summary', async (req) =>
    crmService.generateAISummary(orgId(req), req.params.leadId, actor(req)),
  );
}
