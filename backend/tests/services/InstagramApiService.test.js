import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { InstagramApiService } from '../../src/services/InstagramApiService.js';

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
});
