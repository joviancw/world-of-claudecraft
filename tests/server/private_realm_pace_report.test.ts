// The private-realm XP calibration report (server/private_realm_pace_report.ts):
// it reads only real pace lines, projects time to the cap from the recent
// rate, and scales the multiplier inversely with time.
import { describe, expect, it } from 'vitest';
import {
  type PaceRow,
  parsePaceLines,
  projectAll,
  projectCharacter,
  recommendMultiplier,
} from '../../server/private_realm_pace_report';
import { MAX_LEVEL, xpToReachLevel } from '../../src/sim/types';

const row = (level: number, lifetimeXp: number, playedSeconds: number, id = 1): PaceRow => ({
  characterId: id,
  characterName: `C${id}`,
  level,
  lifetimeXp,
  playedSeconds,
});

describe('parsePaceLines', () => {
  it('keeps only well-formed pace lines', () => {
    const good = {
      msg: 'private realm pace',
      characterId: 3,
      characterName: 'Ana',
      charLevel: 5,
      lifetimeXp: 4000,
      playedSeconds: 1800,
    };
    const text = [
      JSON.stringify(good),
      JSON.stringify({
        msg: 'other',
        characterId: 3,
        charLevel: 5,
        lifetimeXp: 1,
        playedSeconds: 1,
      }),
      'not json private realm pace',
      JSON.stringify({ ...good, charLevel: '5' }),
      '',
    ].join('\n');
    expect(parsePaceLines(text)).toEqual([
      { characterId: 3, characterName: 'Ana', level: 5, lifetimeXp: 4000, playedSeconds: 1800 },
    ]);
  });
});

describe('projectCharacter', () => {
  it('needs two samples', () => {
    expect(projectCharacter([row(2, 100, 60)])).toBeNull();
  });

  it('projects the remaining XP at the recent rate', () => {
    const cap = xpToReachLevel(MAX_LEVEL);
    // Half the curve in two hours at a steady rate: four hours in total.
    const p = projectCharacter([row(5, 0, 0), row(10, cap / 2, 7200)]);
    expect(p?.projectedHours).toBeCloseTo(4);
    expect(p?.playedHours).toBeCloseTo(2);
  });

  it('weights the last few levels, not the slow start', () => {
    const cap = xpToReachLevel(MAX_LEVEL);
    const samples = [
      row(2, 0, 0),
      row(3, 1000, 36_000), // a long idle start
      row(4, 2000, 36_100),
      row(5, 3000, 36_200),
      row(6, 4000, 36_300),
    ];
    const p = projectCharacter(samples)!;
    // Recent rate: 3000 XP per 300 s.
    expect(p.projectedHours).toBeCloseTo((36_300 + (cap - 4000) / 10) / 3600);
  });
});

describe('recommendMultiplier', () => {
  it('scales inversely with time, rounded to a quarter', () => {
    const projections = projectAll([
      row(3, 0, 0, 1),
      row(8, xpToReachLevel(MAX_LEVEL) / 2, 6 * 3600, 1),
      row(3, 0, 0, 2),
      row(8, xpToReachLevel(MAX_LEVEL) / 2, 6 * 3600, 2),
    ]);
    // Twelve hours at x1, so x2 for six.
    expect(recommendMultiplier(projections, 1, 6)).toEqual({ medianHours: 12, multiplier: 2 });
    expect(recommendMultiplier(projections, 1.5, 6)?.multiplier).toBe(3);
  });

  it('is null without data', () => {
    expect(recommendMultiplier([], 1, 6)).toBeNull();
  });
});
