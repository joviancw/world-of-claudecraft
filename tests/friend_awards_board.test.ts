import { describe, expect, it } from 'vitest';
import { friendAwardsRowHtml, loadFriendAwardsInto } from '../src/ui/friend_awards_board';
import { setLanguage, t } from '../src/ui/i18n';
import type { FriendAwardsHallEntry } from '../src/world_api/friend_awards_hall';

setLanguage('en');

function entry(over: Partial<FriendAwardsHallEntry> = {}): FriendAwardsHallEntry {
  return {
    accountId: 1,
    displayName: 'Balgath',
    awardCount: 1,
    awards: [{ title: 'MVP', giverName: 'Anna', recipientName: 'Balgath' }],
    ...over,
  };
}

function host(): HTMLElement & { innerHTML: string } {
  return { innerHTML: '' } as HTMLElement & { innerHTML: string };
}

describe('friend_awards_board', () => {
  it('renders rank, account name, count, and awards', () => {
    const html = friendAwardsRowHtml(1, entry());
    expect(html).toContain('fa-rank');
    expect(html).toContain('Balgath');
    expect(html).toContain('MVP');
    expect(html).toContain('Anna');
    expect(html).toContain(`data-label="${t('friendAwards.countCol')}"`);
  });

  it('prefixes character names when an account has multiple recipients', () => {
    const html = friendAwardsRowHtml(
      2,
      entry({
        displayName: 'Alt, Main',
        awardCount: 2,
        awards: [
          { title: 'A', giverName: 'G1', recipientName: 'Main' },
          { title: 'B', giverName: 'G2', recipientName: 'Alt' },
        ],
      }),
    );
    expect(html).toContain('Main: A (G1)');
    expect(html).toContain('Alt: B (G2)');
  });

  it('loads the hall and paints rows', async () => {
    const el = host();
    await loadFriendAwardsInto(el, async () => ({
      enabled: true,
      entries: [entry(), entry({ accountId: 2, displayName: 'Cy', awardCount: 3 })],
    }));
    expect(el.innerHTML).toContain('fa-row');
    expect(el.innerHTML).toContain('Cy');
  });
});