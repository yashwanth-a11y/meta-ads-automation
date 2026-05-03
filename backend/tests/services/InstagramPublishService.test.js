import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstagramPublishService } from '../../src/services/InstagramPublishService.js';

vi.mock('../../src/utils/encryption.js', () => ({
  encryptToken: vi.fn((t) => `enc(${t})`),
  decryptToken: vi.fn((t) => {
    if (typeof t !== 'string') return t;
    const m = t.match(/^enc\((.*)\)$/);
    return m ? m[1] : t;
  }),
}));

const stubLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function makeRepo() {
  return {
    findById: vi.fn(),
    findByBusinessId: vi.fn(),
    findByOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    hardDelete: vi.fn(),
  };
}

function makePublisher() {
  return {
    publishMedia: vi.fn(async () => ({ containerId: 'C1', mediaId: 'M1' })),
    _getPageToken: async () => 'OLD_TOKEN',
    _apiBase: 'https://graph.facebook.com/v21.0',
  };
}

function makeUploader() {
  return { delete: vi.fn(async () => undefined) };
}

function makeAiClient() {
  return {
    generate: vi.fn(),
    reject: vi.fn(async () => ({ success: true, deleted: true })),
    healthCheck: vi.fn(),
  };
}

describe('InstagramPublishService.publishToAccount', () => {
  let svc;
  let repo;
  let publisher;
  let uploader;
  let aiClient;

  beforeEach(() => {
    repo = makeRepo();
    publisher = makePublisher();
    uploader = makeUploader();
    aiClient = makeAiClient();
    svc = new InstagramPublishService({
      logger: stubLogger(),
      instagramAccountRepository: repo,
      publishingService: publisher,
      uploadService: uploader,
      aiImageClient: aiClient,
    });
  });

  it('publishes using the IG account token, not the meta_ad_accounts token', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      ig_username: 'acme',
      access_token_encrypted: 'enc(IG_TOKEN)',
      is_active: true,
    });

    let observedTokenInside;
    let observedApiBaseInside;
    publisher.publishMedia.mockImplementation(async function publishMediaImpl(channel, spec) {
      // While inside publishMedia, _getPageToken should be patched to return
      // the IG-account-specific token, NOT the original meta_ad_accounts one.
      // _apiBase should be swapped to graph.instagram.com so IG-direct tokens
      // validate (graph.facebook.com would 400 with IG_190).
      observedTokenInside = await this._getPageToken(channel.organization_id);
      observedApiBaseInside = this._apiBase;
      expect(spec.type).toBe('image');
      return { containerId: 'CTR', mediaId: 'M99' };
    });

    const out = await svc.publishToAccount({
      organizationId: 'org1',
      accountId: 'IG1',
      spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
      cleanupPaths: ['org1/a.jpg'],
    });

    expect(observedTokenInside).toBe('IG_TOKEN');
    expect(observedApiBaseInside).toMatch(/graph\.instagram\.com/);
    // After the call, both patches must be restored.
    expect(await publisher._getPageToken()).toBe('OLD_TOKEN');
    expect(publisher._apiBase).toBe('https://graph.facebook.com/v21.0');
    expect(out).toEqual({
      media_id: 'M99',
      container_id: 'CTR',
      type: 'image',
      ig_username: 'acme',
      ig_business_id: 'IGBIZ1',
      published_at: expect.any(String),
    });
    expect(uploader.delete).toHaveBeenCalledWith('org1/a.jpg');
  });

  it('passes a channelStub with ig_business_id (not the IG-account row id) to publishMedia', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      access_token_encrypted: 'enc(TOKEN)',
      is_active: true,
    });
    await svc.publishToAccount({
      organizationId: 'org1',
      accountId: 'IG1',
      spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
    });
    const [channelArg] = publisher.publishMedia.mock.calls[0];
    expect(channelArg.instagram_account_id).toBe('IGBIZ1');
    expect(channelArg.organization_id).toBe('org1');
  });

  it('cleans up uploaded files even when publish fails', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      access_token_encrypted: 'enc(TOKEN)',
      is_active: true,
    });
    publisher.publishMedia.mockRejectedValueOnce(new Error('IG container ERROR'));
    await expect(
      svc.publishToAccount({
        organizationId: 'org1',
        accountId: 'IG1',
        spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
        cleanupPaths: ['org1/a.jpg', 'org1/b.jpg'],
      }),
    ).rejects.toThrow(/IG container ERROR/);
    expect(uploader.delete).toHaveBeenCalledTimes(2);
    // Both patches must be restored even when the inner call throws.
    expect(await publisher._getPageToken()).toBe('OLD_TOKEN');
    expect(publisher._apiBase).toBe('https://graph.facebook.com/v21.0');
  });

  it('throws 404 when the account is missing or owned by a different org', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(
      svc.publishToAccount({
        organizationId: 'org1',
        accountId: 'IG1',
        spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
      }),
    ).rejects.toThrow(/not found/i);

    repo.findById.mockResolvedValueOnce({ id: 'IG1', organization_id: 'OTHER', is_active: true });
    await expect(
      svc.publishToAccount({
        organizationId: 'org1',
        accountId: 'IG1',
        spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
      }),
    ).rejects.toThrow(/not found/i);

    expect(publisher.publishMedia).not.toHaveBeenCalled();
  });

  it('calls aiImageClient.reject for each cleanupAiUrls entry after publish', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      access_token_encrypted: 'enc(TOKEN)',
      is_active: true,
    });
    await svc.publishToAccount({
      organizationId: 'org1',
      accountId: 'IG1',
      spec: { type: 'image', image_url: 'https://ms.example.com/i/x.jpg' },
      cleanupAiUrls: ['https://ms.example.com/i/x.jpg', 'https://ms.example.com/i/y.jpg'],
    });
    expect(aiClient.reject).toHaveBeenCalledTimes(2);
    expect(aiClient.reject).toHaveBeenCalledWith('https://ms.example.com/i/x.jpg');
    expect(aiClient.reject).toHaveBeenCalledWith('https://ms.example.com/i/y.jpg');
    // Regular cleanupPaths still untouched in this case.
    expect(uploader.delete).not.toHaveBeenCalled();
  });

  it('cleans up both upload paths AND AI urls even when publish fails', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      access_token_encrypted: 'enc(TOKEN)',
      is_active: true,
    });
    publisher.publishMedia.mockRejectedValueOnce(new Error('IG container ERROR'));
    await expect(
      svc.publishToAccount({
        organizationId: 'org1',
        accountId: 'IG1',
        spec: { type: 'image', image_url: 'https://ms.example.com/i/x.jpg' },
        cleanupPaths: ['org1/abc.jpg'],
        cleanupAiUrls: ['https://ms.example.com/i/x.jpg'],
      }),
    ).rejects.toThrow(/IG container ERROR/);
    expect(uploader.delete).toHaveBeenCalledWith('org1/abc.jpg');
    expect(aiClient.reject).toHaveBeenCalledWith('https://ms.example.com/i/x.jpg');
  });

  it('rejects publishing through an inactive account', async () => {
    repo.findById.mockResolvedValue({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      access_token_encrypted: 'enc(TOKEN)',
      is_active: false,
    });
    await expect(
      svc.publishToAccount({
        organizationId: 'org1',
        accountId: 'IG1',
        spec: { type: 'image', image_url: 'https://example.com/a.jpg' },
      }),
    ).rejects.toThrow(/not active/i);
    expect(publisher.publishMedia).not.toHaveBeenCalled();
  });
});
