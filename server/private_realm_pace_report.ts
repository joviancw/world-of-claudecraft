// Private-realm XP calibration from real play: reads the "private realm pace"
// log lines (server/private_realm_pace.ts), projects each character's played
// time to the level cap from its RECENT rate (the last few level-ups, since XP
// per hour rises with level), and recommends the multiplier that would land
// the median character on the target. Pure, so a test drives it directly; the
// CLI is scripts/private_realm_pace_report.ts.

import { MAX_LEVEL, xpToReachLevel } from '../src/sim/types';

export interface PaceRow {
  characterId: number;
  characterName: string | null;
  level: number;
  lifetimeXp: number;
  playedSeconds: number;
}

export interface PaceProjection {
  characterId: number;
  characterName: string | null;
  level: number;
  playedHours: number;
  projectedHours: number;
}

const RECENT_LEVELS = 3;

/** Pull the pace samples out of a pino log (one JSON object per line). */
export function parsePaceLines(text: string): PaceRow[] {
  const rows: PaceRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.includes('private realm pace')) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.msg !== 'private realm pace') continue;
    const { characterId, charLevel: level, lifetimeXp, playedSeconds } = o;
    if (
      typeof characterId !== 'number' ||
      typeof level !== 'number' ||
      typeof lifetimeXp !== 'number' ||
      typeof playedSeconds !== 'number'
    )
      continue;
    const characterName = typeof o.characterName === 'string' ? o.characterName : null;
    rows.push({ characterId, characterName, level, lifetimeXp, playedSeconds });
  }
  return rows;
}

/** One projection per character with at least two samples; null otherwise. */
export function projectCharacter(
  samples: readonly PaceRow[],
  capLevel = MAX_LEVEL,
): PaceProjection | null {
  const s = [...samples].sort((a, b) => a.level - b.level);
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const from = s[Math.max(0, s.length - 1 - RECENT_LEVELS)];
  const xp = last.lifetimeXp - from.lifetimeXp;
  const secs = last.playedSeconds - from.playedSeconds;
  if (xp <= 0 || secs <= 0) return null;
  const remaining = Math.max(0, xpToReachLevel(capLevel) - last.lifetimeXp);
  const projectedSeconds = last.playedSeconds + remaining / (xp / secs);
  return {
    characterId: last.characterId,
    characterName: last.characterName,
    level: last.level,
    playedHours: last.playedSeconds / 3600,
    projectedHours: projectedSeconds / 3600,
  };
}

export function projectAll(rows: readonly PaceRow[], capLevel = MAX_LEVEL): PaceProjection[] {
  const byChar = new Map<number, PaceRow[]>();
  for (const r of rows) byChar.set(r.characterId, [...(byChar.get(r.characterId) ?? []), r]);
  const out: PaceProjection[] = [];
  for (const samples of byChar.values()) {
    const p = projectCharacter(samples, capLevel);
    if (p) out.push(p);
  }
  return out.sort((a, b) => a.projectedHours - b.projectedHours);
}

/** The multiplier that moves the median projection onto the target, rounded
 *  to a quarter. XP gained scales linearly with the multiplier, so time does
 *  inversely. Null without data. */
export function recommendMultiplier(
  projections: readonly PaceProjection[],
  currentMultiplier: number,
  targetHours: number,
): { medianHours: number; multiplier: number } | null {
  if (projections.length === 0 || targetHours <= 0) return null;
  const hours = projections.map((p) => p.projectedHours).sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const medianHours = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  const raw = (currentMultiplier * medianHours) / targetHours;
  return { medianHours, multiplier: Math.max(0.25, Math.round(raw * 4) / 4) };
}
