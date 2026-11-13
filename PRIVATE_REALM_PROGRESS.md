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

## Every dungeon and the raid (M4)

Script runs (`BOSS=0`, trash only, 13 bots each) after the ratio fixes below:

| Dungeon | Normal | Heroic |
|---|---|---|
| hollow_crypt | pass, ratio 1.50 | pass, ratio 1.50 |
| sunken_bastion | pass, ratio 1.50 | pass, ratio 1.50 |
| gravewyrm_sanctum | pass, ratio 1.50 | pass, ratio 1.50 |
| drowned_temple | pass, ratio 1.50 | pass, ratio 1.50 |
| wildheart_basin | pass, ratio 1.50 | pass, ratio 1.50 |
| nythraxis_boss_arena (raid, 8 players) | pass, ratio 1.00, boss engaged | pass, ratio 1.00, boss engaged |

- Every run: one shared instance for the eight, a separate stock claim for
  the five-player control, step out and rejoin the same instance.
- The raid keeps its own tuning (ratio 1.00), as the brief asks: only
  five-player content is scaled.
- Gravewyrm and Wildheart: both the eight-bot raid and the five-bot control
  wipe on the first pack. The scripted bots only auto-attack, so these
  are bot limits, not the scale. Real players need to test the boss kills.
- In-process proof for every dungeon and difficulty:
  `tests/private_realm_dungeons.test.ts` pairs every spawn placement of a raid
  claim with its five-player twin and requires exactly 1.5 times the health.
  It also covers boss adds summoned mid-fight (`spawnBossAdds`).
- Script fixes found on the way: pair by template, level and local position
  (heroic minibosses and rolled levels broke template pairing); ignore mobs
  more than 240 yards from the bot's own slot origin (a neighbouring
  claim's mobs were in interest range and showed a false 0.67); exit and
  rejoin before any fighting; skip the heal check on a wipe.

Audit:
- Encounter spawns: every spawn path (spawn list, trash kits, boss adds,
  encounter summons) registers in the claim's `mobIds`, which is what the
  scaler walks. Covered by the summon test.
- `raid_return` (`src/sim/instances/raid_return.ts`): only the real raids
  have a raid family. In a five-player dungeon run by eight, a raider who
  steps out but stays in the group rejoins the same claim (script check). One
  who LEAVES the group cannot return to that run, as for any party.
- Subgroups: an eight-player raid is group 1 (five) and group 2 (three). Group
  buffs reach every member except Vampiric Touch and Choir of Deliverance,
  which heal only the priest's subgroup (stock raid behavior). Put the
  shadow priest with the players who need it.
- Tuning: the defaults (health 1.5, damage 1.15) stay. The bots cannot judge
  difficulty; revisit after the first real clears.

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

## Award titles (M7)

- An award can be worn as a title. Its id is `custom:<awardId>`
  (`src/sim/custom_titles.ts`), so it can never collide with a deed title.
- The owned set lives on the server only. `server/custom_award_titles.ts`
  reads the recipient's non-hidden awards and installs them on the live
  entity as `Entity.customTitles` (id to text). It syncs on join, on every new
  award, and on Hide, Show or Reject, and the newest sync wins.
- `setActiveTitle` (`src/sim/deeds.ts`) accepts a custom id only when it is in
  that set. A saved title is kept through a restore and confirmed by the join
  sync; Hide or Reject clears it.
- Wire: the identity key `ttx` carries the worn custom title's text next to
  `ttl` (`server/player_identity_wire.ts`). The client remembers it
  (`src/ui/custom_title_text.ts`) and `deedTitleText` renders it over the head
  and on the character pane. Identity diffing already re-sends on change.
- Book of Deeds: Wear and Remove buttons on each shown award row.
- Live check: `npx tsx scripts/private_realm_award_e2e.ts` (two bots, dev
  server) awards, wears, hides and rejects through the real routes, and
  checks the announcement, the no-self-award and duplicate refusals, and the
  title text seen by the other client.

## Calibration (M8)

