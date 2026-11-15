import { describe, expect, it } from 'vitest';
import { listPublicCustomAwardsForRecipients } from '../../server/custom_awards_db';

describe('listPublicCustomAwardsForRecipients', () => {
  it('groups visible awards per recipient and caps each list', async () => {
    const rows = [
      { recipient_character_id: 2, title: 'Patch one', giver_name: 'Ann' },
      { recipient_character_id: 2, title: 'Patch two', giver_name: 'Bob' },
      { recipient_character_id: 3, title: 'Hero', giver_name: 'Cy' },
    ];
    const map = await listPublicCustomAwardsForRecipients(
      () =>
        ({
          query: async () => ({ rows }),
        }) as never,
      [2, 3],
      1,
    );
    expect(map.get(2)).toEqual([{ title: 'Patch one', giverName: 'Ann' }]);
    expect(map.get(3)).toEqual([{ title: 'Hero', giverName: 'Cy' }]);
  });

  it('returns an empty map for an empty id list', async () => {
    const map = await listPublicCustomAwardsForRecipients(
      () => {
        throw new Error('should not query');
      },
      [],
    );
    expect(map.size).toBe(0);
  });
});