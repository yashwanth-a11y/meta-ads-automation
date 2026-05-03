import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

// Instagram's Content Publishing API requires `image_url` / `video_url` to be
// a public URL Meta's servers can GET. We support two storage backends:
//
//   - 's3' (preferred for prod and dev): file lands in S3, we hand Meta a
//     presigned GET URL valid for 1 hour. Meta fetches directly from S3.
//     No ngrok in the loop, full Range-request support, stable downloads.
//
//   - 'local' (fallback when S3 isn't configured): file lands on disk under
//     <backend>/uploads, served by an unauthenticated public route. Requires
//     a publicly reachable backend (BACKEND_PUBLIC_URL or x-forwarded-host
//     from ngrok). Less reliable for Meta's fetcher, especially for video.
//
// Backend is chosen automatically: S3 when USE_S3=true AND AWS_S3_BUCKET set,
// else local. After publish the caller deletes the asset (works on both).

const ALLOWED_IMAGE = new Set(['image/jpeg']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime']);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;       // IG image guidance
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;     // IG single-video soft cap

// 1 hour. Meta usually fetches the URL within seconds of /media being called;
// this gives plenty of margin for slow fetches and the container poll loop
// without the URL going stale during a still-processing publish.
const S3_PRESIGN_TTL_SECONDS = 60 * 60;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  constructor({
    logger,
    uploadsRoot = UPLOADS_ROOT,
    publicBaseUrl = env.BACKEND_PUBLIC_URL || '',
    // Allow tests/DI to inject. Production reads from env.
    s3Bucket = env.USE_S3 ? env.AWS_S3_BUCKET || '' : '',
    s3Region = env.AWS_REGION || 'us-east-1',
    s3Client = null,
  } = {}) {
    this.logger = logger;
    this.uploadsRoot = uploadsRoot;
    this.publicBaseUrl = publicBaseUrl;
    this.s3Bucket = s3Bucket;
    this.s3Region = s3Region;
    this.backend = s3Bucket ? 's3' : 'local';
    if (this.backend === 's3') {
      this.s3 = s3Client || new S3Client({
        region: s3Region,
        // SDK auto-resolves credentials from env (AWS_ACCESS_KEY_ID,
        // AWS_SECRET_ACCESS_KEY) or instance/IAM role.
      });
      this.logger?.info?.({
        message: '[InstagramUpload] Using S3 backend',
        bucket: s3Bucket,
        region: s3Region,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Public API (same shape across backends)
  // -------------------------------------------------------------------------

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

    if (this.backend === 's3') {
      return this._saveToS3({ organizationId, fileBuffer, mimeType, fileName, kind });
    }
    return this._saveToLocal({
      organizationId,
      fileBuffer,
      mimeType,
      fileName,
      kind,
      requestHeaders,
    });
  }

  async delete(storedPath) {
    if (!storedPath || typeof storedPath !== 'string') return;
    if (storedPath.includes('..')) return;
    if (this.backend === 's3') {
      try {
        await this.s3.send(new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: storedPath,
        }));
        this.logger?.info?.({ message: '[InstagramUpload] S3 deleted', key: storedPath });
      } catch (err) {
        this.logger?.warn?.({
          message: '[InstagramUpload] S3 delete failed',
          key: storedPath,
          err: err.message,
        });
      }
      return;
    }
    const abs = path.join(this.uploadsRoot, storedPath);
    try {
      await fs.unlink(abs);
      this.logger?.info?.({ message: '[InstagramUpload] Local deleted', storedPath });
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        this.logger?.warn?.({
          message: '[InstagramUpload] Local delete failed',
          storedPath,
          err: err.message,
        });
      }
    }
  }

  // Local-only — used by the public /public/uploads/:org/:file route. The
  // S3 backend doesn't go through this path because Meta fetches from the
  // presigned URL directly.
  resolveServedFile(orgId, fileName) {
    if (this.backend === 's3') throw notFound('Local file serving disabled in S3 mode');
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

  // -------------------------------------------------------------------------
  // Internal: backend implementations
  // -------------------------------------------------------------------------

  async _saveToS3({ organizationId, fileBuffer, mimeType, fileName, kind }) {
    const key = `instagram-uploads/${organizationId}/${fileName}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      // CacheControl helps Meta if it does conditional GETs during the
      // container poll loop; not strictly required.
      CacheControl: 'public, max-age=3600',
    }));
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.s3Bucket, Key: key }),
      { expiresIn: S3_PRESIGN_TTL_SECONDS },
    );
    this.logger?.info?.({
      message: '[InstagramUpload] S3 uploaded',
      key,
      kind,
      size: fileBuffer.length,
    });
    return { url, storedPath: key, kind, mimeType, size: fileBuffer.length, backend: 's3' };
  }

  async _saveToLocal({
    organizationId,
    fileBuffer,
    mimeType,
    fileName,
    kind,
    requestHeaders,
  }) {
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
    this.logger?.info?.({
      message: '[InstagramUpload] Local stored',
      storedPath,
      kind,
      size: fileBuffer.length,
    });
    return { url, storedPath, kind, mimeType, size: fileBuffer.length, backend: 'local' };
  }

  // Local-only: derive an https URL Meta can reach when we don't have an
  // explicit BACKEND_PUBLIC_URL. ngrok's x-forwarded-host is the typical
  // dev path. localhost-only hosts are rejected since IG can't reach them.
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
      'No public backend URL is configured. Set BACKEND_PUBLIC_URL, enable USE_S3, or run behind a public host (ngrok in dev) so Instagram can fetch the uploaded media.',
    );
  }
}
