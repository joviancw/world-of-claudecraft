import { describe, expect, it } from 'vitest';
import { buildFriendAwardsHallEntries } from '../../server/friend_awards_hall_build';
import { routes } from '../../server/friend_awards_hall_routes';

describe('buildFriendAwardsHallEntries', () => {
  it('groups by account, sums counts, and sorts by award count', () => {
    const entries = buildFriendAwardsHallEntries([
      { accountId: 2, recipientName: 'Bob', title: 'B1', giverName: 'Ann' },
      { accountId: 1, recipientName: 'Al', title: 'A1', giverName: 'Cy' },
      { accountId: 2, recipientName: 'Bob', title: 'B2', giverName: 'Dee' },
    ]);
    expect(entries.map((e) => e.accountId)).toEqual([2, 1]);
    expect(entries[0].awardCount).toBe(2);
    expect(entries[0].displayName).toBe('Bob');
    expect(entries[1].awardCount).toBe(1);
  });

  it('joins character names for one account with multiple recipients', () => {
    const entries = buildFriendAwardsHallEntries([
      { accountId: 5, recipientName: 'Zed', title: 'Z', giverName: 'Q' },
      { accountId: 5, recipientName: 'Amy', title: 'A', giverName: 'Q' },
    ]);
    expect(entries[0].displayName).toBe('Amy, Zed');
    expect(entries[0].awards).toHaveLength(2);
  });
});

describe('friend awards hall route', () => {
  it('registers GET /api/friend-awards/hall', () => {
    expect(routes.some((r) => r.method === 'GET' && r.path === '/api/friend-awards/hall')).toBe(
      true,
    );
  });
});