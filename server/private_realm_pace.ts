// Private-realm leveling pace telemetry: one structured log line per level-up
// carrying what the XP-rate calibration needs (level, lifetime XP, played
// time, quests completed). Only on a private realm; a stock realm writes
// nothing. Read the samples back with:
//   grep '"private realm pace"' server.log
// The per-level wall-clock timestamps already land in level_up_events.

import { livePlaytimeSeconds } from '../src/sim/playtime';
import type { SimEvent } from '../src/sim/types';
import { logger } from './http/logger';
import { privateRealmRules } from './private_realm_config';

export interface PaceMeta {
  readonly lifetimeXp: number;
  readonly totalPlayedSeconds: number;
  readonly joinedAt: number;
  readonly questsDone: ReadonlySet<string>;
}

export interface PaceSimView {
  readonly time: number;
  readonly players: ReadonlyMap<number, PaceMeta>;
}

export interface PaceWho {
  readonly characterId: number;
  readonly name?: string;
}

export interface PaceSample {
  characterId: number;
  characterName: string | null;
  level: number;
  lifetimeXp: number;
  playedSeconds: number;
  questsCompleted: number;
}

export function paceSample(
  who: PaceWho,
  level: number,
  meta: PaceMeta,
  simTime: number,
): PaceSample {
  return {
    characterId: who.characterId,
    characterName: who.name ?? null,
    level,
    lifetimeXp: meta.lifetimeXp,
    playedSeconds: Math.round(livePlaytimeSeconds(meta, simTime)),
    questsCompleted: meta.questsDone.size,
  };
}

export function observePrivateRealmPace<S extends PaceWho>(
  ev: SimEvent,
  sim: PaceSimView,
  clients: ReadonlyMap<number, S>,
  enabled: boolean = privateRealmRules() !== null,
  write: (sample: PaceSample) => void = (sample) => logger.info(sample, 'private realm pace'),
): void {
  if (!enabled || ev.type !== 'levelup' || ev.pid === undefined) return;
  const who = clients.get(ev.pid);
  const meta = sim.players.get(ev.pid);
  if (!who || !meta) return;
  write(paceSample(who, ev.level, meta, sim.time));
}
