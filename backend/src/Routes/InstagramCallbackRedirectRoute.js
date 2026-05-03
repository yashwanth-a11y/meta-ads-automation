/**
 * Public redirect: catches Instagram's OAuth callback when ngrok (or any
 * reverse proxy) forwards traffic to the backend instead of the frontend,
 * and bounces the browser to the frontend `/instagram-callback` page that
 * does the actual code-for-token exchange.
 *
 * Mounted at the ROOT (no /api/v1 prefix) and unauthenticated, because the
 * customer is just bouncing back from instagram.com with no JWT.
 *
 * The route preserves all query params (`code`, `state`, optional `error`)
 * unmodified so the frontend's InstagramCallbackPage sees them exactly as
 * Meta sent them.
 */
import { env } from '../config/env.js';

export async function instagramCallbackRedirectRoute(fastify) {
  fastify.get('/instagram-callback', async (request, reply) => {
    const frontendBase = (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    // Re-encode the query string from the parsed object so we don't depend
    // on the raw URL parser preserving order.
    const qs = new URLSearchParams(request.query).toString();
    const target = qs
      ? `${frontendBase}/instagram-callback?${qs}`
      : `${frontendBase}/instagram-callback`;
    // Fastify v5 signature: redirect(url, statusCode) — defaults to 302.
    return reply.redirect(target, 302);
  });
}
