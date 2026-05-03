import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

// Stub the presigner so we can verify wiring without the AWS SDK trying to
// reach into a real S3 client's middleware stack.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_client, cmd) =>
    `https://test-bucket.s3.us-east-1.amazonaws.com/${cmd.input.Key}?signed=1`,
  ),
}));

import { InstagramUploadService } from '../../src/services/InstagramUploadService.js';

const stubLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-upload-test-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function svc({ publicBaseUrl } = {}) {
  return new InstagramUploadService({
    logger: stubLogger(),
    uploadsRoot: tmpRoot,
    publicBaseUrl: publicBaseUrl ?? '',
    // Force local backend for these tests — S3 path has its own block below.
    s3Bucket: '',
  });
}

describe('InstagramUploadService.save', () => {
  it('writes the file and returns a public URL using BACKEND_PUBLIC_URL when set', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    const out = await u.save({
      organizationId: 'org1',
      fileBuffer: Buffer.from([1, 2, 3, 4]),
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
      requestHeaders: {},
    });

    expect(out.kind).toBe('image');
    expect(out.size).toBe(4);
    expect(out.url).toMatch(/^https:\/\/api\.example\.com\/public\/uploads\/org1\/[0-9a-f]{32}\.jpg$/);

    const onDisk = path.join(tmpRoot, 'org1', path.basename(new URL(out.url).pathname));
    const stat = await fs.stat(onDisk);
    expect(stat.size).toBe(4);
  });

  it('falls back to x-forwarded-host when BACKEND_PUBLIC_URL is empty', async () => {
    const u = svc();
    const out = await u.save({
      organizationId: 'org1',
      fileBuffer: Buffer.from('hello'),
      mimeType: 'image/jpeg',
      originalName: 'hello.jpg',
      requestHeaders: { 'x-forwarded-host': 'demo.ngrok.app', 'x-forwarded-proto': 'https' },
    });
    expect(out.url).toMatch(/^https:\/\/demo\.ngrok\.app\/public\/uploads\/org1\/[0-9a-f]{32}\.jpg$/);
  });

  it('rejects unsupported MIME types', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    await expect(
      u.save({
        organizationId: 'org1',
        fileBuffer: Buffer.from('x'),
        mimeType: 'image/gif',
        originalName: 'x.gif',
        requestHeaders: {},
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it('rejects PNG with a hint to convert to JPEG (IG spec)', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    await expect(
      u.save({
        organizationId: 'org1',
        fileBuffer: Buffer.from('x'),
        mimeType: 'image/png',
        originalName: 'x.png',
        requestHeaders: {},
      }),
    ).rejects.toThrow(/JPEG/);
  });

  it('rejects images over the size cap', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    await expect(
      u.save({
        organizationId: 'org1',
        fileBuffer: Buffer.alloc(9 * 1024 * 1024),
        mimeType: 'image/jpeg',
        originalName: 'big.jpg',
        requestHeaders: {},
      }),
    ).rejects.toThrow(/exceeds 8MB limit/);
  });

  it('rejects videos over the size cap', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    await expect(
      u.save({
        organizationId: 'org1',
        fileBuffer: Buffer.alloc(101 * 1024 * 1024),
        mimeType: 'video/mp4',
        originalName: 'big.mp4',
        requestHeaders: {},
      }),
    ).rejects.toThrow(/exceeds 100MB limit/);
  });

  it('throws when no public URL can be derived (localhost only)', async () => {
    const u = svc();
    await expect(
      u.save({
        organizationId: 'org1',
        fileBuffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        originalName: 'x.jpg',
        requestHeaders: { host: 'localhost:4000' },
      }),
    ).rejects.toThrow(/public backend URL/);
  });
});

