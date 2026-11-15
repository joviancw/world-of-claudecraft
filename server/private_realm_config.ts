// Boot-time private-realm rules from the environment (src/sim/private_realm.ts).
// PRIVATE_REALM=1 switches the rule set on; every other key is an optional
// numeric override of one default. Anything malformed falls back to the
// default with a boot warning, so a typo never takes the realm down.

import {
  type PrivateRealmOverrides,
  type PrivateRealmRules,
  resolvePrivateRealmRules,
} from '../src/sim/private_realm';

type Env = Readonly<Record<string, string | undefined>>;

function positiveNumber(env: Env, key: string, warn: (msg: string) => void): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    warn(`[private-realm] ignoring ${key}=${raw}: expected a positive number`);
    return undefined;
  }
  return n;
}

function envFlagOn(env: Env, key: string): boolean {
  return env[key] === '1';
}

function positiveInt(env: Env, key: string, warn: (msg: string) => void): number | undefined {
  const n = positiveNumber(env, key, warn);
  if (n === undefined) return undefined;
  if (!Number.isInteger(n)) {
    warn(`[private-realm] ignoring ${key}=${env[key]}: expected a whole number`);
    return undefined;
  }
  return n;
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function privateRealmRulesFromEnv(
  env: Env = process.env,
  warn: (msg: string) => void = console.warn,
): PrivateRealmRules | null {
  if (env.PRIVATE_REALM !== '1') return null;
  const overrides: PrivateRealmOverrides = {
    leveling: defined({
      killXpMultiplier: positiveNumber(env, 'PRIVATE_REALM_KILL_XP', warn),
      questXpMultiplier: positiveNumber(env, 'PRIVATE_REALM_QUEST_XP', warn),
      ...(envFlagOn(env, 'PRIVATE_REALM_ALWAYS_RESTED')
        ? { alwaysRestedAccrual: true as const, alwaysRestedKills: true as const }
        : {}),
    }),
    dungeons: defined({
      targetPlayers: positiveInt(env, 'PRIVATE_REALM_DUNGEON_PLAYERS', warn),
      minimumLevel: positiveInt(env, 'PRIVATE_REALM_DUNGEON_MIN_LEVEL', warn),
      healthMultiplier: positiveNumber(env, 'PRIVATE_REALM_DUNGEON_HP', warn),
      damageMultiplier: positiveNumber(env, 'PRIVATE_REALM_DUNGEON_DMG', warn),
    }),
    achievements: defined({
      dailyAwardCap: positiveInt(env, 'PRIVATE_REALM_AWARD_DAILY_CAP', warn),
    }),
  };
  if (envFlagOn(env, 'PRIVATE_REALM_MEMBERSHIP_GEAR')) {
    overrides.membershipGearClaims = true;
  }
  return resolvePrivateRealmRules(overrides);
}

// The one resolved copy for this realm process, read on first use (after the
// server has loaded .env), never at module evaluation.
let resolved: { rules: PrivateRealmRules | null } | null = null;
export function privateRealmRules(): PrivateRealmRules | null {
  resolved ??= { rules: privateRealmRulesFromEnv() };
  return resolved.rules;
}

/** False when PRIVATE_REALM_MEMBERSHIP=0 on an otherwise private realm. */
export function privateRealmMembershipFromEnv(env: Env = process.env): boolean {
  if (env.PRIVATE_REALM !== '1') return false;
  return env.PRIVATE_REALM_MEMBERSHIP !== '0';
}

/** Advertised on GET /api/status when PRIVATE_REALM=1; stock realms omit this arm. */
export function privateRealmMembershipGearAdvert(): boolean {
  return privateRealmRules()?.membershipGearClaims === true;
}
