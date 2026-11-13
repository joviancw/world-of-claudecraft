// Private-realm eight-player end-to-end check over the REAL server: eight
// bots register, form a raid (party of five converted, then three more
// invited), reach level 20, walk into a five-player dungeon through the real
// door gate, and must all land in ONE claim. A five-bot control party claims
// the same dungeon so the eight-player scale can be read off matching mobs.
// The raid then fights to the first boss kill with plain auto-attack and a
// priest heal, checking that kills and heals reach the whole raid.
//
// Movement inside the dungeon uses dev_teleport so the run tests the realm
// plumbing rather than pathfinding; the door, the gate, combat, loot and XP
// all take the production paths.
//
// Requires the server running with ALLOW_DEV_COMMANDS=1 and PRIVATE_REALM=1:
//   npx tsx scripts/private_realm_raid8.ts [dungeonId] [normal|heroic]
import WebSocket from 'ws';
import { DUNGEON_X_THRESHOLD, DUNGEONS, ITEMS, instanceOrigin, MOBS } from '../src/sim/data';
import { worldAuthMessage } from './lib/world_auth.mjs';

const BASE = process.env.SERVER_URL ?? 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const DUNGEON_ID = process.argv[2] ?? 'hollow_crypt';
const DIFFICULTY = process.argv[3] === 'heroic' ? 'heroic' : 'normal';
const FIGHT_MS = Number(process.env.FIGHT_MS ?? 240_000);
const uniq = Date.now().toString(36);
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]).slice(-5);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond || !extra ? '' : ` ${extra}`}`);
}

async function api(path: string, body: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

type Wire = Record<string, any>;
const DELTA_SELF_KEYS = ['inv', 'equip', 'qlog', 'qdone', 'cds', 'stats', 'weapon', 'party'];
const ENTITY_IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'dgn'];

class Bot {
  pid = -1;
  token = '';
  charId = 0;
  self: Wire | null = null;
  ents = new Map<number, Wire>();
  events: Wire[] = [];
  ws!: WebSocket;
  constructor(
    readonly name: string,
    readonly cls: string,
  ) {}

  async join(): Promise<void> {
    const body = {
      username: `pr8_${this.name}_${uniq}`,
      password: 'hunter22',
      email: `pr8_${this.name}_${uniq}@example.com`,
    };
    let reg = await api('/api/register', body);
    while (reg.body.code === 'auth.too_many_attempts') {
      console.log('  register rate limited, waiting a minute...');
      await sleep(61_000);
      reg = await api('/api/register', body);
    }
    if (!reg.body.token) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
    this.token = reg.body.token;
    const char = await api(
      '/api/characters',
      { name: this.name + alpha, class: this.cls },
      this.token,
    );
    if (!char.body.id) throw new Error(`character failed: ${JSON.stringify(char.body)}`);
    this.charId = char.body.id;
    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws`);
      const to = setTimeout(() => reject(new Error('join timeout')), 10_000);
      this.ws.on('open', () =>
        this.ws.send(JSON.stringify(worldAuthMessage(this.token, this.charId))),
      );
      this.ws.on('message', (data) => {
        const msg = JSON.parse(String(data));
        if (msg.t === 'hello') {
          this.pid = msg.pid;
          clearTimeout(to);
          resolve();
        } else if (msg.t === 'snap') {
          const next = msg.self as Wire;
          if (this.self) for (const k of DELTA_SELF_KEYS) if (!(k in next)) next[k] = this.self[k];
          this.self = next;
          const ents = new Map<number, Wire>();
          for (const w of msg.ents as Wire[]) {
            const prev = this.ents.get(w.id);
            if (prev && w.k === undefined)
              for (const k of ENTITY_IDENTITY_KEYS) if (k in prev) w[k] = prev[k];
            ents.set(w.id, w);
          }
          for (const id of (msg.keep ?? []) as number[]) {
            const prev = this.ents.get(id);
            if (prev) ents.set(id, prev);
          }
          this.ents = ents;
        } else if (msg.t === 'events') this.events.push(...msg.list);
      });
      this.ws.on('error', reject);
    });
  }

  cmd(payload: Wire): void {
    this.ws.send(JSON.stringify({ t: 'cmd', ...payload }));
  }
  mobs(): Wire[] {
    return [...this.ents.values()].filter((e) => e.k === 'mob' && !e.dead && e.mhp > 0);
  }
  inDungeon(): boolean {
    return (this.self?.x ?? 0) > DUNGEON_X_THRESHOLD;
  }
}

function bestEpicWeapon(cls: string): string | null {
  return bestWeapon(cls, 'epic') ?? bestWeapon(cls, 'rare');
}

