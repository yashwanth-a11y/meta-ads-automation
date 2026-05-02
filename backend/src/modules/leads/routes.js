import { notImplemented } from '../../lib/errors.js';

// MS2 — CRM. Schema: name, phone (E.164), email, custom fields, attribution
// lineage (campaign/adset/ad/creative + UTMs), status (New, Contacted,
// Interested, Demo Booked, Won, Lost), owner, follow-up time, notes,
// received_at, touched_at. Auto-assign (round-robin or rules), SLA timers,
// dedup on phone+email (30d window).
export default async function routes(app) {
  app.get('/', async () => {
    throw notImplemented('leads.list');
  });

  app.get('/:leadId', async () => {
    throw notImplemented('leads.get');
  });

  app.post('/', async () => {
    throw notImplemented('leads.create');
  });

  app.patch('/:leadId', async () => {
    throw notImplemented('leads.update');
  });

  app.post('/:leadId/notes', async () => {
    throw notImplemented('leads.notes.add');
  });

  app.post('/:leadId/assign', async () => {
    throw notImplemented('leads.assign');
  });

  app.post('/:leadId/status', async () => {
    throw notImplemented('leads.status');
  });

  // Bulk
  app.post('/import', async () => {
    throw notImplemented('leads.import');
  });

  app.get('/export', async () => {
    throw notImplemented('leads.export');
  });

  // Right-to-erasure on PII
  app.delete('/:leadId/pii', async () => {
    throw notImplemented('leads.pii.erase');
  });
}
