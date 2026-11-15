import { describe, expect, it } from 'vitest';
import { formatFriendAwardsLeaderboardCell } from '../src/ui/friend_awards_leaderboard_cell';

describe('formatFriendAwardsLeaderboardCell', () => {
  it('joins visible awards with giver names', () => {
    expect(
      formatFriendAwardsLeaderboardCell([
        { title: 'Fish Whisperer', giverName: 'Ann' },
        { title: 'Weekend MVP', giverName: 'Bob' },
      ]),
    ).toBe('Fish Whisperer (Ann); Weekend MVP (Bob)');
  });
});