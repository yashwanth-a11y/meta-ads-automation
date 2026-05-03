import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  InstagramApiService,
  defaultInsightMetrics,
} from '../../src/services/InstagramApiService.js';

vi.mock('axios');

describe('InstagramApiService', () => {
  let svc;
  beforeEach(() => {
    svc = new InstagramApiService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
  });

  it('exchangeForLongLivedToken hits ig_exchange_token', async () => {
    axios.get.mockResolvedValueOnce({
      data: { access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 },
    });
    const out = await svc.exchangeForLongLivedToken('SHORT');
    const url = axios.get.mock.calls[0][0];
    const params = axios.get.mock.calls[0][1].params;
    expect(url).toMatch(/graph\.instagram\.com.*access_token/);
    expect(params).toMatchObject({
      grant_type: 'ig_exchange_token',
      access_token: 'SHORT',
    });
    expect(out).toEqual({ access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 });
  });

  it('refreshLongLivedToken hits ig_refresh_token', async () => {
    axios.get.mockResolvedValueOnce({
      data: { access_token: 'NEWLONG', token_type: 'bearer', expires_in: 5184000 },
    });
    const out = await svc.refreshLongLivedToken('OLD');
    const params = axios.get.mock.calls[0][1].params;
    expect(params).toMatchObject({
      grant_type: 'ig_refresh_token',
      access_token: 'OLD',
    });
    expect(out.access_token).toBe('NEWLONG');
  });

  it('getProfile returns profile fields', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'IGBIZ1',
        username: 'acme',
        name: 'Acme',
        followers_count: 42,
        account_type: 'BUSINESS',
      },
    });
    const out = await svc.getProfile('IGBIZ1', 'TOK');
    const url = axios.get.mock.calls[0][0];
    const params = axios.get.mock.calls[0][1].params;
    expect(url).toMatch(/IGBIZ1$/);
    expect(params.fields).toContain('username');
    expect(params.access_token).toBe('TOK');
    expect(out.username).toBe('acme');
  });

  it('getMedia paginates with limit and after', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'M1', caption: 'hi', media_type: 'IMAGE', permalink: 'https://x' }],
        paging: { cursors: { before: 'B', after: 'A' }, next: 'https://next' },
      },
    });
    const out = await svc.getMedia('IGBIZ1', 'TOK', { limit: 10, after: 'PREV' });
    const params = axios.get.mock.calls[0][1].params;
    expect(params.limit).toBe(10);
    expect(params.after).toBe('PREV');
    expect(out.data).toHaveLength(1);
    expect(out.paging.next).toBe('https://next');
  });

  it('getMedia requests engagement counts and carousel children', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: [] } });
    await svc.getMedia('IGBIZ1', 'TOK');
    const params = axios.get.mock.calls[0][1].params;
    expect(params.fields).toContain('like_count');
    expect(params.fields).toContain('comments_count');
    expect(params.fields).toContain('is_comment_enabled');
    expect(params.fields).toContain('children{');
  });

  it('getMediaMeta returns the lightweight type fields', async () => {
    axios.get.mockResolvedValueOnce({
      data: { id: 'M1', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: 't' },
    });
    const out = await svc.getMediaMeta('M1', 'TOK');
    const params = axios.get.mock.calls[0][1].params;
    expect(params.fields).toBe('id,media_type,media_product_type,timestamp');
    expect(out.media_product_type).toBe('REELS');
  });

  it('getMediaInsights normalizes the {data:[{name,values:[{value}]}]} shape', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: [
          { name: 'reach', values: [{ value: 1234 }] },
          { name: 'likes', values: [{ value: 56 }] },
          { name: 'shares', values: [{ value: 0 }] },
          { name: 'views', values: [] }, // missing values array
        ],
      },
    });
    const out = await svc.getMediaInsights('M1', 'TOK', {
      metrics: ['reach', 'likes', 'shares', 'views'],
    });
    const params = axios.get.mock.calls[0][1].params;
    expect(params.metric).toBe('reach,likes,shares,views');
    expect(out).toEqual({ reach: 1234, likes: 56, shares: 0, views: null });
  });

  it('getMediaInsights rejects when metrics is missing or empty', async () => {
    await expect(svc.getMediaInsights('M1', 'TOK', { metrics: [] })).rejects.toThrow(
      /metrics array is required/,
    );
    await expect(svc.getMediaInsights('M1', 'TOK', {})).rejects.toThrow(
      /metrics array is required/,
    );
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('defaultInsightMetrics', () => {
  it('uses STORY metrics for story posts', () => {
    expect(defaultInsightMetrics({ media_type: 'IMAGE', media_product_type: 'STORY' })).toEqual([
      'reach',
      'replies',
      'total_interactions',
    ]);
  });

  it('includes views for REELS and FEED VIDEO', () => {
    const reels = defaultInsightMetrics({ media_type: 'VIDEO', media_product_type: 'REELS' });
    expect(reels).toContain('views');
    const feedVideo = defaultInsightMetrics({ media_type: 'VIDEO', media_product_type: 'FEED' });
    expect(feedVideo).toContain('views');
  });

  it('omits views for FEED IMAGE / CAROUSEL', () => {
    const img = defaultInsightMetrics({ media_type: 'IMAGE', media_product_type: 'FEED' });
    const carousel = defaultInsightMetrics({
      media_type: 'CAROUSEL_ALBUM',
      media_product_type: 'FEED',
    });
    expect(img).not.toContain('views');
    expect(carousel).not.toContain('views');
    expect(img).toEqual(['reach', 'saved', 'total_interactions', 'likes', 'comments', 'shares']);
  });

  it('returns a sane default when type fields are missing', () => {
    expect(defaultInsightMetrics()).toEqual([
      'reach',
      'saved',
      'total_interactions',
      'likes',
      'comments',
      'shares',
    ]);
  });
});
