// REST surface for the private realm's player-awarded achievements (the
// service and its /award command live in server/custom_awards.ts): the
// recipient's own list, and the recipient's two controls, hide/show and
// reject. Account bearer plus an explicit ownership check on the named
// character (an unowned or unknown character answers the anti-enumeration
// 404), so only the recipient ever reads or changes their awards. With the
// private realm off the list answers `{ enabled: false, awards: [] }` and the
// writes 404, so a stock realm exposes nothing.

import type { Pool } from 'pg';
import { type CustomAwardsStore, customAwardsStore } from './custom_awards_db';
import { ctxAccountId } from './http/context';
import { withBody } from './http/middleware/body';
import { requireAccount } from './http/middleware/require_account';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';
import { privateRealmRules } from './private_realm_config';
import { REALM } from './realm';

const NOT_FOUND = { error: 'character not found', code: 'character.not_found' } as const;
const INVALID_INPUT = { error: 'invalid input', code: 'deeds.invalid_input' } as const;

export interface CustomAwardsRuntime {
  store: CustomAwardsStore;
  ownsCharacter(accountId: number, characterId: number): Promise<boolean>;
  enabled(): boolean;
}

let runtime: CustomAwardsRuntime | null = null;

/** Install a test runtime (or null to fall back to the real database). */
export function configureCustomAwardsRuntime(rt: CustomAwardsRuntime | null): void {
  runtime = rt;
}

async function useRuntime(): Promise<CustomAwardsRuntime> {
  if (runtime) return runtime;
  const db = await import('./db');
  runtime = {
    store: customAwardsStore(() => db.pool as Pool, REALM),
    ownsCharacter: async (accountId, characterId) =>
      (await db.getCharacter(accountId, characterId)) !== null,
    enabled: () => privateRealmRules()?.achievements.customAwardsEnabled === true,
  };
  return runtime;
}

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The owned character the request names, or null after answering 4xx. */
async function ownedCharacterId(
  ctx: Ctx,
  rt: CustomAwardsRuntime,
  raw: unknown,
): Promise<number | null> {
  const characterId = positiveInt(raw);
  if (characterId === null) {
    json(ctx.res, 400, INVALID_INPUT);
    return null;
  }
  if (!(await rt.ownsCharacter(ctxAccountId(ctx), characterId))) {
    json(ctx.res, 404, NOT_FOUND);
    return null;
  }
  return characterId;
}

/** GET /api/custom-awards?character=<id>: the recipient's awards, newest first. */
async function listHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 200, { enabled: false, awards: [] });
    return;
  }
  const raw = ctx.query.character;
  const characterId = await ownedCharacterId(ctx, rt, Array.isArray(raw) ? raw[0] : raw);
  if (characterId === null) return;
  json(ctx.res, 200, { enabled: true, awards: await rt.store.listFor(characterId) });
}

/** POST /api/custom-awards/hide { character, award, hidden }. */
async function hideHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 404, NOT_FOUND);
    return;
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const awardId = positiveInt(body.award);
  if (awardId === null || typeof body.hidden !== 'boolean') {
    json(ctx.res, 400, INVALID_INPUT);
    return;
  }
  const characterId = await ownedCharacterId(ctx, rt, body.character);
  if (characterId === null) return;
  const ok = await rt.store.setHidden(characterId, awardId, body.hidden);
  if (!ok) json(ctx.res, 404, NOT_FOUND);
  else json(ctx.res, 200, { ok: true });
}

/** POST /api/custom-awards/reject { character, award }: permanent. */
async function rejectHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 404, NOT_FOUND);
    return;
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const awardId = positiveInt(body.award);
  if (awardId === null) {
    json(ctx.res, 400, INVALID_INPUT);
    return;
  }
  const characterId = await ownedCharacterId(ctx, rt, body.character);
  if (characterId === null) return;
  const ok = await rt.store.reject(characterId, awardId);
  if (!ok) json(ctx.res, 404, NOT_FOUND);
  else json(ctx.res, 200, { ok: true });
}

const readAccount = requireAccount({ scope: 'read' });
const activeAccount = requireAccount({ scope: 'active' });

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/custom-awards',
    surface: 'api',
    middleware: [readAccount],
    handler: listHandler,
  },
  {
    method: 'POST',
    path: '/api/custom-awards/hide',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: hideHandler,
  },
  {
    method: 'POST',
    path: '/api/custom-awards/reject',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: rejectHandler,
  },
];
