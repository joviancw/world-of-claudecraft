// Private-realm leveling rules: the XP multipliers (src/sim/private_realm.ts)
// applied inside grantXp, the env parser that turns PRIVATE_REALM=1 into a
// rules object (server/private_realm_config.ts), and the default-off contract
// (no rules: XP is untouched).
import { describe, expect, it } from 'vitest';
import { privateRealmRulesFromEnv } from '../server/private_realm_config';
import {
  PRIVATE_REALM_DEFAULTS,
  privateRealmXpAmount,
  resolvePrivateRealmRules,
} from '../src/sim/private_realm';
import { Sim } from '../src/sim/sim';
import { xpForLevel } from '../src/sim/types';

function sim(privateRealm: ReturnType<typeof resolvePrivateRealmRules> | null = null): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', privateRealm });
}

function primaryMeta(s: Sim) {
  const meta = s.players.get(s.player.id);
  if (!meta) throw new Error('expected the primary player meta');
  return meta;
}

describe('privateRealmXpAmount', () => {
  it('returns the amount untouched without rules', () => {
    expect(privateRealmXpAmount(null, 123, true)).toBe(123);
    expect(privateRealmXpAmount(null, 123, false)).toBe(123);
  });

  it('scales kill and non-kill XP independently, flooring', () => {
    const rules = resolvePrivateRealmRules({
      leveling: { killXpMultiplier: 2.5, questXpMultiplier: 1.5 },
    });
    expect(privateRealmXpAmount(rules, 101, true)).toBe(252);
    expect(privateRealmXpAmount(rules, 101, false)).toBe(151);
  });
});

describe('grantXp on a private realm', () => {
  it('a stock world grants the raw amount', () => {
    const s = sim();
    s.grantXp(100);
    expect(s.xp).toBe(100);
  });

  it('applies the quest multiplier to a non-kill award', () => {
    const s = sim(resolvePrivateRealmRules({ leveling: { questXpMultiplier: 3 } }));
    s.grantXp(100);
    expect(s.xp).toBe(300);
  });

  it('applies the kill multiplier to a kill award before rested', () => {
    const s = sim(resolvePrivateRealmRules({ leveling: { killXpMultiplier: 2 } }));
    const meta = primaryMeta(s);
    meta.restedXp = 0;
    s.grantXp(50, meta, { fromKill: true });
    expect(s.xp).toBe(100);
  });

  it('doubles kill XP with alwaysRestedKills even when the pool is empty', () => {
    const s = sim(
      resolvePrivateRealmRules({ leveling: { alwaysRestedKills: true } }),
    );
    const meta = primaryMeta(s);
    meta.restedXp = 0;
    s.grantXp(40, meta, { fromKill: true });
    expect(s.xp).toBe(80);
    expect(meta.restedXp).toBe(0);
  });

  it('levels through the normal level-up path, never by setting the level', () => {
    const s = sim(resolvePrivateRealmRules({ leveling: { questXpMultiplier: 2 } }));
    s.grantXp(xpForLevel(1));
    expect(s.player.level).toBe(2);
    expect(primaryMeta(s).counters.levelUps).toBe(1);
  });
});

describe('privateRealmRulesFromEnv', () => {
  it('is null unless PRIVATE_REALM=1', () => {
    expect(privateRealmRulesFromEnv({})).toBeNull();
    expect(privateRealmRulesFromEnv({ PRIVATE_REALM: '0' })).toBeNull();
  });

  it('defaults every knob when only the switch is set', () => {
    const rules = privateRealmRulesFromEnv({ PRIVATE_REALM: '1' });
    expect(rules).toEqual(resolvePrivateRealmRules());
    expect(rules?.dungeons).toEqual(PRIVATE_REALM_DEFAULTS.dungeons);
  });

  it('enables always rested accrual when PRIVATE_REALM_ALWAYS_RESTED=1', () => {
    expect(
      privateRealmRulesFromEnv({ PRIVATE_REALM: '1' })?.leveling.alwaysRestedAccrual,
    ).toBe(false);
    const rules = privateRealmRulesFromEnv({
      PRIVATE_REALM: '1',
      PRIVATE_REALM_ALWAYS_RESTED: '1',
    });
    expect(rules?.leveling.alwaysRestedAccrual).toBe(true);
    expect(rules?.leveling.alwaysRestedKills).toBe(true);
  });

  it('reads numeric overrides and ignores malformed ones with a warning', () => {
    const warnings: string[] = [];
    const rules = privateRealmRulesFromEnv(
      {
        PRIVATE_REALM: '1',
        PRIVATE_REALM_KILL_XP: '1.75',
        PRIVATE_REALM_QUEST_XP: 'lots',
        PRIVATE_REALM_DUNGEON_PLAYERS: '7.5',
        PRIVATE_REALM_DUNGEON_HP: '2',
      },
      (msg) => warnings.push(msg),
    );
    expect(rules?.leveling.killXpMultiplier).toBe(1.75);
    expect(rules?.leveling.questXpMultiplier).toBe(1);
    expect(rules?.dungeons.targetPlayers).toBe(9);
    expect(rules?.dungeons.healthMultiplier).toBe(2);
    expect(warnings).toHaveLength(2);
  });
});
