// Format friend-awarded achievements for the high-scores board (player-authored text).

import type { FriendAwardLeaderboardEntry } from '../world_api/friend_awards';

export function formatFriendAwardsLeaderboardCell(
  awards: readonly FriendAwardLeaderboardEntry[],
): string {
  if (awards.length === 0) return '';
  return awards.map((a) => `${a.title} (${a.giverName})`).join('; ');
}