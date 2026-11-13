// Private-realm player-awarded achievements, end to end over the REAL server:
// /award in chat, the realm-wide announcement, the refusals (self, duplicate),
// the recipient-only REST surface, wearing the award as a title (seen by a
// third player on the identity wire), and hide / reject clearing it.
//
// Requires the server running with PRIVATE_REALM=1 and ALLOW_DEV_COMMANDS=1
// (dev only, for the teleport that puts the three bots side by side):
//   npx tsx scripts/private_realm_award_e2e.ts
import WebSocket from 'ws';
import { worldAuthMessage } from './lib/world_auth.mjs';

const BASE = process.env.SERVER_URL ?? 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
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

type Wire = Record<string, any>;

async function api(method: 'GET' | 'POST', path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Wire };
}

const DELTA_SELF_KEYS = ['inv', 'equip', 'qlog', 'qdone', 'cds', 'stats', 'weapon', 'party'];
const IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'title', 'ttx'];

class Bot {
  pid = -1;
  token = '';
  charId = 0;
  charName = '';
  self: Wire | null = null;
  ents = new Map<number, Wire>();
  logs: string[] = [];
  ws!: WebSocket;
  constructor(readonly name: string) {}

  async join(): Promise<void> {
    const body = {
      username: `aw_${this.name}_${uniq}`,
      password: 'hunter22',
      email: `aw_${this.name}_${uniq}@example.com`,
    };
    let reg = await api('POST', '/api/register', undefined, body);
    while (reg.body.code === 'auth.too_many_attempts') {
      console.log('  register rate limited, waiting a minute...');
      await sleep(61_000);
      reg = await api('POST', '/api/register', undefined, body);
    }
    if (!reg.body.token) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
    this.token = reg.body.token;
    this.charName = this.name + alpha;
    const char = await api('POST', '/api/characters', this.token, {
      name: this.charName,
      class: 'warrior',
    });
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
              for (const k of IDENTITY_KEYS) if (k in prev) w[k] = prev[k];
            ents.set(w.id, w);
          }
          for (const id of (msg.keep ?? []) as number[]) {
            const prev = this.ents.get(id);
            if (prev) ents.set(id, prev);
          }
          this.ents = ents;
        } else if (msg.t === 'events') {
          for (const ev of msg.list as Wire[])
            if (ev.type === 'log' && typeof ev.text === 'string') this.logs.push(ev.text);
        }
      });
      this.ws.on('error', reject);
    });
  }

  cmd(payload: Wire): void {
    this.ws.send(JSON.stringify({ t: 'cmd', ...payload }));
  }
  say(text: string): void {
    this.cmd({ cmd: 'chat', text });
  }
  heard(fragment: string): boolean {
    return this.logs.some((l) => l.includes(fragment));
  }
}

async function main(): Promise<void> {
  const giver = new Bot('Giv');
  const hero = new Bot('Her');
  const peer = new Bot('Pee');
  for (const b of [giver, hero, peer]) await b.join();
  check(
    'three bots connected',
    [giver, hero, peer].every((b) => b.pid > 0),
  );
  await sleep(800);
  const at = giver.self ?? { x: 0, z: 0 };
  for (const b of [hero, peer]) b.cmd({ cmd: 'dev_teleport', x: at.x + 2, z: at.z + 2 });
  await sleep(1500);

  const title = 'Pull Champion';
  giver.say(`/award ${hero.charName} "${title}" Pulled the whole room and lived.`);
  await sleep(2000);
  const line = `ACHIEVEMENT UNLOCKED! ${hero.charName} has earned "${title}"! Awarded by ${giver.charName}.`;
  check('the recipient hears the announcement', hero.heard(line));
  check('an unrelated player hears it too', peer.heard(line));
  check('the giver is told it was sent', giver.heard(`You awarded "${title}"`));

  giver.logs = [];
  await sleep(1200);
  giver.say(`/award ${hero.charName} "${title}" Again.`);
  await sleep(1500);
  check('a duplicate title is refused', giver.heard('already has an achievement with that title'));
  await sleep(1200);
  giver.say(`/award ${giver.charName} "Self Made" Mine.`);
  await sleep(1500);
  check('awarding yourself is refused', giver.heard('cannot award an achievement to yourself'));

  const mine = await api('GET', `/api/custom-awards?character=${hero.charId}`, hero.token);
  const award = mine.body.awards?.[0];
  check(
    'the recipient lists the award',
    mine.status === 200 && mine.body.enabled === true && award?.title === title,
    JSON.stringify(mine),
  );
  const snoop = await api('GET', `/api/custom-awards?character=${hero.charId}`, peer.token);
  check('another account cannot read it', snoop.status === 404, String(snoop.status));
  const forged = await api('POST', '/api/custom-awards/reject', peer.token, {
    character: hero.charId,
    award: award?.id,
  });
  check('another account cannot reject it', forged.status === 404, String(forged.status));
  if (!award) return finish([giver, hero, peer]);

  const id = `custom:${award.id}`;
  peer.cmd({ cmd: 'deed_set_title', deedId: id });
  await sleep(1200);
  check('another player cannot wear it', !peer.self?.title);

  hero.cmd({ cmd: 'deed_set_title', deedId: id });
  await sleep(1500);
  check('the recipient wears it', hero.self?.title === id, JSON.stringify(hero.self?.title));
  const seen = peer.ents.get(hero.pid);
  check(
    'a nearby player sees the title and its text',
    seen?.title === id && seen?.ttx === title,
    JSON.stringify({ title: seen?.title, ttx: seen?.ttx }),
  );

  const hide = await api('POST', '/api/custom-awards/hide', hero.token, {
    character: hero.charId,
    award: award.id,
    hidden: true,
  });
  await sleep(1500);
  check('hiding it takes the title off', hide.status === 200 && !hero.self?.title);
  check('and off the nameplate others see', !peer.ents.get(hero.pid)?.title);

  await api('POST', '/api/custom-awards/hide', hero.token, {
    character: hero.charId,
    award: award.id,
    hidden: false,
  });
  await sleep(1200);
  hero.cmd({ cmd: 'deed_set_title', deedId: id });
  await sleep(1500);
  check('a shown award can be worn again', hero.self?.title === id);
  const reject = await api('POST', '/api/custom-awards/reject', hero.token, {
    character: hero.charId,
    award: award.id,
  });
  await sleep(1500);
  check('rejecting it takes the title off', reject.status === 200 && !hero.self?.title);
  const after = await api('GET', `/api/custom-awards?character=${hero.charId}`, hero.token);
  check('a rejected award leaves the list', after.body.awards?.length === 0);
  finish([giver, hero, peer]);
}

function finish(bots: Bot[]): void {
  for (const b of bots) b.ws.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
