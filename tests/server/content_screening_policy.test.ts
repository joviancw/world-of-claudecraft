import { afterEach, describe, expect, it } from 'vitest';
import { offensiveName } from '../../server/auth';
import { ChatFilter } from '../../server/chat_filter';
import { contentScreeningEnabled } from '../../server/content_screening_policy';

describe('contentScreeningEnabled', () => {
  const prev = process.env.PRIVATE_REALM;

  afterEach(() => {
    if (prev === undefined) delete process.env.PRIVATE_REALM;
    else process.env.PRIVATE_REALM = prev;
  });

  it('is off when PRIVATE_REALM=1', () => {
    process.env.PRIVATE_REALM = '1';
    expect(contentScreeningEnabled()).toBe(false);
  });

  it('is on for stock realms', () => {
    delete process.env.PRIVATE_REALM;
    expect(contentScreeningEnabled()).toBe(true);
  });
});

describe('private realm content screening', () => {
  const prev = process.env.PRIVATE_REALM;

  afterEach(() => {
    if (prev === undefined) delete process.env.PRIVATE_REALM;
    else process.env.PRIVATE_REALM = prev;
  });

  it('skips offensiveName when PRIVATE_REALM=1', () => {
    process.env.PRIVATE_REALM = '1';
    expect(offensiveName('shit')).toBe(false);
    expect(offensiveName('Hitler')).toBe(false);
  });

  it('disables chat filter tiers when PRIVATE_REALM=1', () => {
    process.env.PRIVATE_REALM = '1';
    const filter = new ChatFilter();
    filter.load({
      soft: ['shit'],
      hard: ['slurword'],
      config: { warningsBeforeMute: 1, muteLadderSeconds: [60] },
    });
    expect(filter.softWords()).toEqual([]);
    expect(filter.findHardHit('what shit slurword')).toBeNull();
  });
});