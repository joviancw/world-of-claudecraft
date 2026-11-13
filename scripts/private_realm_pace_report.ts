// Private-realm XP calibration report. Feed it the server log from a real
// session (the "private realm pace" lines) and the multiplier that session
// ran with; it prints each character's projected played time to the cap and
// the multiplier that would land the median on the target.
//
//   npx tsx scripts/private_realm_pace_report.ts server.log --current 1 --target 6
//
// Set both PRIVATE_REALM_KILL_XP and PRIVATE_REALM_QUEST_XP to the result.
// One short session is a rough read: early levels are quest-heavy and quick,
// so re-run after the group has played a few hours.
import { readFileSync } from 'node:fs';
import {
  parsePaceLines,
  projectAll,
  recommendMultiplier,
} from '../server/private_realm_pace_report';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('usage: private_realm_pace_report.ts <server.log> [--current 1] [--target 6]');
  process.exit(2);
}
const current = arg('current', 1);
const target = arg('target', 6);
const projections = projectAll(parsePaceLines(readFileSync(file, 'utf8')));
if (projections.length === 0) {
  console.log('No character has two pace samples yet: play longer, then re-run.');
  process.exit(0);
}
for (const p of projections) {
  console.log(
    `${(p.characterName ?? `#${p.characterId}`).padEnd(14)} level ${String(p.level).padStart(2)}  played ${p.playedHours.toFixed(1)} h  projected ${p.projectedHours.toFixed(1)} h to the cap`,
  );
}
const rec = recommendMultiplier(projections, current, target);
if (rec) {
  console.log(
    `\nMedian projection ${rec.medianHours.toFixed(1)} h at x${current}. For ${target} h, set the XP multipliers to x${rec.multiplier}.`,
  );
}
