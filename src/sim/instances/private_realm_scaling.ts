// Private-realm enemy scaling for a standard five-player dungeon run by a raid
// group larger than a party (src/sim/private_realm.ts). Runs every tick from
// updateInstances, AFTER the encounter ticks, and stamps each not-yet-scaled
// mob in a qualifying claim's mobIds once: the spawn list at claim time, trash
// kit raises, boss add waves and encounter-script summons all register there,
// so one pass covers every spawn path without touching any of them.
//
// Draws no rng and reorders nothing. A stock world (ctx.cfg.privateRealm null)
// returns on the first line, so the parity trace is untouched.

import {
  type PrivateRealmGroupScale,
  type PrivateRealmRules,
  privateRealmGroupScale,
} from '../private_realm';
import type { InstanceSlot } from '../sim';
import type { SimContext } from '../sim_context';
import { PARTY_MAX } from '../social/party';
import type { Entity } from '../types';

/** The scale a claim's enemies get right now, or null for stock tuning.
 *  isRaidDungeon names the raid rooms, which always keep their own tuning. */
export function claimGroupScale(
  ctx: SimContext,
  rules: PrivateRealmRules | null,
  inst: InstanceSlot,
  isRaidDungeon: (dungeonId: string) => boolean,
): PrivateRealmGroupScale | null {
  if (!rules || inst.partyKey === null || !inst.partyKey.startsWith('party:')) return null;
  for (const pid of inst.enteredBy) {
    const party = ctx.partyOf(pid);
    if (!party || `party:${party.id}` !== inst.partyKey) continue;
    return privateRealmGroupScale(
      rules,
      party.raid,
      party.members.length,
      PARTY_MAX,
      isRaidDungeon(inst.dungeonId),
    );
  }
  return null;
}

/** Scale one mob's health, melee, mechanic, ranged and heal numbers. Health
 *  keeps its current fraction so a mob stamped mid-fight is not refilled. */
export function applyPrivateRealmMobScale(mob: Entity, scale: PrivateRealmGroupScale): void {
  if (mob.privateRealmScaled) return;
  mob.privateRealmScaled = true;
  const hpFrac = mob.maxHp > 0 ? mob.hp / mob.maxHp : 1;
  mob.maxHp = Math.max(1, Math.round(mob.maxHp * scale.hp));
  mob.hp = Math.max(mob.hp > 0 ? 1 : 0, Math.round(mob.maxHp * hpFrac));
  if (mob.damageFloorHp !== undefined) {
    mob.damageFloorHp = Math.ceil(mob.damageFloorHp * scale.hp);
  }
  mob.weapon = {
    ...mob.weapon,
    min: Math.round(mob.weapon.min * scale.dmg),
    max: Math.round(mob.weapon.max * scale.dmg),
  };
  mob.mechanicDamageMult = (mob.mechanicDamageMult ?? 1) * scale.dmg;
  mob.rangedDamageMult = (mob.rangedDamageMult ?? 1) * scale.dmg;
  mob.mechanicBurnDamageMult = (mob.mechanicBurnDamageMult ?? 1) * scale.dmg;
  mob.mechanicHealMult = (mob.mechanicHealMult ?? 1) * scale.hp;
}

export function tickPrivateRealmScaling(
  ctx: SimContext,
  isRaidDungeon: (dungeonId: string) => boolean,
): void {
  const rules = ctx.cfg.privateRealm;
  if (!rules) return;
  for (const inst of ctx.instances) {
    const scale = claimGroupScale(ctx, rules, inst, isRaidDungeon);
    if (!scale) continue;
    for (const id of inst.mobIds) {
      const mob = ctx.entities.get(id);
      if (mob && mob.kind === 'mob' && !mob.dead) applyPrivateRealmMobScale(mob, scale);
    }
  }
}
