import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock encryption + the Meta API class BEFORE importing the service.
vi.mock('../../src/utils/encryption.js', () => ({
  decryptToken: vi.fn(() => 'decrypted-token'),
  encryptToken: vi.fn((p) => `enc:${p}`),
}));

const fakeMetaApi = {
  getAccountInsights: vi.fn(),
  getAds: vi.fn(),
};

vi.mock('../../src/services/MetaAdsApiService.js', () => ({
  MetaAdsApiService: vi.fn(),
}));

import { AnalyticsService } from '../../src/services/AnalyticsService.js';
import { MetaAdsApiService } from '../../src/services/MetaAdsApiService.js';

const ORG_ID = 'org-123';
const ACCOUNT = {
  id: 'acc-row-id',
  organization_id: ORG_ID,
  ad_account_id: '1234567890',
  ad_account_name: 'Test Account',
  access_token_encrypted: 'enc-token',
  currency: 'INR',
  status: 'active',
};

function makeService({ account = ACCOUNT, ctwaRows = [] } = {}) {
  const metaAdAccountRepository = {
    findActiveByOrganizationId: vi.fn().mockResolvedValue(account),
  };
  const ctwaConversationRepository = {
    countByReferralSource: vi.fn().mockResolvedValue(ctwaRows),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    svc: new AnalyticsService({
      metaAdAccountRepository,
      ctwaConversationRepository,
      logger,
    }),
    metaAdAccountRepository,
    ctwaConversationRepository,
    logger,
  };
}

beforeEach(() => {
  // `restoreMocks: true` in vitest.config.js wipes mockImplementation between
  // tests, so re-bind the constructor stub to return our `fakeMetaApi` each run.
  MetaAdsApiService.mockImplementation(() => fakeMetaApi);
  fakeMetaApi.getAccountInsights.mockReset();
  fakeMetaApi.getAds.mockReset();
});

describe('AnalyticsService.getDashboard — no account connected', () => {
  it('returns hasAccount=false and empty payload without hitting Meta', async () => {
    const { svc, metaAdAccountRepository } = makeService({ account: null });
    const out = await svc.getDashboard(ORG_ID);
    expect(out.hasAccount).toBe(false);
    expect(out.hasData).toBe(false);
    expect(out.totals).toBeNull();
    expect(out.trend).toEqual([]);
    expect(metaAdAccountRepository.findActiveByOrganizationId).toHaveBeenCalledWith(ORG_ID);
    expect(fakeMetaApi.getAccountInsights).not.toHaveBeenCalled();
  });
});

