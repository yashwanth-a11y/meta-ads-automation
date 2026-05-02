import { approvalService } from '../../services/ApprovalService.js';

// Approval routes — two kinds:
//   • Public token-gated (no JWT auth) — served from email links
//   • Authenticated (dashboard)

export default async function routes(app) {
  const orgId = (req) => req.user.sub;

  // ── Public: review page (GET from email link) ──────────────────────────────
  // Returns a styled HTML page showing content preview + action buttons.
  // Buttons call the POST endpoints below via a small inline script.
  app.get('/review/:token', { config: { skipAuth: true } }, async (req, reply) => {
    const { token } = req.params;
    const action = req.query.action; // approve | reject | regenerate

    const record = await approvalService.getByToken(token);

    if (!record) {
      return reply.type('text/html').send(_errorPage('This link is invalid or has already been used.'));
    }

    if (record.approval.action) {
      return reply.type('text/html').send(_errorPage(`This link has already been used (action: ${record.approval.action}).`));
    }

    if (record.approval.expires_at < new Date()) {
      return reply.type('text/html').send(_errorPage('This link has expired. Please ask for a new one.'));
    }

    // If action is pre-set in query string (direct click), confirm + execute
    if (action && ['approve', 'reject', 'regenerate'].includes(action)) {
      const result = await approvalService.handleAction(token, action, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return reply.type('text/html').send(_successPage(result.message));
    }

    // No action yet — show preview page with buttons
    const { bundle } = record;
    return reply.type('text/html').send(_previewPage({ token, bundle }));
  });

  // ── Public: POST action endpoints (called by preview page form) ───────────
  app.post('/review/:token/approve', { config: { skipAuth: true } }, async (req) => {
    return approvalService.handleAction(req.params.token, 'approve', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  app.post('/review/:token/reject', { config: { skipAuth: true } }, async (req) => {
    return approvalService.handleAction(req.params.token, 'reject', {
      reason: req.body?.reason,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  app.post('/review/:token/regenerate', { config: { skipAuth: true } }, async (req) => {
    return approvalService.handleAction(req.params.token, 'regenerate', {
      reason: req.body?.reason,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  // ── Authenticated: dashboard list & management ────────────────────────────
  app.get('/', { preHandler: app.requireAuth }, async (req) => {
    return approvalService.listPending(orgId(req));
  });

  app.get('/:approvalId', { preHandler: app.requireAuth }, async (req) => {
    const list = await approvalService.listPending(orgId(req), { limit: 200 });
    const item = list.find((a) => a.id === req.params.approvalId);
    if (!item) throw app.httpErrors.notFound('Approval not found');
    return item;
  });

  app.post('/:approvalId/resend', { preHandler: app.requireAuth }, async (req) => {
    return approvalService.resend(req.params.approvalId, orgId(req));
  });

  // ── Admin/dev: manual pipeline trigger ────────────────────────────────────
  // Useful for testing without waiting for the scheduler interval.
  app.post('/pipeline/trigger', { preHandler: app.requireAuth }, async (req, reply) => {
    const { runPipeline } = await import('../../scheduler.js');
    // Run async — return immediately with a job started message
    runPipeline(app.log).catch((err) => app.log.error({ err }, 'Manual pipeline run failed'));
    return reply.code(202).send({ message: 'Pipeline run started' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────────────

function _shell(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — GrowthOS</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#12122a;border-radius:20px;max-width:560px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
  .hdr{background:linear-gradient(135deg,#6c63ff,#3ecfcf);padding:32px;text-align:center}
  .hdr h1{margin:0;font-size:22px;color:#fff;font-weight:800}
  .hdr p{margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px}
  .body{padding:32px}
  .msg{font-size:16px;line-height:1.6;color:#c0c0e0;margin-bottom:28px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6c63ff;font-weight:700;margin:0 0 6px}
  .val{background:#0a0a1e;border-radius:8px;padding:13px 15px;margin-bottom:18px;font-size:13px;line-height:1.6;color:#c0c0e0}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .btn{display:inline-block;padding:13px 22px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;border:none;text-decoration:none}
  .btn-approve{background:linear-gradient(135deg,#6c63ff,#3ecfcf);color:#fff}
  .btn-regen{background:#1e1e3e;color:#b0b0d0;border:1px solid #3a3a5a}
  .btn-reject{background:transparent;color:#ff6b6b;border:1px solid #ff6b6b}
  .footer{padding:16px 32px;border-top:1px solid #1e1e3e;font-size:12px;color:#555;text-align:center}
</style></head><body>${body}</body></html>`;
}

function _previewPage({ token, bundle }) {
  const base = `/api/v1/approvals/review/${token}`;
  const isVideo = bundle?.status === 'ready';

  const content = isVideo
    ? `<div class="label">Video Preview</div>
       ${bundle.video_url ? `<div class="val"><a href="${bundle.video_url}" style="color:#3ecfcf;font-weight:700;" target="_blank">▶ Watch Video</a></div>` : '<div class="val">Video URL unavailable</div>'}
       <div class="label">Hook</div><div class="val">${bundle?.hook ?? '—'}</div>
       <div class="label">Caption</div><div class="val">${(bundle?.caption ?? '—').slice(0, 300)}</div>`
    : `<div class="label">Hook</div><div class="val">${bundle?.hook ?? '—'}</div>
       <div class="label">Script</div><div class="val">${bundle?.script ?? '—'}</div>
       <div class="label">Caption</div><div class="val">${(bundle?.caption ?? '—').slice(0, 300)}</div>`;

  const buttons = isVideo
    ? `<a href="${base}?action=approve" class="btn btn-approve">✅ Approve &amp; Publish</a>
       <a href="${base}?action=reject" class="btn btn-reject">❌ Reject</a>`
    : `<a href="${base}?action=approve" class="btn btn-approve">✅ Approve &amp; Generate Video</a>
       <a href="${base}?action=regenerate" class="btn btn-regen">✏️ Regenerate</a>
       <a href="${base}?action=reject" class="btn btn-reject">❌ Reject</a>`;

  return _shell('Review Content', `
    <div class="card">
      <div class="hdr"><h1>${isVideo ? '🎬 Video Ready' : '🔥 New Content Idea'}</h1><p>GrowthOS — Review &amp; Approve</p></div>
      <div class="body">${content}<div class="actions">${buttons}</div></div>
      <div class="footer">Link expires in 48 hours · GrowthOS</div>
    </div>`);
}

function _successPage(message) {
  return _shell('Done', `
    <div class="card">
      <div class="hdr"><h1>✅ Done</h1><p>GrowthOS</p></div>
      <div class="body"><div class="msg">${message}</div></div>
      <div class="footer">You can close this tab.</div>
    </div>`);
}

function _errorPage(message) {
  return _shell('Link Invalid', `
    <div class="card">
      <div class="hdr" style="background:linear-gradient(135deg,#ff6b6b,#ff9a3c)"><h1>⚠️ Link Issue</h1><p>GrowthOS</p></div>
      <div class="body"><div class="msg">${message}</div></div>
      <div class="footer">Contact your GrowthOS admin for a new link.</div>
    </div>`);
}
