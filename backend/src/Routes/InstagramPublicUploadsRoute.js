/**
 * Public, unauthenticated route that serves files uploaded for Instagram
 * publishing. Mounted at the ROOT (no /api/v1 prefix) because Meta's
 * servers fetch image/video URLs we hand to /media as part of the IG
 * Content Publishing flow — they obviously have no JWT.
 *
 * Path traversal is blocked by InstagramUploadService.resolveServedFile,
 * which verifies the resolved disk path stays inside <repo>/uploads.
 *
 * Files are short-lived: deleted by InstagramPublishService after the
 * IG container reaches FINISHED status (or after publish failure). A
 * stale file lingering here is harmless (it's not a secret), but the
 * cleanup keeps disk usage bounded.
 */
export async function instagramPublicUploadsRoute(fastify) {
  const controller = fastify.instagramOAuthController;
  fastify.get('/public/uploads/:orgId/:fileName', (req, reply) =>
    controller.serveUploadedFile(req, reply),
  );
}
