// Pure aggregation for the public friend-awards hall: SQL rows grouped by account,
// sorted by award count (then account label).

export interface FriendAwardsHallSourceRow {
  accountId: number;
  recipientName: string;
  title: string;
  giverName: string;
}

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

export function buildFriendAwardsHallEntries(
  rows: readonly FriendAwardsHallSourceRow[],
): FriendAwardsHallEntry[] {
  const byAccount = new Map<number, FriendAwardsHallEntry>();
  for (const row of rows) {
    const accountId = row.accountId;
    if (!Number.isSafeInteger(accountId) || accountId <= 0) continue;
    const title = row.title.trim();
    const giverName = row.giverName.trim();
    const recipientName = row.recipientName.trim();
    if (!title || !recipientName) continue;
    let entry = byAccount.get(accountId);
    if (!entry) {
      entry = { accountId, displayName: '', awardCount: 0, awards: [] };
      byAccount.set(accountId, entry);
    }
    entry.awards.push({
      title,
      giverName,
      recipientName,
    });
    entry.awardCount += 1;
  }
  for (const entry of byAccount.values()) {
    const names = [...new Set(entry.awards.map((a) => a.recipientName))].sort((a, b) =>
      a.localeCompare(b),
    );
    entry.displayName = names.join(', ');
  }
  return [...byAccount.values()].sort((a, b) => {
    if (b.awardCount !== a.awardCount) return b.awardCount - a.awardCount;
    return a.displayName.localeCompare(b.displayName);
  });
}