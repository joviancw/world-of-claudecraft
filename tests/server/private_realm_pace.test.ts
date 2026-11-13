// Private-realm pace telemetry (server/private_realm_pace.ts): one sample per
// level-up with lifetime XP, played time, and quests completed; silent on a
// stock realm and for events it cannot attribute.
import { describe, expect, it } from 'vitest';
import {
  observePrivateRealmPace,
  type PaceMeta,
  type PaceSample,
} from '../../server/private_realm_pace';
import type { SimEvent } from '../../src/sim/types';

const meta: PaceMeta = {
  lifetimeXp: 12345,
  totalPlayedSeconds: 3600,
  joinedAt: 100,
  questsDone: new Set(['q1', 'q2', 'q3']),
};
const sim = { time: 400, players: new Map([[7, meta]]) };
const clients = new Map([[7, { characterId: 55, name: 'Frostwhisper' }]]);
const levelup = { type: 'levelup', level: 6, pid: 7 } as SimEvent;

describe('observePrivateRealmPace', () => {
  it('writes one sample per level-up on a private realm', () => {
    const out: PaceSample[] = [];
    observePrivateRealmPace(levelup, sim, clients, true, (s) => out.push(s));
    expect(out).toEqual([
      {
        characterId: 55,
        characterName: 'Frostwhisper',
        level: 6,
        lifetimeXp: 12345,
        playedSeconds: 3900,
        questsCompleted: 3,
      },
    ]);
  });

  it('writes nothing on a stock realm, for other events, or unknown players', () => {
    const out: PaceSample[] = [];
    const push = (s: PaceSample) => out.push(s);
    observePrivateRealmPace(levelup, sim, clients, false, push);
    observePrivateRealmPace(
      { type: 'xp', amount: 5, pid: 7 } as SimEvent,
      sim,
      clients,
      true,
      push,
    );
    observePrivateRealmPace({ ...levelup, pid: 8 } as SimEvent, sim, clients, true, push);
    expect(out).toEqual([]);
  });
});