- `npx tsx scripts/private_realm_pace_report.ts server.log --current <x> --target 6`
  reads the pace lines, projects each character's played hours to level 20
  from its last three level-ups, and prints the multiplier that would land
  the median character on the target (`server/private_realm_pace_report.ts`).
  Set both `PRIVATE_REALM_KILL_XP` and `PRIVATE_REALM_QUEST_XP` to it, restart,
  and re-run after a few more hours of play.
- The pace line's level field is `charLevel`, because `level` is the logger's
  own severity key (a live run showed it being overwritten).
- `/dev level` jumps emit no level-up and so write no pace line; only real XP
  does. Live check: a level 1 bot earning kill XP wrote its line at level 2.
- Starting point: x1. The authored quests alone cover about 3.8 times the
  curve (see M1), so the realm needs real play data, not a guess. Re-check at
  the first session and adjust.
- Loot: unchanged, per the brief. Five-player dungeon loot is rolled per
  kill as in stock, so eight players share five-player drops; no roll counts
  were changed.

## Private deploy (M8)

Follow `DEPLOY.md` as written (one AWS instance, docker compose, Caddy TLS),
from this branch on the fork. The only differences:

1. In the host `.env`, set `PRIVATE_REALM=1` and, once calibrated,
   `PRIVATE_REALM_KILL_XP` and `PRIVATE_REALM_QUEST_XP`. Leave the other
   private-realm keys unset unless tuning (the defaults are the brief:
   8 players, level 20, health 1.5, damage 1.15, 10 awards a day).
2. The game service only receives the variables listed in
   `docker-compose.yml`, so this branch adds pass-throughs for every
   `PRIVATE_REALM*` key (pinned by `tests/deploy_private_realm.test.ts`).
   Without them the realm would silently boot stock.
3. Do NOT set `ALLOW_DEV_COMMANDS`: compose does not pass it, and the cheat
   set must stay off. Do not set `MAX_WS_PER_IP_HARD` either: the default of
   20 per IP covers eight friends even behind one home network. The 400 used
   locally is only for the 13-bot scripts.
4. Keep the realm private: share the URL only with the group, and use
   `/api/register` as normal (one account each). The usual moderation and
   admin tools still work.
5. After the first session, copy the game logs
   (`sudo docker compose logs game > game.log`) and run the pace report
   (Calibration, above). Change the two XP keys and restart with
   `sudo docker compose up -d`.

Verify after boot: `curl -s https://<host>/api/status` answers, a level 20
raid of six to eight enters a five-player dungeon together, and `/award`
announces to the realm.

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

| 2026-11-12 | `npx tsx scripts/private_realm_award_e2e.ts` (dev server) | 17 passed, 0 failed |
| 2026-11-12 | `npx tsx scripts/private_realm_raid8.ts <dungeon> <mode>` for all five dungeons, both modes, plus `nythraxis_boss_arena` heroic | all pass (table in M4) |
| 2026-11-12 | `npx vitest run tests/private_realm_dungeons.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts tests/server/private_realm_pace.test.ts tests/server/private_realm_pace_report.test.ts` | 151 passed (before the per-dungeon cases; the dungeons file alone is now 19 passed) |
| 2026-11-12 | `npx vitest run tests/deploy_private_realm.test.ts tests/deploy_admission_cap.test.ts tests/server/tunables.test.ts tests/ci_change_classify.test.ts` | 141 passed |

| 2026-11-13 | `node scripts/gate_select.mjs` | i18n and manifest freshness, malware scan and changed-file biome passed. The `.env.example` change forced the full 6,278-file suite, stopped after about 3 hours on this laptop (load 15 to 20 with XProtect scans); 39 files had timed out |
| 2026-11-13 | `npx tsc --noEmit` | pass |
| 2026-11-13 | the 39 timed-out files re-run (2 workers, then one at a time, `env -u ALLOW_DEV_COMMANDS -u PRIVATE_REALM`) | all pass except one 30 s timeout in `tests/sfx_studio_server_security.test.ts` (file took 985 s); the branch touches no SFX or studio code. Needs a run on a quiet machine or CI |

## Outstanding

- Human playtest of the boss kills with eight real players.
- XP multiplier: set from the pace report after the first session.
