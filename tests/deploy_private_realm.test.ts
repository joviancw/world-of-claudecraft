import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync('docker-compose.yml', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const composeEnv = (name: string) => `$${`{${name}:-}`}`;

// The `game:` service block alone, as in deploy_admission_cap.test.ts.
const gameStart = compose.indexOf('\n  game:');
const discordStart = compose.indexOf('\n  discord-bot:');
const gameService = compose.slice(gameStart, discordStart);

// Every PRIVATE_REALM* key server/private_realm_config.ts reads.
const KEYS = [
  'PRIVATE_REALM',
  'PRIVATE_REALM_MEMBERSHIP',
  'PRIVATE_REALM_MEMBERSHIP_GEAR',
  'PRIVATE_REALM_ALWAYS_RESTED',
  'PRIVATE_REALM_KILL_XP',
  'PRIVATE_REALM_QUEST_XP',
  'PRIVATE_REALM_DUNGEON_PLAYERS',
  'PRIVATE_REALM_DUNGEON_MIN_LEVEL',
  'PRIVATE_REALM_DUNGEON_HP',
  'PRIVATE_REALM_DUNGEON_DMG',
  'PRIVATE_REALM_AWARD_DAILY_CAP',
];

describe('private realm deploy contract', () => {
  it('finds both game-service slice boundaries, in order', () => {
    expect(gameStart).toBeGreaterThanOrEqual(0);
    expect(discordStart).toBeGreaterThan(gameStart);
  });

  // The game service has an explicit environment allowlist (no env_file): a key
  // set only in the host .env would never reach the process, so the realm would
  // silently boot stock.
  it.each(KEYS)('passes %s through to the game server container', (key) => {
    expect(gameService).toContain(`${key}: ${composeEnv(key)}`);
  });

  it.each(KEYS)('documents %s in .env.example, commented out', (key) => {
    expect(envExample).toContain(`#${key}=`);
  });

  it('every key the config reads is pinned here', () => {
    const src = readFileSync('server/private_realm_config.ts', 'utf8');
    const read = new Set(
      [...src.matchAll(/'(PRIVATE_REALM\w*)'|env\.(PRIVATE_REALM\w*)/g)].map((m) => m[1] ?? m[2]),
    );
    expect([...read].sort()).toEqual([...KEYS].sort());
  });
});
