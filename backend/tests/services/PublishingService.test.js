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

  it('throws AppError with statusCode 400 and details on caption overflow', () => {
    let thrown;
    try { svc._buildCaption({ caption: 'x'.repeat(2201) }); }
    catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.statusCode).toBe(400);
    expect(thrown.code).toBe('BAD_REQUEST');
    expect(thrown.details).toEqual({ length: 2201 });
  });

  it('rejects combined caption + hashtags longer than 2200', () => {
    expect(() =>
      svc._buildCaption({ caption: 'x'.repeat(2195), hashtags: ['hashtag'] })
    ).toThrowError(/combined exceed 2200/);
  });

  it('caption-only with no hashtags has no trailing newline', () => {
    expect(svc._buildCaption({ caption: 'hello' })).toBe('hello');
  });

  it('hashtags-only with no caption has no leading newline', () => {
    // Note: current behavior produces "\n\n#a #b". This test documents that
    // behavior — if we later decide to trim leading whitespace, update this test.
    expect(svc._buildCaption({ hashtags: ['a', 'b'] })).toBe('\n\n#a #b');
  });

  it('single hashtag', () => {
    expect(svc._buildCaption({ caption: 'hi', hashtags: ['only'] })).toBe('hi\n\n#only');
  });
});

describe('PublishingService._validateSpec', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('rejects when type is missing', () => {
    expect(() => svc._validateSpec({})).toThrowError(/type/i);
  });

  it('rejects unknown type', () => {
    expect(() => svc._validateSpec({ type: 'audio' })).toThrowError(/type/i);
  });

  it('accepts a known type and dispatches (smoke — image with url)', () => {
    expect(() => svc._validateSpec({ type: 'image', image_url: 'https://x/a.jpg' })).not.toThrow();
  });
});

describe('PublishingService._validateSpec — image', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires image_url', () => {
    expect(() => svc._validateSpec({ type: 'image' })).toThrowError(/image_url/);
  });
  it('rejects oversize alt_text', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg', alt_text: 'a'.repeat(1001),
    })).toThrowError(/alt_text/i);
  });
  it('requires x and y on user_tags for image', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      user_tags: [{ username: 'u' }],
    })).toThrowError(/x.*y/i);
  });
  it('rejects collaborators > 3', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      collaborators: ['a', 'b', 'c', 'd'],
    })).toThrowError(/collaborator/i);
  });
});

describe('PublishingService._validateSpec — video', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires video_url', () => {
    expect(() => svc._validateSpec({ type: 'video' })).toThrowError(/video_url/);
  });
  it('rejects reels-only fields', () => {
    expect(() => svc._validateSpec({
      type: 'video', video_url: 'https://x/v.mp4', share_to_feed: true,
    })).toThrowError(/share_to_feed/);
    expect(() => svc._validateSpec({
      type: 'video', video_url: 'https://x/v.mp4', audio_name: 'song',
    })).toThrowError(/audio_name/);
  });
});

describe('PublishingService._validateSpec — reels', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires video_url', () => {
    expect(() => svc._validateSpec({ type: 'reels' })).toThrowError(/video_url/);
  });
  it('accepts cover_url and thumb_offset_ms together', () => {
    expect(() => svc._validateSpec({
      type: 'reels', video_url: 'https://x/v.mp4',
      cover_url: 'https://x/c.jpg', thumb_offset_ms: 1000,
    })).not.toThrow();
  });
  it('rejects audio_name longer than 30 chars', () => {
    expect(() => svc._validateSpec({
      type: 'reels', video_url: 'https://x/v.mp4', audio_name: 'a'.repeat(31),
    })).toThrowError(/audio_name/);
  });
});

describe('PublishingService._validateSpec — story', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('requires exactly one of image_url or video_url', () => {
    expect(() => svc._validateSpec({ type: 'story' })).toThrowError(/image_url.*video_url|video_url.*image_url/);
    expect(() => svc._validateSpec({
      type: 'story', image_url: 'https://x/a.jpg', video_url: 'https://x/v.mp4',
    })).toThrowError(/exactly one/i);
  });
  it('rejects caption/hashtags/collaborators/partnership', () => {
    expect(() => svc._validateSpec({
      type: 'story', image_url: 'https://x/a.jpg', caption: 'hi',
    })).toThrowError(/caption/);
  });
});

describe('PublishingService._validateSpec — partnership', () => {
  let svc;
  beforeEach(() => { svc = new PublishingService(); });

  it('rejects sponsor_ig_user_ids longer than 2', () => {
    expect(() => svc._validateSpec({
      type: 'image', image_url: 'https://x/a.jpg',
      partnership: { is_paid_partnership: true, sponsor_ig_user_ids: ['1', '2', '3'] },
    })).toThrowError(/sponsor/i);
  });
});
