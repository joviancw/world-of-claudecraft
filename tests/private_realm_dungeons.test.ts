// Private-realm eight-player dungeons: a raid group of up to eight level-20
// players may walk into a standard five-player dungeon together, shares one
// claim, and fights enemies scaled by the private-realm multipliers
// (src/sim/private_realm.ts, instances/private_realm_scaling.ts). A stock
// world keeps the "Raid groups cannot enter standard dungeons." gate, and a
// normal five-player party is never scaled. Driven through a real Sim and the
// real enterDungeon door.
import { describe, expect, it } from 'vitest';
import { enterDungeon, instanceKeyFor } from '../src/sim/instances/dungeons';
import {
  applyPrivateRealmMobScale,
  claimGroupScale,
} from '../src/sim/instances/private_realm_scaling';
import { type PrivateRealmRules, resolvePrivateRealmRules } from '../src/sim/private_realm';
import { type InstanceSlot, Sim } from '../src/sim/sim';
import { type Entity, xpToReachLevel } from '../src/sim/types';

const DUNGEON = 'hollow_crypt';
const RAID_DENIED = 'Raid groups cannot enter standard dungeons.';

function makeSim(privateRealm: PrivateRealmRules | null): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, privateRealm });
}

function addLeveled(sim: Sim, name: string, level = 20): number {
  const pid = sim.addPlayer('warrior', name);
  const meta = sim.players.get(pid)!;
  if (level > 1) sim.grantXp(xpToReachLevel(level), meta);
  expect(sim.entities.get(pid)?.level).toBe(level);
  return pid;
}

// A raid of `size` (converted at five, then topped up), or a plain party
// when size <= 5 and raid is false.
function group(sim: Sim, prefix: string, size: number, raid: boolean, levels: number[] = []) {
  const pids = Array.from({ length: size }, (_, i) =>
    addLeveled(sim, `${prefix}${i}`, levels[i] ?? 20),
  );
  const [lead] = pids;
  for (const pid of pids.slice(1, 5)) {
    sim.partyInvite(pid, lead);
    sim.partyAccept(pid);
  }
  if (raid) sim.convertPartyToRaid(lead);
  for (const pid of pids.slice(5)) {
    sim.partyInvite(pid, lead);
    sim.partyAccept(pid);
  }
  expect(sim.ctx.partyOf(lead)?.members.length).toBe(size);
  expect(sim.ctx.partyOf(lead)?.raid ?? false).toBe(raid);
  return pids;
}

function captureErrors(sim: Sim): string[] {
  const errors: string[] = [];
  const restore = sim.ctx.error;
  sim.ctx.error = (pid: number, text: string) => {
    errors.push(text);
    restore(pid, text);
  };
  return errors;
}

function claimOf(sim: Sim, lead: number): InstanceSlot {
  const key = instanceKeyFor(sim.ctx, lead);
  const claim = sim.instances.find((i) => i.dungeonId === DUNGEON && i.partyKey === key);
  if (!claim) throw new Error(`no ${DUNGEON} claim for ${key}`);
  return claim;
}

function mobsOf(sim: Sim, claim: InstanceSlot): Entity[] {
  return claim.mobIds
    .map((id) => sim.entities.get(id))
    .filter((m): m is Entity => m !== undefined && m.kind === 'mob');
}

describe('eight-player raid admission', () => {
  it('a stock world still refuses a raid group at a five-player dungeon door', () => {
    const sim = makeSim(null);
    const pids = group(sim, 'R', 8, true);
    const errors = captureErrors(sim);
    expect(enterDungeon(sim.ctx, DUNGEON, pids[0])).toBe(false);
    expect(errors).toContain(RAID_DENIED);
  });

  it('a private realm admits eight level-20 raiders into ONE shared claim', () => {
    const sim = makeSim(resolvePrivateRealmRules());
    const pids = group(sim, 'R', 8, true);
    for (const pid of pids) expect(enterDungeon(sim.ctx, DUNGEON, pid)).toBe(true);
    const claim = claimOf(sim, pids[0]);
    expect(sim.instances.filter((i) => i.partyKey === claim.partyKey)).toHaveLength(1);
    expect([...claim.enteredBy].sort()).toEqual([...pids].sort());
    for (const pid of pids) {
      expect(sim.instanceInfoAt(sim.entities.get(pid)!.pos)?.dungeonId).toBe(DUNGEON);
    }
  });

  it('refuses a raid with a member below the endgame level', () => {
    const sim = makeSim(resolvePrivateRealmRules());
    const pids = group(sim, 'R', 8, true, [20, 20, 20, 20, 20, 20, 20, 19]);
    const errors = captureErrors(sim);
    expect(enterDungeon(sim.ctx, DUNGEON, pids[0])).toBe(false);
    expect(errors).toContain(RAID_DENIED);
  });

  it('refuses a raid larger than the private-realm target', () => {
    const sim = makeSim(resolvePrivateRealmRules());
    const pids = group(sim, 'R', 9, true);
    expect(enterDungeon(sim.ctx, DUNGEON, pids[0])).toBe(false);
  });
});

