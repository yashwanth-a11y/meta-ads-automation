import { notImplemented } from '../../lib/errors.js';

// Inbound webhooks. Meta lead-ads webhook delivers leads in near real-time;
// signature verification (X-Hub-Signature-256) and idempotency on lead_id
// are required. Verification GET handshake required by Meta on subscribe.
export default async function routes(app) {
  // Meta verify handshake (GET) and event delivery (POST)
  app.get('/meta', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    // TODO: compare token against env.META_VERIFY_TOKEN, return challenge if match
    if (mode === 'subscribe' && token && challenge) {
      return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'meta.webhook.verify' } });
    }
    return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'invalid verify request' } });
  });

  app.post('/meta', async () => {
    throw notImplemented('webhooks.meta.event');
  });

  // Future: Resend / email-provider events, Instagram comment events, etc.
  app.post('/email', async () => {
    throw notImplemented('webhooks.email.event');
  });
}