describe('InstagramUploadService.streamServedFile', () => {
  it('serves a previously-saved file', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    const saved = await u.save({
      organizationId: 'org1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'image/jpeg',
      originalName: 'a.jpg',
      requestHeaders: {},
    });
    const fileName = saved.storedPath.split('/')[1];
    const { absPath } = u.streamServedFile('org1', fileName);
    const bytes = await fs.readFile(absPath);
    expect(bytes.toString()).toBe('payload');
  });

  it('rejects path traversal attempts', () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    expect(() => u.streamServedFile('org1', '../../etc/passwd')).toThrow(/not found/i);
  });

  it('rejects missing files with 404', () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    expect(() => u.streamServedFile('org1', 'does-not-exist.jpg')).toThrow(/not found/i);
  });
});

describe('InstagramUploadService — S3 backend', () => {
  function s3Svc(s3Client) {
    return new InstagramUploadService({
      logger: stubLogger(),
      uploadsRoot: tmpRoot,
      publicBaseUrl: '',
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      s3Client,
    });
  }

  function fakeS3() {
    return {
      send: vi.fn(async (cmd) => {
        const ctor = cmd.constructor.name;
        if (ctor === 'GetObjectCommand') return {};
        if (ctor === 'PutObjectCommand') return { ETag: '"abc"' };
        if (ctor === 'DeleteObjectCommand') return {};
        return {};
      }),
      // Required by getSignedUrl — middleware stack lookups happen on the
      // client. Instead of stubbing those, mock the entire presigner:
      config: { region: () => Promise.resolve('us-east-1') },
    };
  }

  it('uploads to S3 and returns a presigned URL', async () => {
    const s3 = fakeS3();
    const u = s3Svc(s3);
    const out = await u.save({
      organizationId: 'org1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'video/mp4',
      originalName: 'r.mp4',
      requestHeaders: {},
    });
    expect(out.kind).toBe('video');
    expect(out.storedPath).toMatch(/^instagram-uploads\/org1\/[0-9a-f]{32}\.mp4$/);
    expect(out.url).toMatch(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/instagram-uploads\/org1\/.+\?signed=1$/);
    const put = s3.send.mock.calls.find(
      (c) => c[0].constructor.name === 'PutObjectCommand',
    );
    expect(put[0].input.Bucket).toBe('test-bucket');
    expect(put[0].input.ContentType).toBe('video/mp4');
  });

  it('deletes the S3 object on cleanup', async () => {
    const s3 = fakeS3();
    const u = s3Svc(s3);
    await u.delete('instagram-uploads/org1/abc.mp4');
    const del = s3.send.mock.calls.find(
      (c) => c[0].constructor.name === 'DeleteObjectCommand',
    );
    expect(del).toBeDefined();
    expect(del[0].input.Bucket).toBe('test-bucket');
    expect(del[0].input.Key).toBe('instagram-uploads/org1/abc.mp4');
  });

  it('rejects local file serving when in S3 mode', () => {
    const u = s3Svc(fakeS3());
    expect(() => u.streamServedFile('org1', 'a.jpg')).toThrow(/disabled in S3/i);
  });
});

describe('InstagramUploadService.delete', () => {
  it('removes the file from disk', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    const saved = await u.save({
      organizationId: 'org1',
      fileBuffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
      originalName: 'a.jpg',
      requestHeaders: {},
    });
    await u.delete(saved.storedPath);
    const fileName = saved.storedPath.split('/')[1];
    await expect(fs.access(path.join(tmpRoot, 'org1', fileName))).rejects.toThrow();
  });

  it('is idempotent on a missing file', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    await expect(u.delete('org1/missing.jpg')).resolves.toBeUndefined();
  });

  it('refuses to delete via path traversal', async () => {
    const u = svc({ publicBaseUrl: 'https://api.example.com' });
    // Create a "victim" file outside the org dir.
    const victim = path.join(tmpRoot, 'victim.txt');
    await fs.writeFile(victim, 'still here');
    await u.delete('../victim.txt');
    const stat = await fs.stat(victim);
    expect(stat.size).toBe('still here'.length);
  });
});
