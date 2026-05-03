import { notificationService } from '../../services/NotificationService.js';

export default async function routes(app) {
  // SSE doesn't allow custom headers from the browser's EventSource API,
  // so we accept the JWT via ?token= query param for this endpoint only.
  app.get('/stream', {
    onRequest: async (req) => {
      const token = req.headers.authorization?.replace('Bearer ', '') ?? req.query.token;
      if (!token) throw app.httpErrors.unauthorized('Missing token');
      try {
        req.user = app.jwt.verify(token);
      } catch {
        throw app.httpErrors.unauthorized('Invalid token');
      }
    },
  }, async (req, reply) => {
    const orgId = req.user.organization_id ?? req.user.id;
    const raw = reply.raw;

    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    raw.flushHeaders();

    // Confirm connection to client
    raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Keepalive comment every 25s (prevents proxies closing idle connections)
    const heartbeat = setInterval(() => {
      try { raw.write(': ping\n\n'); } catch (_) {}
    }, 25000);

    const unsubscribe = notificationService.subscribe(orgId, raw);

    // Clean up when client disconnects
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Hold the connection open — Fastify must not send a response
    await new Promise((resolve) => req.raw.on('close', resolve));
  });
}
