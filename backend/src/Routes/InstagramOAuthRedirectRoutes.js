/**
 * Public redirect endpoint for Instagram template-button click tracking.
 *
 * Mounts at the ROOT (no /api/v1 prefix) so the URL we ship inside Meta's
 * generic-template `web_url` button is short — short links survive better
 * across IG/SMS/share-to-WhatsApp than long ones, and Meta caps button
 * URLs at 1024 chars with extra strict validation.
 *
 * The route is unauthenticated by design: the customer tapping a button
 * from inside the IG app has no JWT, no session, nothing. All we have is
 * the opaque token from the URL — the click tracker resolves it to a
 * row, bumps the counter, and 302s the customer to the original
 * destination URL.
 *
 * Failure modes (each returns a sensible response, never 5xx):
 *   - Unknown / expired token → 404 with a tiny human-readable HTML
 *     page explaining "Link not found". Logging captures the bad token
 *     so we can debug.
 *   - Counter UPDATE failure → still 302 to destination (analytics
 *     misses ONE click; redirect must succeed or the customer thinks
 *     the link is broken).
 *   - Destination URL malformed (shouldn't happen — minted from a
 *     validated source) → 404 page.
 */
export async function instagramRedirectRoutes(fastify) {
  const tracker = fastify.instagramTemplateClickTracker;

  fastify.get('/r/ig/:token', async (request, reply) => {
    const { token } = request.params;
    if (!tracker) {
      // Tracker isn't wired in this env — return 404 since we can't
      // resolve the token to anything. Should not happen in prod.
      return reply.code(404).type('text/html').send(notFoundHtml('Click tracking unavailable'));
    }
    const row = await tracker.resolveToken(token);
    if (!row || !row.destination_url) {
      fastify.log.info({
        message: '[InstagramRedirect] Unknown click token — 404',
        tokenPreview: token ? token.slice(0, 8) : null,
      });
      return reply.code(404).type('text/html').send(notFoundHtml('Link not found'));
    }

    // Capture client metadata BEFORE the redirect so the recordWebClick
    // call can run in the background — we don't want to delay the
    // customer-facing redirect on the DB write.
    const ip =
      request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      request.ip ||
      null;
    const userAgent = request.headers['user-agent'] || null;

    // Fire-and-forget the counter bump. setImmediate ensures the redirect
    // response is sent first, then the DB write runs. Errors inside
    // recordWebClick are already swallowed by the tracker.
    setImmediate(() => {
      tracker.recordWebClick({ token, ip, userAgent }).catch(() => {});
    });

    return reply.redirect(302, row.destination_url);
  });
}

function notFoundHtml(message) {
  // Minimal inline HTML — no template engine, no external assets. The
  // customer is most likely already inside the IG in-app browser when
  // they tap a stale link, so we render small + clear.
  const safeMessage = String(message).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]),
  );
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not found</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#333}.box{text-align:center;padding:24px}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#666;margin:0}</style>
</head><body><div class="box"><h1>${safeMessage}</h1><p>The link you tapped is no longer available.</p></div></body></html>`;
}