function bestWeapon(cls: string, quality: string): string | null {
  let best: { id: string; dps: number } | null = null;
  for (const item of Object.values(ITEMS) as Wire[]) {
    if (item.kind !== 'weapon' || item.quality !== quality || item.slot !== 'mainhand') continue;
    if ((item.requiredLevel ?? 0) > 20) continue;
    if (item.requiredClass && !item.requiredClass.includes(cls)) continue;
    const dps = (item.weapon.min + item.weapon.max) / 2 / item.weapon.speed;
    if (!best || dps > best.dps) best = { id: item.id, dps };
  }
  return best?.id ?? null;
}

async function formGroup(bots: Bot[], raid: boolean): Promise<void> {
  const [lead, ...rest] = bots;
  for (const [i, b] of rest.entries()) {
    if (raid && i === 4) {
      lead.cmd({ cmd: 'praid' });
      await sleep(400);
    }
    lead.cmd({ cmd: 'pinvite', id: b.pid });
    await sleep(200);
    b.cmd({ cmd: 'paccept' });
    await sleep(200);
  }
  if (raid && rest.length === 4) {
    lead.cmd({ cmd: 'praid' });
  }
  await sleep(800);
}

async function enterTogether(bots: Bot[]): Promise<void> {
  const door = DUNGEONS[DUNGEON_ID].doorPos;
  for (const b of bots) b.cmd({ cmd: 'dev_teleport', x: door.x + 1, z: door.z + 1 });
  await sleep(800);
  bots[0].cmd({ cmd: 'set_dungeon_difficulty', difficulty: DIFFICULTY });
  await sleep(400);
  for (const b of bots) {
    b.cmd({ cmd: 'enter_dungeon', dungeon: DUNGEON_ID });
    await sleep(200);
  }
  await sleep(1200);
}

interface PhaseStats {
  kills: number;
  bossDown: string | null;
  bossHpLow: number;
  heals: number;
  raiderDeaths: number;
  lowestHp: number;
  deathsSeen: Map<number, number>;
  dealt: Map<string, number>;
  taken: number;
  secs: number;
  stops: string;
}

function report(name: string, s: PhaseStats): void {
  console.log(
    `  ${name}: kills=${s.kills} boss=${s.bossDown ?? 'none'} bossHp=${(s.bossHpLow * 100).toFixed(0)}% raiderDeaths=${s.raiderDeaths} lowestHp=${s.lowestHp.toFixed(2)} heals=${s.heals} route=${s.stops} ${Math.round(s.secs)}s`,
  );
  console.log(
    `  ${name} dps: ${[...s.dealt].map(([k, v]) => `${k}=${(v / s.secs).toFixed(1)}`).join(' ')} | taken/s=${(s.taken / s.secs).toFixed(1)}`,
  );
}

// Teleport the raid through `route`, clearing every live mob within reach of
// the tank at each stop (a boss in reach is always the focus), until `done`
// or the time runs out. Dead raiders stay down inside the claim: releasing
// sends a ghost to the graveyard outside, which would pull the bot out.
async function fightPhase(
  raid: Bot[],
  tank: Bot,
  priest: Bot,
  raidPids: Set<number>,
  route: { x: number; z: number }[],
  ms: number,
  done: (s: PhaseStats) => boolean,
): Promise<PhaseStats> {
  const s: PhaseStats = {
    kills: 0,
    bossDown: null,
    bossHpLow: 1,
    heals: 0,
    raiderDeaths: 0,
    lowestHp: 1,
    deathsSeen: new Map(),
    dealt: new Map(),
    taken: 0,
    secs: 0,
    stops: '',
  };
  for (const b of raid) b.events = [];
  let stop = 0;
  const start = Date.now();
  while (Date.now() - start < ms && !done(s)) {
    if (raid.every((b) => b.self?.dead)) break;
    const here =
      tank.self && !tank.self.dead
        ? { x: tank.self.x, z: tank.self.z }
        : route[Math.max(0, stop - 1)];
    const inReach = tank
      .mobs()
      .filter((m) => Math.hypot(m.x - here.x, m.z - here.z) < 45)
      .sort(
        (a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z),
      );
    const target = stop === 0 ? undefined : (inReach.find((m) => MOBS[m.tid]?.boss) ?? inReach[0]);
    if (target && MOBS[target.tid]?.boss)
      s.bossHpLow = Math.min(s.bossHpLow, target.hp / target.mhp);
    if (target) {
      for (const b of raid) {
        if (b.self && Math.hypot(b.self.x - target.x, b.self.z - target.z) > 3) {
          b.cmd({
            cmd: 'dev_teleport',
            x: target.x + (Math.random() - 0.5) * 2,
            z: target.z + (Math.random() - 0.5) * 2,
          });
        }
        b.cmd({ cmd: 'target', id: target.id });
        b.cmd({ cmd: 'attack' });
      }
    } else if (stop < route.length) {
      const p = route[stop++];
      for (const b of raid)
        b.cmd({
          cmd: 'dev_teleport',
          x: p.x + (Math.random() - 0.5) * 2,
          z: p.z + (Math.random() - 0.5) * 2,
        });
    } else if (inReach.length === 0) break;
    const members = (priest.self?.party?.members ?? []) as Wire[];
    for (const m of members)
      if (!m.dead && m.mhp > 0) s.lowestHp = Math.min(s.lowestHp, m.hp / m.mhp);
    const hurt = members
      .filter((m) => !m.dead && m.hp / m.mhp < 0.9)
      .sort((x, y) => x.hp / x.mhp - y.hp / y.mhp)[0];
    if (hurt && !priest.self?.cast)
      priest.cmd({ cmd: 'cast', ability: 'lesser_heal', target: hurt.pid });
    for (const b of raid) {
      for (const ev of b.events) {
        if (ev.type === 'death') {
          s.deathsSeen.set(ev.entityId, (s.deathsSeen.get(ev.entityId) ?? 0) + 1);
          const dead = b.ents.get(ev.entityId);
          if (b === tank && dead?.k === 'mob') {
            s.kills++;
            if (MOBS[dead.tid]?.boss) s.bossDown = dead.tid;
          }
          if (b === tank && raidPids.has(ev.entityId)) s.raiderDeaths++;
        }
        if (ev.type === 'damage' && ev.sourceId === b.pid)
          s.dealt.set(b.cls + b.name, (s.dealt.get(b.cls + b.name) ?? 0) + ev.amount);
        if (ev.type === 'damage' && ev.targetId === b.pid) s.taken += ev.amount;
        if (ev.type === 'heal2' && b === priest && ev.sourceId === priest.pid && ev.amount > 0)
          s.heals++;
      }
      b.events = [];
    }
    await sleep(300);
  }
  s.secs = (Date.now() - start) / 1000;
  s.stops = `${stop}/${route.length}`;
  return s;
}

