import { genUIService } from '../../services/GenUIService.js';
import { env } from '../../config/env.js';

// GenUI routes — chat streaming + conversation history CRUD.
export default async function routes(app) {
  app.addHook('onRequest', app.authenticate);

  const orgId = (req) => req.user.organization_id ?? req.user.id;

  // ── POST /genui/chat ─────────────────────────────────────────────────────
  // Streams SSE events. Pass `conversation_id` to continue an existing session;
  // omit it to start a new one. The server emits `event: conversation_id` first
  // so the client can store the ID for subsequent turns.
  app.post('/chat', async (req, reply) => {
    const { messages = [], conversation_id = null } = req.body ?? {};

    if (!Array.isArray(messages)) {
      return reply.code(400).send({ error: 'messages must be an array' });
    }

    const safeMessages = messages
      .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content }));

    // reply.raw.writeHead() bypasses Fastify's pipeline, so @fastify/cors never
    // gets to add Access-Control-Allow-Origin. Add it manually here.
    const allowedOrigins = new Set(env.CORS_ORIGINS);
    const requestOrigin = req.headers.origin ?? '';
    const corsOrigin = allowedOrigins.has(requestOrigin)
      ? requestOrigin
      : (env.CORS_ORIGINS[0] ?? '*');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const sseEmitter = (event, data) => {
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // client disconnected
      }
    };

    await genUIService.streamChat(safeMessages, orgId(req), sseEmitter, conversation_id ?? null);

    reply.raw.end();
  });

  // ── GET /genui/conversations ─────────────────────────────────────────────
  // List all conversations for the org, most recent first.
  app.get('/conversations', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '30', 10), 100);
    const conversations = await genUIService.listConversations(orgId(req), limit);
    return { conversations };
  });

  // ── GET /genui/conversations/:id/messages ────────────────────────────────
  // Fetch all messages for a conversation (to restore chat history on load).
  app.get('/conversations/:id/messages', async (req, reply) => {
    const messages = await genUIService.getConversationMessages(req.params.id, orgId(req));
    if (!messages) return reply.code(404).send({ error: 'Conversation not found' });
    return { messages };
  });

  // ── DELETE /genui/conversations/:id ─────────────────────────────────────
  // Delete a conversation and all its messages.
  app.delete('/conversations/:id', async (req, reply) => {
    const deleted = await genUIService.deleteConversation(req.params.id, orgId(req));
    if (!deleted) return reply.code(404).send({ error: 'Conversation not found' });
    return { deleted: true };
  });
}