describe('AnalyticsService.getDashboard — happy path', () => {
  it('aggregates totals, builds trend, and emits campaign/platform/placement/demo breakdowns', async () => {
    const dailyRows = [
      {
        date_start: '2026-04-01',
        date_stop: '2026-04-01',
        spend: '100',
        impressions: '5000',
        reach: '4000',
        clicks: '50',
        unique_clicks: '45',
        ctr: '1.0',
        cpc: '2.0',
        cpm: '20.0',
        frequency: '1.25',
        actions: [
          { action_type: 'lead', value: '5' },
          { action_type: 'link_click', value: '40' },
          { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' },
        ],
      },
      {
        date_start: '2026-04-02',
        date_stop: '2026-04-02',
        spend: '50',
        impressions: '2000',
        reach: '1800',
        clicks: '30',
        unique_clicks: '28',
        actions: [
          { action_type: 'purchase', value: '2' },
        ],
      },
    ];

    const campaignRows = [
      {
        campaign_id: 'C1',
        campaign_name: 'Spring Sale',
        spend: '120',
        impressions: '5500',
        reach: '4500',
        clicks: '60',
        ctr: '1.09',
        cpc: '2.0',
        actions: [{ action_type: 'lead', value: '4' }],
      },
      {
        campaign_id: 'C2',
        campaign_name: 'Brand Awareness',
        spend: '30',
        impressions: '1500',
        clicks: '20',
        actions: [],
      },
      {
        campaign_id: 'C3',
        campaign_name: 'Inactive',
        spend: '0',
        impressions: '0',
        clicks: '0',
        actions: [],
      },
    ];

    const platformRows = [
      { publisher_platform: 'facebook', spend: '90', impressions: '4500', clicks: '50' },
      { publisher_platform: 'instagram', spend: '60', impressions: '2500', clicks: '30' },
    ];

    const placementRows = [
      { publisher_platform: 'facebook', platform_position: 'feed', spend: '70', impressions: '3000', clicks: '40' },
      { publisher_platform: 'facebook', platform_position: 'right_hand_column', spend: '20', impressions: '1500', clicks: '10' },
      { publisher_platform: 'instagram', platform_position: 'stream', spend: '40', impressions: '1500', clicks: '20' },
      { publisher_platform: 'instagram', platform_position: 'story', spend: '20', impressions: '1000', clicks: '10' },
    ];

    const demoRows = [
      { age: '25-34', gender: 'female', spend: '60', impressions: '2400', clicks: '30', actions: [{ action_type: 'lead', value: '3' }] },
      { age: '25-34', gender: 'male', spend: '50', impressions: '2000', clicks: '25', actions: [] },
      { age: '35-44', gender: 'female', spend: '40', impressions: '1500', clicks: '20', actions: [] },
    ];

    fakeMetaApi.getAccountInsights
      .mockResolvedValueOnce({ data: dailyRows })       // 1. daily
      .mockResolvedValueOnce({ data: campaignRows })    // 2. campaigns
      .mockResolvedValueOnce({ data: platformRows })    // 3. platform
      .mockResolvedValueOnce({ data: placementRows })   // 4. placement
      .mockResolvedValueOnce({ data: demoRows });       // 5. demographic

    const { svc } = makeService({
      ctwaRows: [
        { source: 'ad', count: '8' },
        { source: 'organic', count: '2' },
      ],
    });

    const out = await svc.getDashboard(ORG_ID, { date_preset: 'last_28d' });

    // Account info
    expect(out.hasAccount).toBe(true);
    expect(out.currency).toBe('INR');
    expect(out.adAccount).toEqual({ id: '1234567890', name: 'Test Account' });
    expect(out.range.date_preset).toBe('last_28d');
    expect(out.range.days).toBe(28);

    // Totals
    expect(out.totals.spend).toBeCloseTo(150);
    expect(out.totals.impressions).toBe(7000);
    expect(out.totals.reach).toBe(5800);
    expect(out.totals.clicks).toBe(80);
    expect(out.totals.ctr).toBeCloseTo((80 / 7000) * 100);
    expect(out.totals.cpc).toBeCloseTo(150 / 80);
    expect(out.totals.cpm).toBeCloseTo((150 / 7000) * 1000);
    expect(out.totals.frequency).toBeCloseTo(7000 / 5800);
    expect(out.totals.leads).toBe(5);
    expect(out.totals.messaging_conversations).toBe(3);
    expect(out.totals.purchases).toBe(2);
    expect(out.totals.link_clicks).toBe(40);
    expect(out.totals.results).toBe(5 + 3 + 2); // leads + msg + purchases

    // Trend (daily, sorted)
    expect(out.trend).toHaveLength(2);
    expect(out.trend[0].date).toBe('2026-04-01');
    expect(out.trend[0].spend).toBe(100);
    expect(out.trend[1].date).toBe('2026-04-02');

    // Campaign bars exclude zero-spend rows
    expect(out.campaignBars.map((c) => c.name)).toEqual(['Spring Sale', 'Brand Awareness']);
    expect(out.campaignBars[0].spend).toBe(120);
    // Top campaigns include all rows but sorted desc by spend
    expect(out.topCampaigns.map((c) => c.campaign_name)).toEqual(['Spring Sale', 'Brand Awareness', 'Inactive']);

    // Platform breakdown — share is rounded to 1 decimal
    expect(out.platformBreakdown).not.toBeNull();
    const fb = out.platformBreakdown.find((p) => p.name === 'facebook');
    const ig = out.platformBreakdown.find((p) => p.name === 'instagram');
    expect(fb.spend).toBe(90);
    expect(ig.spend).toBe(60);
    expect(fb.share).toBe(60); // 90/150
    expect(ig.share).toBe(40);

    // Placement breakdown
    expect(out.placementBreakdown.length).toBe(4);
    expect(out.placementBreakdown[0].name).toContain('feed');

    // Demographic
    expect(out.demographicBreakdown.length).toBe(3);
    expect(out.demographicBreakdown[0].results).toBe(3);

    // CTWA referral sources mixed in
    expect(out.ctwaSources.length).toBe(2);
    expect(out.ctwaSources[0].name).toBe('ad');
    expect(out.ctwaSources[0].value).toBe(80); // 8/10
    expect(out.ctwaSources[1].name).toBe('organic');

    expect(out.hasData).toBe(true);
    expect(out.sectionErrors).toEqual({});
  });
});

describe('AnalyticsService.getDashboard — partial failure', () => {
  it('renders dashboard even when one breakdown call rejects (degrade gracefully)', async () => {
    const dailyRows = [
      { date_start: '2026-04-01', spend: '10', impressions: '100', clicks: '5', actions: [] },
    ];
    fakeMetaApi.getAccountInsights
      .mockResolvedValueOnce({ data: dailyRows })
      .mockResolvedValueOnce({ data: [] }) // campaigns OK but empty
      .mockRejectedValueOnce({ code: 17, message: 'rate-limit' }) // platform fails
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const { svc } = makeService();
    const out = await svc.getDashboard(ORG_ID);

    expect(out.hasAccount).toBe(true);
    expect(out.totals.spend).toBe(10);
    expect(out.platformBreakdown).toBeNull();
    expect(out.sectionErrors.platform).toBeDefined();
    expect(out.sectionErrors.platform.message).toBe('rate-limit');
    // Other sections present
    expect(out.placementBreakdown).toEqual([]);
    expect(out.demographicBreakdown).toEqual([]);
  });
});

describe('AnalyticsService._resolveRange', () => {
  it('passes through valid date_preset values', () => {
    const { svc } = makeService();
    const r = svc._resolveRange({ date_preset: 'last_7d' });
    expect(r.metaParams).toEqual({ date_preset: 'last_7d' });
    expect(r.response.date_preset).toBe('last_7d');
    expect(r.response.days).toBe(7);
  });

  it('maps a numeric ?days= to a known preset when one matches', () => {
    const { svc } = makeService();
    const r = svc._resolveRange({ days: 14 });
    expect(r.metaParams).toEqual({ date_preset: 'last_14d' });
    expect(r.response.days).toBe(14);
  });

  it('builds a time_range when ?days= does not match a preset', () => {
    const { svc } = makeService();
    const r = svc._resolveRange({ days: 45 });
    expect(r.metaParams.time_range).toBeDefined();
    expect(r.metaParams.time_range.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.metaParams.time_range.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.response.days).toBe(45);
  });

  it('rejects invalid date_preset and falls back to last_28d', () => {
    const { svc } = makeService();
    const r = svc._resolveRange({ date_preset: 'all_time_pls' });
    expect(r.metaParams).toEqual({ date_preset: 'last_28d' });
    expect(r.response.date_preset).toBe('last_28d');
  });

  it('rejects out-of-bound days and falls back to last_28d', () => {
    const { svc } = makeService();
    const r = svc._resolveRange({ days: 9999 });
    expect(r.metaParams).toEqual({ date_preset: 'last_28d' });
  });
});

describe('AnalyticsService.getCampaigns', () => {
  it('returns campaigns with derived per-row metrics, sorted by spend desc', async () => {
    fakeMetaApi.getAccountInsights.mockResolvedValueOnce({
      data: [
        { campaign_id: 'A', campaign_name: 'A', spend: '50', impressions: '1000', clicks: '20', actions: [] },
        { campaign_id: 'B', campaign_name: 'B', spend: '200', impressions: '4000', clicks: '50', actions: [{ action_type: 'lead', value: '7' }] },
      ],
    });

    const { svc } = makeService();
    const out = await svc.getCampaigns(ORG_ID, { date_preset: 'last_30d' });

    expect(out.hasAccount).toBe(true);
    expect(out.campaigns).toHaveLength(2);
    expect(out.campaigns[0].campaign_id).toBe('B');
    expect(out.campaigns[0].leads).toBe(7);
    expect(out.campaigns[0].results).toBe(7);
    expect(out.campaigns[1].cpc).toBeCloseTo(50 / 20);
  });

  it('returns empty campaigns when account is not connected', async () => {
    const { svc } = makeService({ account: null });
    const out = await svc.getCampaigns(ORG_ID);
    expect(out.hasAccount).toBe(false);
    expect(out.campaigns).toEqual([]);
    expect(fakeMetaApi.getAccountInsights).not.toHaveBeenCalled();
  });
});

describe('AnalyticsService.getTopAds', () => {
  it('joins insights with creative thumbnails and clamps limit', async () => {
    fakeMetaApi.getAccountInsights.mockResolvedValueOnce({
      data: [
        { ad_id: '1', ad_name: 'Ad 1', spend: '50', impressions: '500', clicks: '20', actions: [] },
        { ad_id: '2', ad_name: 'Ad 2', spend: '100', impressions: '1000', clicks: '40', actions: [{ action_type: 'lead', value: '4' }] },
        { ad_id: '3', ad_name: 'Ad 3', spend: '10', impressions: '200', clicks: '5', actions: [] },
      ],
    });
    fakeMetaApi.getAds.mockResolvedValueOnce({
      data: [
        { id: '2', name: 'Ad 2', creative: { thumbnail_url: 'https://thumb/2.jpg', instagram_permalink_url: 'https://ig/p/2' } },
        { id: '1', name: 'Ad 1', creative: { thumbnail_url: 'https://thumb/1.jpg' } },
      ],
    });

    const { svc } = makeService();
    const out = await svc.getTopAds(ORG_ID, { limit: 2 });

    expect(out.hasAccount).toBe(true);
    expect(out.ads).toHaveLength(2);
    expect(out.ads[0].ad_id).toBe('2');
    expect(out.ads[0].thumbnail_url).toBe('https://thumb/2.jpg');
    expect(out.ads[0].leads).toBe(4);
    expect(out.ads[1].ad_id).toBe('1');
    expect(out.ads[1].thumbnail_url).toBe('https://thumb/1.jpg');
  });

  it('still returns ads even when creative join fails (logged, no throw)', async () => {
    fakeMetaApi.getAccountInsights.mockResolvedValueOnce({
      data: [{ ad_id: 'X', ad_name: 'X', spend: '10', impressions: '50', clicks: '2', actions: [] }],
    });
    fakeMetaApi.getAds.mockRejectedValueOnce({ code: 500, message: 'meta down' });

    const { svc } = makeService();
    const out = await svc.getTopAds(ORG_ID);

    expect(out.ads).toHaveLength(1);
    expect(out.ads[0].thumbnail_url).toBeNull();
  });

  it('throws when insights call itself fails (no fallback path)', async () => {
    fakeMetaApi.getAccountInsights.mockRejectedValueOnce({ code: 401, message: 'token expired' });
    fakeMetaApi.getAds.mockResolvedValueOnce({ data: [] });

    const { svc } = makeService();
    await expect(svc.getTopAds(ORG_ID)).rejects.toMatchObject({ code: 401 });
  });
});
