// The live title sync (server/custom_award_titles.ts) and its triggers on the
// award service (server/custom_awards.ts bindSim): wearable awards install on
// the online character, hidden ones never do, a stale read loses to a newer
// one, and a stock realm installs nothing without touching the database.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_custom_award_titles';

import { describe, expect, it } from 'vitest';
import { customAwardChanged } from '../../server/custom_award_changes';
import { CustomAwardTitles, type CustomTitleSim } from '../../server/custom_award_titles';
import { CustomAwards } from '../../server/custom_awards';
import type { CustomAwardRow, CustomAwardsStore } from '../../server/custom_awards_db';
import type { PlayerMeta } from '../../src/sim/sim';
import type { Entity } from '../../src/sim/types';

const CHAR = 55;

const row = (id: number, title: string, hidden = false): CustomAwardRow => ({
  id,
  title,
  description: '',
  giverName: 'Thorne',
  hidden,
  createdAt: 0,
});

function fakeSim(characterId = CHAR) {
  const meta = { characterId, activeTitle: null } as unknown as PlayerMeta;
  const e = { title: null } as unknown as Entity;
  const sim: CustomTitleSim = { players: new Map([[1, meta]]), entities: new Map([[1, e]]) };
  return { sim, meta, e };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CustomAwardTitles.sync', () => {
  it('installs the shown awards on the online character', async () => {
    const { sim, e } = fakeSim();
    const store = { listFor: async () => [row(1, 'Shown'), row(2, 'Tucked away', true)] };
    await new CustomAwardTitles(
      store,
      () => true,
      () => sim,
    ).sync(CHAR);
    expect([...(e.customTitles ?? [])]).toEqual([['custom:1', 'Shown']]);
  });

  it('ignores other characters', async () => {
    const { sim, e } = fakeSim(CHAR + 1);
    await new CustomAwardTitles(
      { listFor: async () => [row(1, 'X')] },
      () => true,
      () => sim,
    ).sync(CHAR);
    expect(e.customTitles).toBeUndefined();
  });

  it('installs nothing and reads nothing off a private realm', async () => {
    const { sim, meta, e } = fakeSim();
    meta.activeTitle = 'custom:1';
    let reads = 0;
    const store = {
      listFor: async () => {
        reads++;
        return [row(1, 'X')];
      },
    };
    await new CustomAwardTitles(
      store,
      () => false,
      () => sim,
    ).sync(CHAR);
    expect(reads).toBe(0);
    expect(e.customTitles?.size).toBe(0);
    expect(meta.activeTitle).toBeNull();
  });

  it('lets the newest sync win over a slower older read', async () => {
    const { sim, e } = fakeSim();
    let release: (rows: CustomAwardRow[]) => void = () => {};
    const slow = new Promise<CustomAwardRow[]>((r) => {
      release = r;
    });
    const answers = [slow, Promise.resolve([] as CustomAwardRow[])];
    const titles = new CustomAwardTitles(
      { listFor: () => answers.shift()! },
      () => true,
      () => sim,
    );
    const older = titles.sync(CHAR);
    await titles.sync(CHAR);
    release([row(1, 'Stale')]);
    await older;
    expect(e.customTitles?.size).toBe(0);
  });
});

describe('CustomAwards title triggers', () => {
  function service(rows: CustomAwardRow[]) {
    const store = { listFor: async () => rows } as unknown as CustomAwardsStore;
    const awards = new CustomAwards(
      { consumeCommandLane: () => true },
      { sessions: () => [], sendRaw: () => {} },
      store,
      () => ({ customAwardsEnabled: true, globalAnnouncements: true }) as never,
    );
    return awards;
  }

  it('is inert until the sim is bound', async () => {
    const { e } = fakeSim();
    service([row(1, 'A')]).syncTitles(CHAR);
    await flush();
    expect(e.customTitles).toBeUndefined();
  });

  it('resyncs on a REST change once bound', async () => {
    const { sim, e } = fakeSim();
    const awards = service([row(3, 'Hero')]);
    awards.bindSim(() => sim);
    customAwardChanged(CHAR);
    await flush();
    expect([...(e.customTitles ?? [])]).toEqual([['custom:3', 'Hero']]);
  });
});