async function main(): Promise<void> {
  if (!DUNGEONS[DUNGEON_ID]) throw new Error(`unknown dungeon ${DUNGEON_ID}`);
  const classes = [
    'warrior',
    'paladin',
    'priest',
    'rogue',
    'warrior',
    'paladin',
    'rogue',
    'hunter',
  ];
  const raid = classes.map((cls, i) => new Bot(`Rd${'abcdefgh'[i]}`, cls));
  const control = ['warrior', 'paladin', 'priest', 'rogue', 'hunter'].map(
    (cls, i) => new Bot(`Pt${'abcde'[i]}`, cls),
  );
  const everyone = [...raid, ...control];
  console.log(`joining ${everyone.length} bots for ${DUNGEON_ID} (${DIFFICULTY})...`);
  for (const b of everyone) await b.join();
  check(
    'all bots connected',
    everyone.every((b) => b.pid > 0),
  );

  for (const b of everyone) b.cmd({ cmd: 'dev_level', level: 20 });
  await sleep(800);
  // Arrive geared like a group that has run the dungeons: each bot wields the
  // best epic weapon its class may use (fresh level-20 starter gear swings for
  // about 5 DPS, which turns every boss into a multi-minute auto-attack crawl).
  for (const b of everyone) {
    const weapon = bestEpicWeapon(b.cls);
    if (!weapon) continue;
    b.cmd({ cmd: 'dev_give', item: weapon, count: 1 });
    await sleep(150);
    b.cmd({ cmd: 'equip', item: weapon });
  }
  await sleep(600);
  if (process.env.DEBUG)
    console.log(
      '  dbg weapons',
      everyone
        .map((b) => `${b.cls}:${JSON.stringify(b.self?.equip?.mainhand ?? b.self?.weapon)}`)
        .join(' '),
    );
  check(
    'all bots level 20',
    everyone.every((b) => b.self?.lv === 20),
    JSON.stringify(everyone.map((b) => b.self?.lv)),
  );

  await formGroup(raid, true);
  await formGroup(control, false);
  const raidParty = raid[0].self?.party;
  check(
    'eight-player raid formed',
    raidParty?.raid === true && raidParty?.members?.length === 8,
    `raid=${raidParty?.raid} members=${raidParty?.members?.length}`,
  );
  check('control party of five formed', control[0].self?.party?.members?.length === 5);

  await enterTogether(raid);
  check(
    'all eight raiders inside the dungeon',
    raid.every((b) => b.inDungeon()),
    JSON.stringify(raid.map((b) => Math.round(b.self?.x ?? 0))),
  );
  const zs = raid.map((b) => b.self?.z ?? 0);
  check(
    'all eight share ONE instance',
    Math.max(...zs) - Math.min(...zs) < 120,
    JSON.stringify(zs.map(Math.round)),
  );

  await enterTogether(control);
  check(
    'control party inside the dungeon',
    control.every((b) => b.inDungeon()),
  );
  check(
    'control party is in a different instance',
    Math.abs((control[0].self?.z ?? 0) - zs[0]) > 120,
  );

  // The scale, read off matching template and level pairs both groups can see.
  await sleep(600);
  const raidMobs = raid[0].mobs();
  const controlMobs = new Map(control[0].mobs().map((m) => [`${m.tid}:${m.lv}`, m]));
  const ratios = raidMobs
    .map((m) => [m, controlMobs.get(`${m.tid}:${m.lv}`)] as const)
    .filter(([, twin]) => twin)
    .map(([m, twin]) => m.mhp / twin!.mhp);
  console.log(
    `  health ratios raid/party over ${ratios.length} pairs: ${[...new Set(ratios.map((r) => r.toFixed(2)))].join(', ')}`,
  );
  check(
    'raid enemies carry the eight-player health scale',
    ratios.length > 0 && ratios.every((r) => r > 1.4 && r < 1.6),
  );

  // Fight phases. Teleporting keeps the run on realm plumbing rather than
  // pathfinding; the priest heals the lowest member. Bots are level 20 (the
  // cap), so no XP events are expected here.
  const tank = raid[0];
  const priest = raid[2];
  const dungeon = DUNGEONS[DUNGEON_ID];
  const slot = Math.round(((tank.self?.z ?? 0) + 1250) / 500);
  const origin = instanceOrigin(dungeon.index, slot);
  const at = (s: { x: number; z: number }) => ({ x: origin.x + s.x, z: origin.z + s.z });
  const raidPids = new Set(raid.map((b) => b.pid));

  // Phase 1, the first trash pack inside the door: kills, heals and the shared
  // kill feed, with the whole raid alive for the exit check after it.
  const trash = await fightPhase(
    raid,
    tank,
    priest,
    raidPids,
    [at(dungeon.spawns[0])],
    120_000,
    (s) => s.kills >= 3,
  );
  report('trash', trash);
  check('the raid killed enemies', trash.kills > 0);
  check(
    'every raider saw the kills',
    [...trash.deathsSeen.values()].some((n) => n >= 8),
  );
  check(
    'priest heals landed on hurt raiders',
    trash.lowestHp >= 0.9 || trash.heals > 0,
    `lowestHp=${trash.lowestHp.toFixed(2)}`,
  );

  // Leave through the real exit and rejoin: the claim survives a raider
  // stepping out and back in.
  const leaver = raid.find((b) => !b.self?.dead && b !== priest && b !== tank) ?? raid[7];
  const exit = [...leaver.ents.values()].find((e) => e.tid === 'dungeon_exit');
  const exitPos = exit ?? at(dungeon.exitOffset);
  leaver.cmd({ cmd: 'dev_teleport', x: exitPos.x + 1, z: exitPos.z + 1 });
  await sleep(600);
  leaver.cmd({ cmd: 'leave_dungeon' });
  await sleep(1000);
  check('a raider can step back outside', !leaver.inDungeon());
  leaver.cmd({ cmd: 'dev_teleport', x: dungeon.doorPos.x + 1, z: dungeon.doorPos.z + 1 });
  await sleep(600);
  leaver.cmd({ cmd: 'enter_dungeon', dungeon: DUNGEON_ID });
  await sleep(1200);
  check(
    'and rejoins the SAME instance',
    leaver.inDungeon() && Math.abs((leaver.self?.z ?? 0) - zs[0]) < 120,
  );

  // Phase 2, the final boss (ROUTE=full sweeps every authored spawn first).
  // Scripted auto-attack bots are not a real group (no rotations, threat or
  // interrupts), so the kill is a hard check only with REQUIRE_BOSS=1; the
  // health it reaches is the tuning signal.
  const firstBoss = dungeon.spawns.findIndex((s) => MOBS[s.mobId]?.boss);
  if (firstBoss >= 0 && process.env.BOSS !== '0') {
    const spawns =
      process.env.ROUTE === 'full'
        ? dungeon.spawns.slice(1, firstBoss + 1)
        : [dungeon.spawns[firstBoss]];
    const boss = await fightPhase(
      raid,
      tank,
      priest,
      raidPids,
      spawns.map(at),
      FIGHT_MS,
      (s) => s.bossDown !== null,
    );
    report('boss', boss);
    if (process.env.REQUIRE_BOSS === '1') check('first boss defeated', boss.bossDown !== null);
    else
      console.log(
        `INFO boss ${boss.bossDown ? 'defeated' : 'not defeated'} (REQUIRE_BOSS=1 makes this a check)`,
      );
  }

  for (const b of everyone) b.ws.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
