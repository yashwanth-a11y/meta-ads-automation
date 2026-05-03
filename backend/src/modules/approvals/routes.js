import { approvalService } from '../../services/ApprovalService.js';

// Approval routes — three stages:
//   topic_selection → user picks a trend (from email link)
//   content_review  → user reviews hook/script/caption, can give feedback
//   video_review    → user reviews rendered video, can publish or give feedback
//
// Public token-gated routes (no JWT) are served from email links.
// Authenticated routes are for the dashboard.

export default async function routes(app) {
  const orgId = (req) => req.user.organization_id ?? req.user.id;

  // ── Public: universal review entry point ─────────────────────────────────
  // Figures out the stage from the DB record and renders the right HTML page.
  app.get('/review/:token', { config: { skipAuth: true } }, async (req, reply) => {
    const { token } = req.params;
    const result = await approvalService.getReviewPage(token);

    if (result.type === 'error') {
      return reply.type('text/html').send(_errorPage(result.message));
    }

    const { record } = result;
    const { approval, bundle } = record;

    if (approval.stage === 'topic_selection') {
      const trends = approval.metadata?.trends ?? [];
      return reply.type('text/html').send(_topicSelectionPage({ token, trends, channel_id: approval.metadata?.channel_id }));
    }

    if (approval.stage === 'content_review') {
      return reply.type('text/html').send(_contentReviewPage({ token, bundle }));
    }

    if (approval.stage === 'video_review') {
      return reply.type('text/html').send(_videoReviewPage({ token, bundle }));
    }

    return reply.type('text/html').send(_errorPage('Unknown approval stage.'));
  });

  // ── Public: topic selection ───────────────────────────────────────────────
  app.get('/review/:token/select/:trendId', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleTopicSelect(req.params.token, req.params.trendId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(
      result.ok ? _successPage(result.message) : _errorPage(result.message),
    );
  });

  // ── Public: content review actions ───────────────────────────────────────
  app.get('/review/:token/content/approve', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleContentAction(req.params.token, 'approve', {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  app.post('/review/:token/content/regenerate', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleContentAction(req.params.token, 'regenerate', {
      feedback: req.body?.feedback,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  app.get('/review/:token/content/reject', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleContentAction(req.params.token, 'reject', {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  // ── Public: video review actions ─────────────────────────────────────────
  app.get('/review/:token/video/approve', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleVideoAction(req.params.token, 'approve', {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  app.post('/review/:token/video/regenerate', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleVideoAction(req.params.token, 'regenerate', {
      feedback: req.body?.feedback,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  app.get('/review/:token/video/reject', { config: { skipAuth: true } }, async (req, reply) => {
    const result = await approvalService.handleVideoAction(req.params.token, 'reject', {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return reply.type('text/html').send(result.ok ? _successPage(result.message) : _errorPage(result.message));
  });

  // ── Authenticated: dashboard ──────────────────────────────────────────────
  app.get('/', { preHandler: app.requireAuth }, async (req) => {
    return approvalService.listPending(orgId(req));
  });

  app.post('/:approvalId/resend', { preHandler: app.requireAuth }, async (req) => {
    return approvalService.resend(req.params.approvalId, orgId(req));
  });

  // Dashboard: take action directly (approve / reject / regenerate) without email token
  app.post('/:approvalId/action', { preHandler: app.requireAuth }, async (req, reply) => {
    const { action, feedback } = req.body ?? {};
    if (!action) throw app.httpErrors.badRequest('action is required');
    const result = await approvalService.takeActionById(req.params.approvalId, orgId(req), action, { feedback });
    if (!result.ok) throw app.httpErrors.badRequest(result.message);
    return reply.code(200).send(result);
  });

  // Dashboard: select a trend topic directly without email token
  app.post('/:approvalId/select-topic', { preHandler: app.requireAuth }, async (req, reply) => {
    const { trend_id } = req.body ?? {};
    if (!trend_id) throw app.httpErrors.badRequest('trend_id is required');
    const result = await approvalService.selectTopicById(req.params.approvalId, orgId(req), trend_id);
    if (!result.ok) throw app.httpErrors.badRequest(result.message);
    return reply.code(200).send(result);
  });

  // Manual: send topic selection email for a channel
  app.post('/send-topics/:channelId', { preHandler: app.requireAuth }, async (req, reply) => {
    const { channelService } = await import('../../services/ChannelService.js');
    const { contentIntelligenceService } = await import('../../services/ContentIntelligenceService.js');

    const channel = await channelService.get(orgId(req), req.params.channelId);
    const topTrends = await contentIntelligenceService.getTopForChannel(channel.id, orgId(req), { limit: 5, minScore: 5 });

    if (!topTrends.length) {
      return reply.code(400).send({ error: 'No scored trends available yet. Run the pipeline first.' });
    }

    const approvalId = await approvalService.sendTopicSelectionEmail(channel, topTrends);
    return reply.code(200).send({ sent: true, approvalId, trends_count: topTrends.length });
  });

  // Admin/dev: manual full pipeline trigger
  app.post('/pipeline/trigger', { preHandler: app.requireAuth }, async (req, reply) => {
    const { runPipeline } = await import('../../scheduler.js');
    runPipeline(app.log).catch((err) => app.log.error({ err }, 'Manual pipeline run failed'));
    return reply.code(202).send({ message: 'Pipeline run started' });
  });
}

// ─── HTML page helpers ────────────────────────────────────────────────────────

function _shell(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — PhotonX GrowthOS</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .wrap{max-width:600px;width:100%}
  .card{background:#12122a;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
  .hdr{background:linear-gradient(135deg,#22D3EE,#6c63ff);padding:32px;text-align:center}
  .hdr h1{margin:0;font-size:22px;color:#fff;font-weight:800}
  .hdr p{margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px}
  .body{padding:32px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#22D3EE;font-weight:700;margin:0 0 6px}
  .val{background:#0a0a1e;border-radius:8px;padding:13px 15px;margin-bottom:18px;font-size:13px;line-height:1.6;color:#c0c0e0}
  .val.hook{border-left:3px solid #22D3EE;font-size:15px;font-style:italic;color:#e0e0f0}
  .trend-card{background:#0a0a1e;border-radius:12px;padding:18px;margin-bottom:12px;border:1px solid #1e1e3e}
  .score{display:inline-block;background:#22D3EE;color:#0a0a14;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:800;margin-bottom:8px}
  .badge{display:inline-block;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;margin-left:6px;background:rgba(108,99,255,.15);color:#a89cff;border:1px solid rgba(108,99,255,.3)}
  .trend-title{font-size:15px;font-weight:700;color:#e0e0f0;margin:0 0 6px}
  .trend-idea{font-size:13px;color:#8080c0;margin:0 0 12px;line-height:1.5}
  .btn{display:block;padding:13px 20px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;margin-bottom:8px;border:none;cursor:pointer;width:100%}
  .btn-primary{background:linear-gradient(135deg,#22D3EE,#6c63ff);color:#fff}
  .btn-secondary{background:#1e1e3e;color:#b0b0d0;border:1px solid #3a3a5a}
  .btn-danger{background:transparent;color:#ff6b6b;border:1px solid #ff6b6b}
  textarea{width:100%;background:#0a0a1e;border:1px solid #3a3a5a;border-radius:8px;padding:12px;color:#e0e0f0;font-size:13px;line-height:1.5;resize:vertical;min-height:80px;font-family:inherit;margin-bottom:8px}
  textarea:focus{outline:none;border-color:#22D3EE}
  .footer{padding:16px 32px;border-top:1px solid #1e1e3e;font-size:12px;color:#555;text-align:center}
  .hashtag{display:inline-block;background:#1e1e3e;color:#8080c0;border-radius:20px;padding:3px 10px;font-size:12px;margin:2px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function _topicSelectionPage({ token, trends }) {
  const cards = trends.map((t) => {
    const score = t.brand_fit?.composite_score ?? 0;
    const idea = t.brand_fit?.adaptation_idea ?? '';
    return `<div class="trend-card">
      <span class="score">${Number(score).toFixed(1)} fit</span>
      <span class="badge">${t.lifecycle_stage ?? 'sprout'}</span>
      <p class="trend-title">${t.title}</p>
      ${idea ? `<p class="trend-idea">💡 ${idea}</p>` : ''}
      <a href="/api/v1/approvals/review/${token}/select/${t.id}" class="btn btn-primary">Use this topic →</a>
    </div>`;
  }).join('');

  return _shell('Pick a topic', `<div class="card">
    <div class="hdr"><h1>🔥 Pick a trending topic</h1><p>Click one to generate your content</p></div>
    <div class="body">${cards}</div>
    <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
  </div>`);
}

function _contentReviewPage({ token, bundle }) {
  const hashtags = (bundle?.hashtags ?? []).map((h) => `<span class="hashtag">#${h}</span>`).join('');
  const base = `/api/v1/approvals/review/${token}`;

  return _shell('Review Content', `<div class="card">
    <div class="hdr"><h1>✍️ Review your content</h1><p>Stage 2 of 3 — Approve or give feedback</p></div>
    <div class="body">
      <div class="label">Hook — First 3 seconds</div>
      <div class="val hook">${bundle?.hook ?? '—'}</div>
      <div class="label">Script</div>
      <div class="val">${bundle?.script ?? '—'}</div>
      <div class="label">Caption</div>
      <div class="val">${(bundle?.caption ?? '—').slice(0, 400)}</div>
      ${hashtags ? `<div class="label">Hashtags</div><div style="margin-bottom:18px">${hashtags}</div>` : ''}

      <a href="${base}/content/approve" class="btn btn-primary">✅ Approve &amp; Generate Video</a>

      <div class="label" style="margin-top:20px">Want changes? Describe them and regenerate</div>
      <form action="${base}/content/regenerate" method="POST">
        <textarea name="feedback" placeholder="e.g. Make the hook punchier, focus on time-saving benefits..."></textarea>
        <button type="submit" class="btn btn-secondary">✏️ Regenerate with feedback</button>
      </form>

      <a href="${base}/content/reject" class="btn btn-danger" style="margin-top:8px">❌ Reject</a>
    </div>
    <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
  </div>`);
}

function _videoReviewPage({ token, bundle }) {
  const base = `/api/v1/approvals/review/${token}`;
  const videoBlock = bundle?.video_url
    ? `<div style="text-align:center;margin-bottom:24px"><a href="${bundle.video_url}" style="display:inline-block;background:#0a0a1e;border:2px dashed #22D3EE;border-radius:16px;padding:28px 40px;text-decoration:none;color:#22D3EE;font-size:17px;font-weight:700;">▶ Watch Video</a></div>`
    : `<div style="text-align:center;margin-bottom:24px;background:#0a0a1e;border-radius:16px;padding:24px;color:#555">Video rendering…</div>`;

  return _shell('Video Ready', `<div class="card">
    <div class="hdr"><h1>🎬 Your video is ready</h1><p>Stage 3 of 3 — Final approval</p></div>
    <div class="body">
      ${videoBlock}
      <div class="label">Hook</div>
      <div class="val hook">${bundle?.hook ?? '—'}</div>
      <div class="label">Caption</div>
      <div class="val">${(bundle?.caption ?? '—').slice(0, 300)}</div>

      <a href="${base}/video/approve" class="btn btn-primary">✅ Approve &amp; Publish to Instagram</a>

      <div class="label" style="margin-top:20px">Want a different video?</div>
      <form action="${base}/video/regenerate" method="POST">
        <textarea name="feedback" placeholder="e.g. More dynamic cuts, show the product in use..."></textarea>
        <button type="submit" class="btn btn-secondary">🔄 Regenerate Video</button>
      </form>

      <a href="${base}/video/reject" class="btn btn-danger" style="margin-top:8px">❌ Reject</a>
    </div>
    <div class="footer">Link expires in 48 hours · PhotonX GrowthOS</div>
  </div>`);
}

function _successPage(message) {
  return _shell('Done', `<div class="card">
    <div class="hdr"><h1>✅ Done</h1><p>PhotonX GrowthOS</p></div>
    <div class="body"><p style="font-size:16px;line-height:1.6;color:#c0c0e0;margin:0">${message}</p></div>
    <div class="footer">You can close this tab.</div>
  </div>`);
}

function _errorPage(message) {
  return _shell('Link Issue', `<div class="card">
    <div class="hdr" style="background:linear-gradient(135deg,#ff6b6b,#ff9a3c)"><h1>⚠️ Link Issue</h1><p>PhotonX GrowthOS</p></div>
    <div class="body"><p style="font-size:16px;line-height:1.6;color:#c0c0e0;margin:0">${message}</p></div>
    <div class="footer">Contact your GrowthOS admin for a new link.</div>
  </div>`);
}