describe('eight-player enemy scaling', () => {
  it('scales a raid claim by the configured multipliers and leaves a party claim alone', () => {
    const rules = resolvePrivateRealmRules({
      dungeons: { healthMultiplier: 1.5, damageMultiplier: 1.2 },
    });
    const sim = makeSim(rules);
    const raid = group(sim, 'R', 8, true);
    const party = group(sim, 'P', 5, false);
    for (const lead of [raid[0], party[0]]) sim.setDungeonDifficulty('heroic', lead);
    for (const pid of [...raid, ...party]) expect(enterDungeon(sim.ctx, DUNGEON, pid)).toBe(true);
    sim.tick();

    const raidMobs = mobsOf(sim, claimOf(sim, raid[0]));
    const partyMobs = mobsOf(sim, claimOf(sim, party[0]));
    expect(raidMobs.length).toBeGreaterThan(0);
    expect(raidMobs.every((m) => m.privateRealmScaled === true)).toBe(true);
    expect(partyMobs.some((m) => m.privateRealmScaled)).toBe(false);

    // Heroic fixes every spawn's level, so the same template pairs up exactly.
    const byTemplate = new Map(partyMobs.map((m) => [m.templateId, m]));
    let compared = 0;
    for (const mob of raidMobs) {
      const twin = byTemplate.get(mob.templateId);
      if (!twin || twin.level !== mob.level) continue;
      expect(mob.maxHp).toBe(Math.round(twin.maxHp * 1.5));
      expect(mob.weapon.max).toBe(Math.round(twin.weapon.max * 1.2));
      expect(mob.mechanicDamageMult).toBeCloseTo((twin.mechanicDamageMult ?? 1) * 1.2);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('never stacks the scale on repeated ticks', () => {
    const sim = makeSim(resolvePrivateRealmRules());
    const raid = group(sim, 'R', 8, true);
    for (const pid of raid) enterDungeon(sim.ctx, DUNGEON, pid);
    sim.tick();
    const before = mobsOf(sim, claimOf(sim, raid[0])).map((m) => m.maxHp);
    for (let i = 0; i < 5; i++) sim.tick();
    const after = mobsOf(sim, claimOf(sim, raid[0])).map((m) => m.maxHp);
    expect(after).toEqual(before);
  });

  it('keeps raid rooms and stock worlds at their own tuning', () => {
    const sim = makeSim(resolvePrivateRealmRules());
    const raid = group(sim, 'R', 8, true);
    for (const pid of raid) enterDungeon(sim.ctx, DUNGEON, pid);
    const claim = claimOf(sim, raid[0]);
    expect(claimGroupScale(sim.ctx, sim.cfg.privateRealm, claim, () => false)).not.toBeNull();
    expect(claimGroupScale(sim.ctx, sim.cfg.privateRealm, claim, () => true)).toBeNull();
    expect(claimGroupScale(sim.ctx, null, claim, () => false)).toBeNull();
  });

  it('keeps a mid-fight health fraction when a mob is stamped', () => {
    const mob = { maxHp: 1000, hp: 400, weapon: { min: 10, max: 20 } } as unknown as Entity;
    applyPrivateRealmMobScale(mob, { hp: 1.5, dmg: 1.15 });
    expect(mob.maxHp).toBe(1500);
    expect(mob.hp).toBe(600);
    expect(mob.weapon).toMatchObject({ min: 12, max: 23 });
  });
});
