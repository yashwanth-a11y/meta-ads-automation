import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InstagramAiGenerationService } from '../../src/services/InstagramAiGenerationService.js';

const stubLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function makeRepo({ account } = {}) {
  return {
    findById: vi.fn(async () => account ?? null),
  };
}

function makeAiClient({ generateResult, generateError } = {}) {
  return {
    generate: vi.fn(async () => {
      if (generateError) throw generateError;
      return (
        generateResult ?? {
          image_url: 'https://ms.example.com/i/abc.jpg',
          width: 1080,
          height: 1080,
          mime_type: 'image/jpeg',
          final_prompt: 'final',
        }
      );
    }),
    reject: vi.fn(),
    healthCheck: vi.fn(),
  };
}

const VALID_OPENAI_RESPONSE = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          image_payload: {
            prompt: 'a cozy coffee shop in soft morning light, marble counter, single espresso cup',
            business_name: 'Cafe X',
            tagline: '',
            call_to_action: 'LEARN_MORE',
            campaign_type: 'social_media_post',
            target_audience: 'urban coffee drinkers, 25-40',
            brand_colors: ['#1A1A1A', '#FFF7E6'],
            logo_position: 'bottom-right',
            style: 'photorealistic',
            mood: 'calm and inviting',
          },
          caption:
            'Mornings hit different with a perfectly pulled shot. Stop in for our new house blend.',
          hashtags: [
            'coffee',
            'espresso',
            'cafelife',
            ' Has Spaces ',
            'coffee', // duplicate, deduped
            '#withhash', // leading hashes stripped
            'café', // unicode allowed
          ],
        }),
      },
    },
  ],
};

const ACCOUNT = {
  id: 'IG1',
  organization_id: 'org1',
  ig_business_id: 'IGBIZ1',
  ig_username: 'cafex',
  ig_name: 'Cafe X',
  is_active: true,
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'TESTKEY';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstagramAiGenerationService.generatePost — happy path', () => {
  it('refines via GPT, calls the microservice, returns sanitized caption + hashtags + image url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => VALID_OPENAI_RESPONSE,
      })),
    );
    const repo = makeRepo({ account: ACCOUNT });
    const aiClient = makeAiClient();
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: repo,
      aiImageClient: aiClient,
    });

    const out = await svc.generatePost({
      organizationId: 'org1',
      accountId: 'IG1',
      prompt: 'cozy coffee shop morning',
      postType: 'image',
    });

    expect(out.image_url).toBe('https://ms.example.com/i/abc.jpg');
    expect(out.aspect_ratio).toBe('1:1');
    expect(out.post_type).toBe('image');
    expect(out.caption).toContain('Mornings hit different');
    expect(out.hashtags).toContain('coffee');
    expect(out.hashtags).toContain('café');
    // Sanitization assertions:
    expect(out.hashtags.filter((t) => t.toLowerCase() === 'coffee')).toHaveLength(1); // deduped
    expect(out.hashtags).toContain('Has'); // " Has Spaces " → "Has" (first space-split token)
    expect(out.hashtags).toContain('withhash'); // leading "#" stripped

    // Microservice was called with locked aspect ratio + JPEG, NOT what GPT
    // returned. Server is the source of truth here.
    const microPayload = aiClient.generate.mock.calls[0][0];
    expect(microPayload.aspect_ratio).toBe('1:1');
    expect(microPayload.output_format).toBe('jpeg');
    expect(microPayload.upload_to_s3).toBe(true);
    expect(microPayload.organization_id).toBe('org1');
  });

  it('uses 9:16 aspect ratio for stories and returns empty caption + hashtags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => VALID_OPENAI_RESPONSE,
      })),
    );
    const repo = makeRepo({ account: ACCOUNT });
    const aiClient = makeAiClient();
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: repo,
      aiImageClient: aiClient,
    });

    const out = await svc.generatePost({
      organizationId: 'org1',
      accountId: 'IG1',
      prompt: 'announcement post',
      postType: 'story',
    });

    expect(out.aspect_ratio).toBe('9:16');
    expect(out.caption).toBe('');
    expect(out.hashtags).toEqual([]);
    expect(aiClient.generate.mock.calls[0][0].aspect_ratio).toBe('9:16');
  });

  it('strips inline hashtags from the caption (they go into hashtags array separately)', async () => {
    const responseWithInlineTags = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              image_payload: VALID_OPENAI_RESPONSE.choices[0].message.content
                ? JSON.parse(VALID_OPENAI_RESPONSE.choices[0].message.content).image_payload
                : {},
              caption:
                'Best espresso in town. #coffee #cafelife — try it today!',
              hashtags: ['coffee', 'cafelife'],
            }),
          },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => responseWithInlineTags })),
    );
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient(),
    });
    const out = await svc.generatePost({
      organizationId: 'org1',
      accountId: 'IG1',
      prompt: 'best espresso',
      postType: 'image',
    });
    expect(out.caption).not.toContain('#coffee');
    expect(out.caption).not.toContain('#cafelife');
    expect(out.caption).toContain('Best espresso');
  });
});

describe('InstagramAiGenerationService.generatePost — validation', () => {
  let svc;
  beforeEach(() => {
    svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient(),
    });
  });

  it('rejects prompts shorter than 5 chars', async () => {
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'hi',
        postType: 'image',
      }),
    ).rejects.toThrow(/at least 5 characters/);
  });

  it('rejects unsupported post types (e.g. reels)', async () => {
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'a reel about coffee',
        postType: 'reels',
      }),
    ).rejects.toThrow(/requires a video file/);
  });

  it('throws 404 when the account is missing or owned by another org', async () => {
    const repo = makeRepo({ account: null });
    const s = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: repo,
      aiImageClient: makeAiClient(),
    });
    await expect(
      s.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'something photogenic',
        postType: 'image',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the IG account is inactive', async () => {
    const s = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: { ...ACCOUNT, is_active: false } }),
      aiImageClient: makeAiClient(),
    });
    await expect(
      s.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'hello world post',
        postType: 'image',
      }),
    ).rejects.toThrow(/not active/);
  });

  it('throws 500 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'something good',
        postType: 'image',
      }),
    ).rejects.toThrow(/OpenAI API key/);
  });
});

describe('InstagramAiGenerationService.generatePost — error surfacing', () => {
  it('surfaces OpenAI API failure as 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'OpenAI down' } }),
      })),
    );
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient(),
    });
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'something visual',
        postType: 'image',
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('surfaces invalid JSON from GPT as 502 with retry hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not json at all' } }],
        }),
      })),
    );
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient(),
    });
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'a clean post',
        postType: 'image',
      }),
    ).rejects.toThrow(/invalid response/);
  });

  it('surfaces microservice errors with their original code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => VALID_OPENAI_RESPONSE,
      })),
    );
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient({
        generateError: { code: 502, message: 'Image microservice unavailable' },
      }),
    });
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'a clean post',
        postType: 'image',
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('throws when microservice returns no usable URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => VALID_OPENAI_RESPONSE,
      })),
    );
    const svc = new InstagramAiGenerationService({
      logger: stubLogger(),
      instagramAccountRepository: makeRepo({ account: ACCOUNT }),
      aiImageClient: makeAiClient({
        generateResult: { image_url: 'not-a-url', width: 1080, height: 1080 },
      }),
    });
    await expect(
      svc.generatePost({
        organizationId: 'org1',
        accountId: 'IG1',
        prompt: 'a clean post',
        postType: 'image',
      }),
    ).rejects.toThrow(/usable URL/);
  });
});
