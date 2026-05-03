import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

// Instagram's Content Publishing API requires `image_url` / `video_url` to be
// a public URL that Meta's servers can GET. Files uploaded here are written
// to local disk under <repo>/uploads and served by a public, unauthenticated
// route (registered in InstagramOAuthRoutes). After a successful publish the
// caller should call `delete(storedPath)` to free the disk slot — IG has
// already pulled the bytes by then.
//
// In production behind a real domain, set BACKEND_PUBLIC_URL.
// In local dev behind ngrok, the request's x-forwarded-host header already
// carries the public hostname; this service uses it as the fallback.

// IG Content Publishing only accepts JPEG for images. PNG sometimes works for
// uploads to ad accounts but fails at /media with subcode 2207003 ("Invalid
// image file"). Rejecting here gives a clearer error than the IG round-trip.
const ALLOWED_IMAGE = new Set(['image/jpeg']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime']);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;       // IG image guidance
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;     // IG single-video soft cap

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// uploads dir lives at backend repo root: <backend>/uploads
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

function extFor(mimeType) {
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'video/mp4':  return '.mp4';
    case 'video/quicktime': return '.mov';
    default: return '';
  }
}

function classifyMime(mimeType) {
  if (ALLOWED_IMAGE.has(mimeType)) return 'image';
  if (ALLOWED_VIDEO.has(mimeType)) return 'video';
  return null;
}

export class InstagramUploadService {
  constructor({ logger, uploadsRoot = UPLOADS_ROOT, publicBaseUrl = env.BACKEND_PUBLIC_URL || '' } = {}) {
    this.logger = logger;
    this.uploadsRoot = uploadsRoot;
    this.publicBaseUrl = publicBaseUrl;
  }

  // Resolve the public base URL the file will be reachable at. Meta requires
  // an https URL that resolves from the public internet — local-only hosts
  // (localhost, 127.*, *.local) will be rejected at publish time by IG so we
  // surface that clearly here rather than letting the publish loop time out.
  _resolvePublicBase({ forwardedHost, forwardedProto, host } = {}) {
    if (this.publicBaseUrl) return this.publicBaseUrl.replace(/\/$/, '');
    if (forwardedHost) {
      const proto = forwardedProto || 'https';
      return `${proto}://${forwardedHost}`;
    }
    if (host && !/^(localhost|127\.|0\.0\.0\.0)/.test(host)) {
      return `https://${host}`;
    }
    throw badRequest(
      'No public backend URL is configured. Set BACKEND_PUBLIC_URL or run behind a public host (ngrok in dev) so Instagram can fetch the uploaded media.',
    );
  }

  // Persist a buffer to disk and return both the public URL (handed to IG)
  // and a stored-path token the caller uses to delete the file later.
  async save({ organizationId, fileBuffer, mimeType, originalName, requestHeaders = {} }) {
    if (!organizationId) throw badRequest('organizationId is required');
    if (!fileBuffer || !fileBuffer.length) throw badRequest('Empty file');

    const kind = classifyMime(mimeType);
    if (!kind) {
      const hint =
        mimeType === 'image/png'
          ? 'Instagram requires JPEG for image posts — convert and try again.'
          : `Allowed: JPEG (image); MP4, MOV (video).`;
      throw badRequest(`Unsupported file type "${mimeType}". ${hint}`, { mimeType });
    }
    const cap = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (fileBuffer.length > cap) {
      throw badRequest(
        `File exceeds ${Math.round(cap / 1024 / 1024)}MB limit for ${kind}.`,
        { size: fileBuffer.length, kind },
      );
    }

    const ext = extFor(mimeType) || path.extname(originalName || '') || '';
    const id = crypto.randomBytes(16).toString('hex');
    const fileName = `${id}${ext}`;
    const orgDir = path.join(this.uploadsRoot, organizationId);
    await fs.mkdir(orgDir, { recursive: true });
    const absPath = path.join(orgDir, fileName);
    await fs.writeFile(absPath, fileBuffer);

    const base = this._resolvePublicBase({
      forwardedHost: requestHeaders['x-forwarded-host'],
      forwardedProto: requestHeaders['x-forwarded-proto'],
      host: requestHeaders.host,
    });
    const url = `${base}/public/uploads/${encodeURIComponent(organizationId)}/${encodeURIComponent(fileName)}`;
    const storedPath = `${organizationId}/${fileName}`;
    this.logger?.info?.({ message: '[InstagramUpload] Stored', storedPath, kind, size: fileBuffer.length });
    return { url, storedPath, kind, mimeType, size: fileBuffer.length };
  }

  // Resolve an HTTP-served path back to an absolute disk path. Rejects any
  // attempt to escape the uploads root via "..".
  resolveServedFile(orgId, fileName) {
    if (!orgId || !fileName) throw notFound('File not found');
    const orgDir = path.join(this.uploadsRoot, orgId);
    const abs = path.resolve(orgDir, fileName);
    if (!abs.startsWith(orgDir + path.sep)) throw notFound('File not found');
    if (!existsSync(abs)) throw notFound('File not found');
    return abs;
  }

  streamServedFile(orgId, fileName) {
    const abs = this.resolveServedFile(orgId, fileName);
    return { stream: createReadStream(abs), absPath: abs };
  }

  // Fire-and-forget delete; safe to call multiple times.
  async delete(storedPath) {
    if (!storedPath || typeof storedPath !== 'string') return;
    if (storedPath.includes('..')) return;
    const abs = path.join(this.uploadsRoot, storedPath);
    try {
      await fs.unlink(abs);
      this.logger?.info?.({ message: '[InstagramUpload] Deleted', storedPath });
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        this.logger?.warn?.({ message: '[InstagramUpload] Delete failed', storedPath, err: err.message });
      }
    }
  }
}
