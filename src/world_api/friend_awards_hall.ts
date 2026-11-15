// Public friend-awards hall (website shell + REST), grouped by account.

export interface FriendAwardsHallAward {
  title: string;
  giverName: string;
  recipientName: string;
}

export interface FriendAwardsHallEntry {
  accountId: number;
  displayName: string;
  awardCount: number;
  awards: FriendAwardsHallAward[];
}