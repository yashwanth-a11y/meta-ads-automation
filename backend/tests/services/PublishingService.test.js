import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { PublishingService } from '../../src/services/PublishingService.js';
import { env } from '../../src/config/env.js';

vi.mock('axios');

describe('PublishingService — smoke', () => {
  it('instantiates', () => {
    const svc = new PublishingService();
    expect(svc).toBeInstanceOf(PublishingService);
  });
});

describe('PublishingService — Graph URL', () => {
  it('uses env.META_API_VERSION when calling Graph', async () => {
    const svc = new PublishingService();
    vi.spyOn(svc, '_getPageToken').mockResolvedValue('tok');
    vi.spyOn(svc, '_sleep').mockResolvedValue();
    axios.post.mockResolvedValueOnce({ data: { id: 'CONTAINER_1' } });
    axios.get.mockResolvedValue({ data: { status_code: 'FINISHED' } });
    axios.post.mockResolvedValueOnce({ data: { id: 'MEDIA_1' } });

    // Call the existing reels path through the legacy method. After Task 13
    // this test will be renamed to use publishBundle.
    await svc.publish(
      { id: 'ch1', organization_id: 'org1', instagram_account_id: 'IG_USER' },
      { id: 'b1', video_url: 'https://example.com/v.mp4', caption: 'hi', hashtags: [] },
    );

    const expectedPrefix = `${env.META_API_BASE_URL}/${env.META_API_VERSION}/`;
    expect(axios.post.mock.calls[0][0].startsWith(expectedPrefix)).toBe(true);
  });
});

describe('PublishingService._buildCaption', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('joins caption + hashtags', () => {
    const out = svc._buildCaption({ caption: 'hello', hashtags: ['ai', 'dev'] });
    expect(out).toBe('hello\n\n#ai #dev');
  });

  it('rejects caption longer than 2200 chars', () => {
    expect(() => svc._buildCaption({ caption: 'x'.repeat(2201), hashtags: [] }))
      .toThrowError(/2200/);
  });

  it('rejects more than 30 hashtags', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(() => svc._buildCaption({ caption: 'hi', hashtags: tags }))
      .toThrowError(/hashtag/i);
  });

  it('rejects more than 20 @mentions in caption', () => {
    const mentions = Array.from({ length: 21 }, (_, i) => `@u${i}`).join(' ');
    expect(() => svc._buildCaption({ caption: mentions, hashtags: [] }))
      .toThrowError(/mention/i);
  });

  it('returns empty string if no caption and no hashtags', () => {
    expect(svc._buildCaption({})).toBe('');
  });
});
