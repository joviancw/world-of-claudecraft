// The private realm's custom-award REST surface (server/custom_awards_routes.ts):
// the recipient-only list, hide/show and reject routes. Handlers run against an
// injected runtime (fake store + ownership), so nothing touches Postgres; the
// middleware pins prove the account bearer and body parsing sit in front.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_custom_awards_routes';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomAwardRow, CustomAwardsStore } from '../../server/custom_awards_db';
import {
  type CustomAwardsRuntime,
  configureCustomAwardsRuntime,
  routes,
} from '../../server/custom_awards_routes';
import type { Ctx, Method, RouteDef } from '../../server/http/types';
import { fakeCtx } from './helpers/fake_ctx';
import type { FakeRes } from './helpers/fake_http';

const OWNER = 7;
const MINE = 101;
const THEIRS = 202;

const award: CustomAwardRow = {
  id: 5,
  title: 'Pull Champion',
  description: 'Pulled the whole room.',
  giverName: 'Thorne',
  hidden: false,
  createdAt: 1_700_000_000,
};

let enabled = true;
let calls: string[] = [];

function fakeStore(): CustomAwardsStore {
  return {
    findRecipient: async () => null,
    insert: async () => ({ ok: true }) as never,
    listFor: async (cid) => {
      calls.push(`list:${cid}`);
      return [award];
    },
    setHidden: async (cid, id, hidden) => {
      calls.push(`hide:${cid}:${id}:${hidden}`);
      return id === award.id;
    },
    reject: async (cid, id) => {
      calls.push(`reject:${cid}:${id}`);
      return id === award.id;
    },
  };
}

beforeEach(() => {
  enabled = true;
  calls = [];
  const rt: CustomAwardsRuntime = {
    store: fakeStore(),
    ownsCharacter: async (accountId, characterId) => accountId === OWNER && characterId === MINE,
    enabled: () => enabled,
  };
  configureCustomAwardsRuntime(rt);
});
afterEach(() => configureCustomAwardsRuntime(null));

function route(method: Method, path: string): RouteDef {
  const r = routes.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`missing ${method} ${path}`);
  return r;
}

async function call(
  method: Method,
  path: string,
  init: { query?: Record<string, string>; body?: unknown; accountId?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ctx: Ctx = fakeCtx({
    method,
    url: path,
    query: init.query,
    body: init.body,
    account: { accountId: init.accountId ?? OWNER, scope: 'full' },
  });
  await route(method, path).handler(ctx);
  const res = ctx.res as unknown as FakeRes;
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

describe('custom-award routes: wiring', () => {
  it('every route sits behind the account bearer; the writes also parse a body', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      'GET /api/custom-awards',
      'POST /api/custom-awards/hide',
      'POST /api/custom-awards/reject',
    ]);
    for (const r of routes) {
      expect(r.middleware?.length ?? 0).toBeGreaterThanOrEqual(r.method === 'POST' ? 2 : 1);
    }
  });
});

describe('GET /api/custom-awards', () => {
  it('lists the owned character awards', async () => {
    const r = await call('GET', '/api/custom-awards', { query: { character: String(MINE) } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ enabled: true, awards: [award] });
    expect(calls).toEqual([`list:${MINE}`]);
  });

  it('answers the anti-enumeration 404 for a character the account does not own', async () => {
    const r = await call('GET', '/api/custom-awards', { query: { character: String(THEIRS) } });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('character.not_found');
    expect(calls).toEqual([]);
  });

  it('rejects a malformed character id', async () => {
    for (const character of ['', 'abc', '-1', '1.5']) {
      const r = await call('GET', '/api/custom-awards', { query: { character } });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('deeds.invalid_input');
    }
  });

  it('reports disabled (and reads nothing) when the realm is not private', async () => {
    enabled = false;
    const r = await call('GET', '/api/custom-awards', { query: { character: String(MINE) } });
    expect(r).toEqual({ status: 200, body: { enabled: false, awards: [] } });
    expect(calls).toEqual([]);
  });
});

describe('POST /api/custom-awards/hide and /reject', () => {
  it('hides and shows an award on the owned character', async () => {
    const hide = { character: MINE, award: award.id, hidden: true };
    expect((await call('POST', '/api/custom-awards/hide', { body: hide })).status).toBe(200);
    const show = { ...hide, hidden: false };
    expect((await call('POST', '/api/custom-awards/hide', { body: show })).status).toBe(200);
    expect(calls).toEqual([`hide:${MINE}:5:true`, `hide:${MINE}:5:false`]);
  });

  it('rejects an award on the owned character', async () => {
    const r = await call('POST', '/api/custom-awards/reject', {
      body: { character: MINE, award: award.id },
    });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([`reject:${MINE}:5`]);
  });

  it('never touches another account character', async () => {
    const other = await call('POST', '/api/custom-awards/reject', {
      body: { character: MINE, award: award.id },
      accountId: OWNER + 1,
    });
    expect(other.status).toBe(404);
    const theirs = await call('POST', '/api/custom-awards/hide', {
      body: { character: THEIRS, award: award.id, hidden: true },
    });
    expect(theirs.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('404s an award the character does not hold', async () => {
    const r = await call('POST', '/api/custom-awards/reject', {
      body: { character: MINE, award: 999 },
    });
    expect(r.status).toBe(404);
  });

  it('validates the body shape', async () => {
    const bad: unknown[] = [
      {},
      { character: MINE, award: 'x', hidden: true },
      { character: MINE, award: award.id, hidden: 'yes' },
      { character: 'me', award: award.id, hidden: true },
    ];
    for (const body of bad) {
      const r = await call('POST', '/api/custom-awards/hide', { body });
      expect(r.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('404s both writes when the realm is not private', async () => {
    enabled = false;
    const body = { character: MINE, award: award.id, hidden: true };
    expect((await call('POST', '/api/custom-awards/hide', { body })).status).toBe(404);
    expect((await call('POST', '/api/custom-awards/reject', { body })).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
