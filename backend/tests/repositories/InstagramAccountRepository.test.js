import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramAccountRepository } from '../../src/Repositories/InstagramAccountRepository.js';

// Build a chainable db stub. Each operation returns the same proxy whose
// terminal call (where/limit/values) resolves with `_resolved`.
function makeDb({ resolved } = {}) {
  const db = {
    _resolved: resolved,
    select: vi.fn(() => db),
    from: vi.fn(() => db),
    where: vi.fn(() => db),
    limit: vi.fn(() => db),
    insert: vi.fn(() => db),
    values: vi.fn(() => db),
    update: vi.fn(() => db),
    set: vi.fn(() => db),
    delete: vi.fn(() => db),
    then: (onF) => Promise.resolve(db._resolved).then(onF),
  };
  return db;
}

describe('InstagramAccountRepository', () => {
  let db, repo;

  beforeEach(() => {
    db = makeDb({ resolved: [] });
    repo = new InstagramAccountRepository(db);
  });

  it('create inserts a row and queries it back', async () => {
    db._resolved = [
      { id: 'IG1', ig_business_id: 'IGBIZ1', ig_username: 'acme', is_active: true },
    ];
    const out = await repo.create({
      id: 'IG1',
      organization_id: 'org1',
      ig_business_id: 'IGBIZ1',
      ig_username: 'acme',
      access_token_encrypted: 'enc',
    });
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'IG1',
        ig_business_id: 'IGBIZ1',
        ig_username: 'acme',
      }),
    );
    expect(out.ig_username).toBe('acme');
  });

  it('findByBusinessId returns null when no row', async () => {
    db._resolved = [];
    const out = await repo.findByBusinessId('org1', 'IGBIZ_MISSING');
    expect(out).toBeNull();
  });

  it('findByBusinessId returns the row when found', async () => {
    db._resolved = [{ id: 'IG1', ig_business_id: 'IGBIZ1' }];
    const out = await repo.findByBusinessId('org1', 'IGBIZ1');
    expect(out.id).toBe('IG1');
  });

  it('linkChannel inserts a join row', async () => {
    await repo.linkChannel({
      organization_id: 'org1',
      channel_id: 'ch1',
      instagram_account_id: 'IG1',
    });
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'ch1',
        instagram_account_id: 'IG1',
        organization_id: 'org1',
      }),
    );
  });

  it('unlinkChannel deletes a join row', async () => {
    await repo.unlinkChannel({ channel_id: 'ch1', instagram_account_id: 'IG1' });
    expect(db.delete).toHaveBeenCalled();
  });

  it('findActiveAccountsForChannel filters out inactive accounts', async () => {
    // First call: links query returns 2 link rows
    // Second call: accounts query returns 2 accounts (one active, one inactive)
    let callCount = 0;
    db.select = vi.fn(() => {
      callCount += 1;
      return db;
    });
    db.then = (onF) => {
      // The first awaited query is the links query; second is the accounts.
      if (callCount === 1) {
        return Promise.resolve([
          { instagram_account_id: 'IG1' },
          { instagram_account_id: 'IG2' },
        ]).then(onF);
      }
      return Promise.resolve([
        { id: 'IG1', is_active: true, ig_business_id: 'A' },
        { id: 'IG2', is_active: false, ig_business_id: 'B' },
      ]).then(onF);
    };
    const out = await repo.findActiveAccountsForChannel('ch1');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('IG1');
  });

  it('hardDelete cascades: deletes join rows then the account', async () => {
    await repo.hardDelete('IG1');
    expect(db.delete).toHaveBeenCalledTimes(2);
  });
});
