# Private realm: local testing

This branch (`feature/private-realm` on [joviancw/world-of-claudecraft](https://github.com/joviancw/world-of-claudecraft)) turns on a small-group ruleset: faster leveling (via env multipliers), up to nine players in five-player dungeons with scaled enemies, and player-awarded achievements with optional titles. Nothing changes until the **server** sees `PRIVATE_REALM=1`.

Implementation notes and milestone history: [PRIVATE_REALM_PROGRESS.md](PRIVATE_REALM_PROGRESS.md). Production hosting: [DEPLOY.md](DEPLOY.md) plus the **Private deploy** section in the progress doc.

## What you need

- **Node.js** 20+ (Node 26 works; match what you use for the main repo).
- **pnpm** `10.34.5` (see `package.json` `packageManager`):

  ```bash
  npm install -g pnpm@10.34.5
  ```

- **Postgres 16** for accounts and characters. Easiest path: Docker via the repo (port **5433**).

## Get the code

Clone your fork and use the private-realm branch:

```bash
git clone https://github.com/joviancw/world-of-claudecraft.git
cd world-of-claudecraft
git checkout feature/private-realm
pnpm install --frozen-lockfile
```

If you already use a git worktree, open that tree instead; the steps below are the same.

## Configure `.env`

```bash
cp .env.example .env
```

Edit `.env` at minimum:

| Variable | Local testing value | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | any strong password (e.g. `change-me` for localhost only) | Must match `DATABASE_URL` |
| `DATABASE_URL` | `postgres://eastbrook:<password>@127.0.0.1:5433/eastbrook` | Same password as above |
| `PRIVATE_REALM` | `1` | **Required** for the fork rules (also hides signup email, skips the recovery-email prompt, and grants full membership to every account while they play) |
| `ALLOW_DEV_COMMANDS` | `1` | **Local only.** Unlocks `/dev` cheats (level, teleport, etc.) for you and for the bot scripts. **Never set on a friends' server.** |

Optional (defaults are fine until you calibrate XP from real play):

```bash
PRIVATE_REALM_KILL_XP=1
PRIVATE_REALM_QUEST_XP=1
```

Other knobs (`PRIVATE_REALM_DUNGEON_*`, award daily cap) are documented in `.env.example` and the progress doc.

## Start the database

```bash
pnpm run db:up
```

Wait until Postgres is healthy (Docker on **127.0.0.1:5433**). If you use Homebrew Postgres instead, point `DATABASE_URL` at your instance and skip `db:up`.

## Run the game (two terminals)

**Terminal 1, authoritative server:**

```bash
pnpm run server
```

You should see the database ready and the process listening on **8787**.

**Terminal 2, client with hot reload:**

```bash
pnpm run dev
```

Open **http://localhost:5173**, register an account, create a character, and play. The Vite dev server proxies `/api` and `/ws` to port 8787.

### Quick sanity check

After the server boots with `PRIVATE_REALM=1` in `.env`:

1. Create two accounts (or two browsers / incognito windows).
2. On account A, with dev commands on, type in chat: `/dev level 20` (if that is enabled for your build).
3. Form a **raid** of up to nine level-20 characters (party of five, convert to raid, invite four more).
4. Walk to a five-player dungeon (e.g. Hollow Crypt) and enter on **Normal** or **Heroic** together. All nine should land in **one** instance.

## Features to exercise by hand

### Eight-player dungeons

- Raid size up to **8**, everyone **level 20+** (configurable via env).
- Enemy **HP x1.5** and **damage x1.15** on that raid claim only (not on the Nythraxis raid room tuning).
- Loot rules are unchanged from stock (five-player rolls shared among the raid).

Boss kills were **not** proven by the automated bots; plan a real group playtest for bosses.

### Player awards and titles

In chat (giver must be online as that character):

```text
/award <character name> "<title>" optional description
```

- Title max **40** characters, description max **160**.
- No self-awards; server enforces caps and duplicates.
- Realm announcement + sound; entry under **Book of Deeds** (Titles tab), section **Awarded by Friends**.
- Givers also use **Your Awards** on the same tab: save award templates, then **Issue** to a character by name (`/award` still works).
- **Wear** / **Remove** title from a shown award; **Hide**, **Show**, or **Reject** as the recipient.

### XP pace (after some real leveling)

The server logs one JSON line per level-up with `"msg":"private realm pace"` (field `charLevel`, not `level`). After a session:

```bash
pnpm run server 2>&1 | tee server.log
# ... play without /dev level jumps; only real XP writes pace lines ...
npx tsx scripts/private_realm_pace_report.ts server.log --current 1 --target 6
```

Set `PRIVATE_REALM_KILL_XP` and `PRIVATE_REALM_QUEST_XP` to the suggested multiplier, restart the server, and play more.

## Automated checks (optional)

These need the server running with `PRIVATE_REALM=1`, `ALLOW_DEV_COMMANDS=1`, and a healthy database. Bot scripts open many WebSockets from one IP, so start the server with a higher cap **for local bot runs only**:

```bash
MAX_WS_PER_IP_HARD=400 pnpm run server
```

| Script | What it checks |
|---|---|
| `npx tsx scripts/private_realm_raid8.ts <dungeon> <normal\|heroic>` | Eight bots + five control bots: one instance, HP ratio, trash, rejoin. `BOSS=0` skips boss phase (default in script env). Raid: `nythraxis_boss_arena`. |
| `npx tsx scripts/private_realm_award_e2e.ts` | Awards, hide/reject, title on the wire (two bots). |
| `npx vitest run tests/private_realm_dungeons.test.ts tests/server/custom_awards_routes.test.ts` | In-process rules without a live server. |

Example:

```bash
BOSS=0 npx tsx scripts/private_realm_raid8.ts hollow_crypt normal
```

When running Vitest locally, unset dev-only env if your `.env` sets them (otherwise some HTTP golden tests differ):

```bash
env -u ALLOW_DEV_COMMANDS -u PRIVATE_REALM npx vitest run tests/private_realm_dungeons.test.ts
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dungeons still say raids cannot enter | `PRIVATE_REALM` not `1` on the **server** process, or server not restarted after `.env` change |
| `/dev` does nothing | `ALLOW_DEV_COMMANDS` not `1`, or typo; restart server |
| Bot script hangs on "register rate limited" | Too many quick registrations; wait a minute or raise limits only on a dev box |
| Bots fail to connect | Run server with `MAX_WS_PER_IP_HARD=400` locally |
| Pace report says no samples | Use real XP level-ups, not `/dev level` |
| Client cannot connect | Server on 8787? `pnpm run dev` running? Postgres up? |

## Friends' server (not local)

Use Docker compose per [DEPLOY.md](DEPLOY.md). On this branch, set in the host `.env`:

- `PRIVATE_REALM=1`
- Calibrated `PRIVATE_REALM_KILL_XP` and `PRIVATE_REALM_QUEST_XP` when ready
- **Do not** set `ALLOW_DEV_COMMANDS`
- **Do not** raise `MAX_WS_PER_IP_HARD` unless you know you need it (default **20** per IP is enough for eight players on one home network)

The compose file on this branch passes `PRIVATE_REALM*` into the game container; without that, the realm would boot stock even if `.env` had `PRIVATE_REALM=1`.