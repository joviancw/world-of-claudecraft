# Private Realm Progress

Running status of the private eight-player realm fork. Branch:
`feature/private-realm` (worktree `../woc-private-realm`), cut from `main`
(which carries the v0.45.8 release merge).

Every rule is behind `PRIVATE_REALM=1` (server env). Unset, the realm is
byte-identical to stock: the rules object is `null` and every hook is inert.

## Configuration

One rules object, `PrivateRealmRules` in `src/sim/private_realm.ts`
(defaults in `PRIVATE_REALM_DEFAULTS`). The server resolves it once from env in
`server/private_realm_config.ts` and hands it to the Sim as
`SimConfig.privateRealm` (read in the sim as `ctx.cfg.privateRealm`).

| Env key | Default | Meaning |
|---|---|---|
| `PRIVATE_REALM` | unset | `1` enables the rule set |
| `PRIVATE_REALM_KILL_XP` | 1 | kill XP multiplier |
| `PRIVATE_REALM_QUEST_XP` | 1 | every non-kill XP award (quests, world quests, delves, crafting, gathering) |
| `PRIVATE_REALM_DUNGEON_PLAYERS` | 8 | largest raid group admitted to a five-player dungeon |
| `PRIVATE_REALM_DUNGEON_MIN_LEVEL` | 20 | every raid member must be this level to enter a five-player dungeon as a raid |
| `PRIVATE_REALM_DUNGEON_HP` | 1.5 | enemy health multiplier for a raid-claimed five-player dungeon |
| `PRIVATE_REALM_DUNGEON_DMG` | 1.15 | enemy damage multiplier for the same |
| `PRIVATE_REALM_AWARD_DAILY_CAP` | 10 | custom awards one character may create per rolling day |

`maxLevel` from the original proposal is not a knob: `MAX_LEVEL` is already 20
in `src/sim/types.ts`.

## Local environment (M0)

- Node 26.13.1 (Homebrew), pnpm 10.34.5.
- Postgres 16.16 (Homebrew `postgresql@16`, `brew services`), port 5433, role
  and database `eastbrook`, password `change-me` (matches `.env.example`).
- `.env` (gitignored) adds `ALLOW_DEV_COMMANDS=1` and `PRIVATE_REALM=1` for
  local testing only. Never set `ALLOW_DEV_COMMANDS` on the friends' server.
- `npm run server` boots cleanly against the local database
  (`database ready`, listening on :8787).
- Baseline: `npx tsc --noEmit` clean on the untouched branch.

## Leveling (M1)

- XP multipliers applied at the top of `grantXp` (`src/sim/combat/damage.ts`),
  before world-PvP, rested, and membership bonuses, so rested still doubles the
  scaled kill award. Levels only ever move through the normal level-up loop.
- Pace telemetry: on a private realm every level-up logs a
  `"private realm pace"` line (`server/private_realm_pace.ts`, called from
  `server/event_record_observers.ts`) with character id and name, level,
  lifetime XP, played seconds, and quests completed. Per-level wall-clock
  timestamps already land in the existing `level_up_events` table.
- Static budget (`npx tsx scripts/private_realm_xp_budget.ts`):
  - XP to reach level 20: 167,200.
  - Open (non class-locked) quest XP: 634,070, about 3.8x the curve. Most
    quests carry no `minLevel` and are gated by chains and zones instead.
  - So XP is not scarce: the six-hour target depends on how much of the
    quest content players do. Calibrate the multiplier from the pace log of a
    real session rather than from this sum.
- Ability unlocks (`abilitiesKnownAt`) and talent rows (`ROW_LEVELS`) key on
  level only, so the multiplier cannot skip them. Quest prerequisites and
  level gates are untouched.
- Known cosmetic gap: quest windows show the authored `xpReward`, not the
  multiplied award.

## Eight-player dungeons (M2)

- Admission: `enterDungeon` (`src/sim/instances/dungeons.ts`) keeps its
  "Raid groups cannot enter standard dungeons." gate, except when
  `privateRealmRaidAdmits` passes: private realm on, at most `targetPlayers`
  members, every member at least `minimumLevel`. Raids already enter the
  ten-player raid rooms, so those need no change. Five-player parties and
  leveling groups keep every stock rule.
- Form the group by converting a full party of five to a raid, then invite up
  to three more (raid subgroups hold five each, so eight is groups 1 and 2).
- Shared instance: the claim key is `party:<id>`, so all eight join one claim.
- Scaling: `tickPrivateRealmScaling` (`src/sim/instances/private_realm_scaling.ts`)
  runs every tick from `updateInstances`, after the encounter ticks. For each
  claim whose owning party is a raid larger than a party in a non-raid dungeon,
  it stamps each mob in `mobIds` once (`Entity.privateRealmScaled`): max and
  current health (fraction kept), the damage floor, melee weapon damage, and
  the mechanic, ranged, burn and heal multipliers. Every spawn path registers
  in `mobIds`, so trash, boss adds and encounter summons are all covered. No
  rng draws; a stock world returns immediately.
- Decision: scale follows the live roster rather than freezing at claim time,
  so a raid that grows past five mid-run scales its remaining mobs on the next
  tick. A mob is never scaled twice, and never un-scaled if the raid shrinks.
- The quoted denial text is unchanged, so no new i18n strings were needed.

## Test log

| Date | Command | Result |
|---|---|---|
| 2026-11-12 | `npx tsc --noEmit` (baseline) | pass |
| 2026-11-12 | `npx vitest run tests/private_realm_xp.test.ts tests/server/private_realm_pace.test.ts tests/xp.test.ts tests/progression_xp.test.ts tests/rested_xp.test.ts tests/server/craft_roll_events.test.ts tests/server/item_ledger.test.ts tests/monolith_budget.test.ts tests/architecture.test.ts` | 225 passed |
| 2026-11-12 | `npx vitest run tests/private_realm_dungeons.test.ts tests/private_realm_xp.test.ts` | 17 passed |
| 2026-11-12 | `npx vitest run tests/dungeons.test.ts tests/raid_return.test.ts tests/party_machine.test.ts tests/gravewyrm_normal_tuning.test.ts tests/trash_engine.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts tests/localization_fixes.test.ts tests/parity` | 599 passed; 1 timeout (heroic loot seed sweep, passes alone in 34 s) and the i18n guard needing `npm run i18n:gen` first (passes after) |

## Outstanding

- M3 eight-bot end-to-end script.
- M4 all dungeons, Heroic, the raid.
- M5 to M7 custom awards, Book of Deeds view, titles.
- M8 calibration and deploy.
