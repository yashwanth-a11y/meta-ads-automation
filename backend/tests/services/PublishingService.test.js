import { describe, it, expect } from 'vitest';
import { PublishingService } from '../../src/services/PublishingService.js';

describe('PublishingService — smoke', () => {
  it('instantiates', () => {
    const svc = new PublishingService();
    expect(svc).toBeInstanceOf(PublishingService);
  });
});
