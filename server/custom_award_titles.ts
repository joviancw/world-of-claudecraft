// Live sync of player-awarded titles onto an online character. The sim never
// reads the database (src/sim/custom_titles.ts), so the server loads the
// character's wearable awards (shown, not rejected) and installs them as the
// entity's custom-title map: at join, after a new award, and after the
// recipient hides, shows, or rejects one. A custom title the character was
// wearing that is no longer wearable is cleared in the same step.
//
// Off a private realm the map is installed empty without a query, so a
// custom title restored from an old save never shows.

import { applyCustomTitles, customTitleId } from '../src/sim/custom_titles';
import type { PlayerMeta } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import type { CustomAwardsStore } from './custom_awards_db';

export interface CustomTitleSim {
  readonly players: ReadonlyMap<number, PlayerMeta>;
  readonly entities: ReadonlyMap<number, Entity>;
}

const NO_TITLES: ReadonlyMap<string, string> = new Map();

export class CustomAwardTitles {
  // The newest sync per character wins: an older read that resolves late
  // (a join racing a hide) must not reinstall what the newer one removed.
  private readonly seq = new Map<number, number>();

  constructor(
    private readonly store: Pick<CustomAwardsStore, 'listFor'>,
    private readonly enabled: () => boolean,
    private readonly sim: () => CustomTitleSim,
  ) {}

  async sync(characterId: number): Promise<void> {
    const mine = (this.seq.get(characterId) ?? 0) + 1;
    this.seq.set(characterId, mine);
    try {
      let titles = NO_TITLES;
      if (this.enabled()) {
        const rows = await this.store.listFor(characterId);
        if (this.seq.get(characterId) !== mine) return;
        titles = new Map(rows.filter((r) => !r.hidden).map((r) => [customTitleId(r.id), r.title]));
      }
      const sim = this.sim();
      for (const [pid, meta] of sim.players) {
        if (meta.characterId !== characterId) continue;
        const e = sim.entities.get(pid);
        if (e) applyCustomTitles(meta, e, titles);
      }
    } finally {
      if (this.seq.get(characterId) === mine) this.seq.delete(characterId);
    }
  }
}
