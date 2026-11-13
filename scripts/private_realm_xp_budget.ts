// Private-realm XP budget: how much of the 1 to 20 curve the authored quests
// cover, bucketed by each quest's accept level. A calibration input for the
// PRIVATE_REALM_*_XP multipliers (src/sim/private_realm.ts), not a balance
// source: kill XP, delves and dungeons fill the rest of the curve in play,
// and the live pace log ("private realm pace") is the measured answer.
//
// npx tsx scripts/private_realm_xp_budget.ts

import { QUESTS } from '../src/sim/data';
import { MAX_LEVEL, xpForLevel } from '../src/sim/types';

const curveTotal = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => xpForLevel(i + 1)).reduce(
  (a, b) => a + b,
  0,
);

const byLevel = new Map<number, { count: number; xp: number }>();
let open = 0;
let classLocked = 0;
for (const q of Object.values(QUESTS)) {
  if (q.retired || q.xpReward <= 0) continue;
  if (q.requiredClass && q.requiredClass.length > 0) {
    classLocked += q.xpReward;
    continue;
  }
  const level = Math.max(1, Math.min(MAX_LEVEL, q.minLevel ?? 1));
  const row = byLevel.get(level) ?? { count: 0, xp: 0 };
  row.count++;
  row.xp += q.xpReward;
  byLevel.set(level, row);
  open += q.xpReward;
}

console.log(`XP to reach level ${MAX_LEVEL}: ${curveTotal}`);
console.log(
  `Open (non class-locked) quest XP: ${open} (${((open / curveTotal) * 100).toFixed(1)}%)`,
);
console.log(`Class-locked quest XP (all classes summed): ${classLocked}`);
console.log('');
console.log('accept level | quests | quest xp | xp to next level');
for (let level = 1; level <= MAX_LEVEL; level++) {
  const row = byLevel.get(level) ?? { count: 0, xp: 0 };
  const need = level < MAX_LEVEL ? xpForLevel(level) : 0;
  console.log(
    `${String(level).padStart(12)} | ${String(row.count).padStart(6)} | ${String(row.xp).padStart(8)} | ${need}`,
  );
}
