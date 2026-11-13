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

## Eight-bot end to end (M3)

- Script: `npx tsx scripts/private_realm_raid8.ts` against a local server with
  `PRIVATE_REALM=1 ALLOW_DEV_COMMANDS=1` (dev only). Env: `DUNGEON`,
  `DIFFICULTY` (`normal` / `heroic`), `BOSS=0` to skip the boss phase,
  `ROUTE=full` to sweep every spawn, `REQUIRE_BOSS=1` to make the boss kill a
  check, `DEBUG=1` for traces.
- It registers 13 bots, gears them at level 20, forms an eight-player raid and a
  separate five-player control party, enters both, then checks: one shared
  instance for the eight, a different instance for the control, enemy health
  ratio raid over party, kills seen by every raider, priest heals landing,
  stepping outside and rejoining the same instance, and a boss phase.
- Local runs need `MAX_WS_PER_IP_HARD=400` on the dev server (13 bots on one IP,
  and reconnect churn holds linkdead sessions against the per-IP cap). Never set
  it on the friends' server.
- hollow_crypt normal: 14 passed, 0 failed. Health ratio 1.50. Trash: 3 kills,
  no deaths, 3 heals. Boss: the scripted bots wiped with Morthen at 65% (7
  raider deaths, 31 heals over 159 s). The bots do not play their rotations, so
  boss DPS is far below real players; the boss kill is NOT verified by script
  and needs a human playtest.

## Player-awarded achievements (M5, M6)

- Command: `/award <name> "<title>" [description]` in chat. Title at most 40
  characters, description at most 160. Server-side only
  (`server/custom_awards.ts`): the giver is the session's own character, never
  a client claim; awarding any character on your own account is refused; a 1 s
  per-session limit, one in-flight award per account, the realm word filter,
  and a rolling daily cap (`PRIVATE_REALM_AWARD_DAILY_CAP`).
- Storage: table `custom_awards` (`server/custom_awards_db.ts`), unique on
  recipient plus lowercased title, so duplicates are refused in the same
  statement that enforces the cap. Parameterized SQL throughout.
- Announcement: `ACHIEVEMENT UNLOCKED! X has earned "Y"! Awarded by Z.` to the
  whole realm, with an achievement sound and banner. `[[`/`]]` are collapsed so
  player text cannot forge item links.
- Book of Deeds: an "Awarded by Friends" section (Titles tab) lists the self
  character's awards with Hide/Show and a two-press Reject
  (`src/ui/custom_awards_section.ts`, REST in `server/custom_awards_routes.ts`).
  The routes check account ownership of the named character on every call; a
  stock realm answers `enabled: false` and the section never shows.

## Test log

| Date | Command | Result |
|---|---|---|
| 2026-11-12 | `npx tsc --noEmit` (baseline) | pass |
| 2026-11-12 | `npx vitest run tests/private_realm_xp.test.ts tests/server/private_realm_pace.test.ts tests/xp.test.ts tests/progression_xp.test.ts tests/rested_xp.test.ts tests/server/craft_roll_events.test.ts tests/server/item_ledger.test.ts tests/monolith_budget.test.ts tests/architecture.test.ts` | 225 passed |
| 2026-11-12 | `npx vitest run tests/private_realm_dungeons.test.ts tests/private_realm_xp.test.ts` | 17 passed |
| 2026-11-12 | `npx vitest run tests/dungeons.test.ts tests/raid_return.test.ts tests/party_machine.test.ts tests/gravewyrm_normal_tuning.test.ts tests/trash_engine.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts tests/localization_fixes.test.ts tests/parity` | 599 passed; 1 timeout (heroic loot seed sweep, passes alone in 34 s) and the i18n guard needing `npm run i18n:gen` first (passes after) |

| 2026-11-12 | `npx tsx scripts/private_realm_raid8.ts` (hollow_crypt normal) | 14 passed, 0 failed; boss not killed by bots |
| 2026-11-12 | `npx vitest run tests/server/custom_awards.test.ts tests/custom_award_i18n.test.ts` plus schema and MOTD pins | 145 passed |
| 2026-11-12 | `npx vitest run tests/custom_awards_section.test.ts tests/server/custom_awards_routes.test.ts tests/server/custom_awards.test.ts tests/custom_award_i18n.test.ts tests/i18n_completeness.test.ts tests/localization_fixes.test.ts tests/monolith_budget.test.ts tests/world_api_parity.test.ts` | 622 passed, 3 skipped |
| 2026-11-12 | `npx vitest run tests/architecture.test.ts tests/server/http tests/custom_awards_section.test.ts` (with `ALLOW_DEV_COMMANDS` cleared) | 1476 passed. With the local `.env` loaded, the `/api/status` golden fixture differs only by `dev_commands: true` |

## Outstanding

- M4 all dungeons, Heroic, the raid.
- M7 equippable award titles.
- M8 calibration and deploy.
- Human playtest of a boss kill with eight real players.
