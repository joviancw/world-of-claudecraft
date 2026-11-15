// Private-realm rules: the one knob set for a small invite-only realm (nine
// friends levelling 1 to 20, then running the five-player dungeons and the
// raids as one nine-player raid group). A pure leaf: no SimContext, no rng,
// no clock. The host passes a resolved rules object through
// SimConfig.privateRealm; null (the default everywhere) means every rule
// below is inert and the world is byte-identical to a stock realm.

export interface PrivateRealmLevelingRules {
  // Scales XP from mob kills (applied before the rested bonus, so rested
  // still doubles the scaled award while the pool lasts).
  killXpMultiplier: number;
  // Scales every other XP award: quests, world quests, delves, crafting and
  // gathering (every grantXp call that is not a kill).
  questXpMultiplier: number;
  // Accrue rested XP anywhere while out of combat, not only inside inn footprints.
  alwaysRestedAccrual: boolean;
  // Kill XP always earns the classic rested bonus (2x) without drawing the pool.
  alwaysRestedKills: boolean;
}

export interface PrivateRealmDungeonRules {
  // Largest raid group admitted into a standard five-player dungeon.
  targetPlayers: number;
  // Every raid member must be at least this level to bring a raid group into
  // a standard five-player dungeon (normal parties keep the stock rules).
  minimumLevel: number;
  // Enemy health and damage multipliers for a five-player dungeon claimed by
  // a raid group larger than a party. Starting assumptions, tuned in play.
  healthMultiplier: number;
  damageMultiplier: number;
}

export interface PrivateRealmAchievementRules {
  customAwardsEnabled: boolean;
  globalAnnouncements: boolean;
  maxTitleLength: number;
  maxDescriptionLength: number;
  // Most custom awards one character may grant per rolling day.
  dailyAwardCap: number;
  // Award templates one character may keep in the Book of Deeds.
  maxTemplatesPerOwner: number;
}

export interface PrivateRealmRules {
  leveling: PrivateRealmLevelingRules;
  dungeons: PrivateRealmDungeonRules;
  achievements: PrivateRealmAchievementRules;
  // When false, trusted membership activation and claim commands never mint
  // adaptive membership armour or the membership weapon (slots and bank stay on).
  membershipGearClaims: boolean;
}

export const PRIVATE_REALM_DEFAULTS: Readonly<PrivateRealmRules> = Object.freeze({
  leveling: Object.freeze({
    killXpMultiplier: 1,
    questXpMultiplier: 1,
    alwaysRestedAccrual: false,
    alwaysRestedKills: false,
  }),
  dungeons: Object.freeze({
    targetPlayers: 9,
    minimumLevel: 20,
    healthMultiplier: 1.5,
    damageMultiplier: 1.15,
  }),
  achievements: Object.freeze({
    customAwardsEnabled: true,
    globalAnnouncements: true,
    maxTitleLength: 40,
    maxDescriptionLength: 160,
    dailyAwardCap: 10,
    maxTemplatesPerOwner: 50,
  }),
  membershipGearClaims: false,
});

export interface PrivateRealmOverrides {
  leveling?: Partial<PrivateRealmLevelingRules>;
  dungeons?: Partial<PrivateRealmDungeonRules>;
  achievements?: Partial<PrivateRealmAchievementRules>;
  membershipGearClaims?: boolean;
}

export function resolvePrivateRealmRules(overrides: PrivateRealmOverrides = {}): PrivateRealmRules {
  return {
    leveling: { ...PRIVATE_REALM_DEFAULTS.leveling, ...overrides.leveling },
    dungeons: { ...PRIVATE_REALM_DEFAULTS.dungeons, ...overrides.dungeons },
    achievements: { ...PRIVATE_REALM_DEFAULTS.achievements, ...overrides.achievements },
    membershipGearClaims:
      overrides.membershipGearClaims ?? PRIVATE_REALM_DEFAULTS.membershipGearClaims,
  };
}

/** Stock realms and offline sims keep membership gear claims; private realms default off. */
export function privateRealmMembershipGearClaimsEnabled(
  rules: PrivateRealmRules | null | undefined,
): boolean {
  return rules ? rules.membershipGearClaims : true;
}

export function privateRealmAlwaysRestedKills(
  rules: PrivateRealmRules | null | undefined,
): boolean {
  return rules?.leveling.alwaysRestedKills === true;
}

// The scaled XP award, floored like every other XP multiplier in grantXp.
// A null rules object returns the amount untouched.
export function privateRealmXpAmount(
  rules: PrivateRealmRules | null,
  amount: number,
  fromKill: boolean,
): number {
  if (!rules) return amount;
  const mult = fromKill ? rules.leveling.killXpMultiplier : rules.leveling.questXpMultiplier;
  if (mult === 1) return amount;
  return Math.max(0, Math.floor(amount * mult));
}

// May this raid group walk into a standard (non-raid) dungeon? Only on a
// private realm, only up to targetPlayers, and only when everyone has reached
// the endgame level.
export function privateRealmRaidAdmits(
  rules: PrivateRealmRules | null,
  memberLevels: readonly number[],
): boolean {
  if (!rules) return false;
  if (memberLevels.length > rules.dungeons.targetPlayers) return false;
  return memberLevels.every((level) => level >= rules.dungeons.minimumLevel);
}

export interface PrivateRealmGroupScale {
  hp: number;
  dmg: number;
}

// The enemy scale a standard five-player dungeon claim gets. Only a raid
// group larger than a party scales; a normal party, a solo player, and every
// raid-room claim stay at the stock tuning (null).
export function privateRealmGroupScale(
  rules: PrivateRealmRules | null,
  isRaidGroup: boolean,
  memberCount: number,
  partyMax: number,
  raidDungeon: boolean,
): PrivateRealmGroupScale | null {
  if (!rules || !isRaidGroup || raidDungeon || memberCount <= partyMax) return null;
  return { hp: rules.dungeons.healthMultiplier, dmg: rules.dungeons.damageMultiplier };
}
