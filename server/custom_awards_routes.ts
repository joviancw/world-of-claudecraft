// REST surface for the private realm's player-awarded achievements (the
// service and its /award command live in server/custom_awards.ts): the
// recipient's own list, and the recipient's two controls, hide/show and
// reject. Account bearer plus an explicit ownership check on the named
// character (an unowned or unknown character answers the anti-enumeration
// 404), so only the recipient ever reads or changes their awards. With the
// private realm off the list answers `{ enabled: false, awards: [] }` and the
// writes 404, so a stock realm exposes nothing.

import type { Pool } from 'pg';
import { customAwardChanged } from './custom_award_changes';
import { draftCustomAwardTemplate } from './custom_award_grant';
import {
  type CustomAwardTemplatesStore,
  customAwardTemplatesStore,
} from './custom_award_templates_db';
import { customAwardsService } from './custom_awards_bridge';
import { type CustomAwardsStore, customAwardsStore } from './custom_awards_db';
import { getCharacter } from './db';
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
  templates: CustomAwardTemplatesStore;
  ownsCharacter(accountId: number, characterId: number): Promise<boolean>;
  enabled(): boolean;
  achievementRules(): import('../src/sim/private_realm').PrivateRealmAchievementRules | null;
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
    templates: customAwardTemplatesStore(() => db.pool as Pool, REALM),
    ownsCharacter: async (accountId, characterId) =>
      (await db.getCharacter(accountId, characterId)) !== null,
    enabled: () => privateRealmRules()?.achievements.customAwardsEnabled === true,
    achievementRules: () => privateRealmRules()?.achievements ?? null,
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

/** GET /api/custom-awards/given?character=<id>: awards this giver issued. */
async function listGivenHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 200, { enabled: false, awards: [] });
    return;
  }
  const raw = ctx.query.character;
  const characterId = await ownedCharacterId(ctx, rt, Array.isArray(raw) ? raw[0] : raw);
  if (characterId === null) return;
  json(ctx.res, 200, { enabled: true, awards: await rt.store.listGivenBy(characterId) });
}

/** GET /api/custom-awards/public?name=<character>: visible awards on a player. */
async function listPublicHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 200, { enabled: false, awards: [] });
    return;
  }
  const raw = ctx.query.name;
  const name = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (typeof name !== 'string' || name.trim() === '') {
    json(ctx.res, 400, INVALID_INPUT);
    return;
  }
  json(ctx.res, 200, {
    enabled: true,
    awards: await rt.store.listPublicForRecipientName(name),
  });
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
  if (!ok) return json(ctx.res, 404, NOT_FOUND);
  customAwardChanged(characterId);
  json(ctx.res, 200, { ok: true });
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
  if (!ok) return json(ctx.res, 404, NOT_FOUND);
  customAwardChanged(characterId);
  json(ctx.res, 200, { ok: true });
}

const readAccount = requireAccount({ scope: 'read' });
const activeAccount = requireAccount({ scope: 'active' });

/** GET /api/custom-award-templates?character=<id>: templates this giver authored. */
async function listTemplatesHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) {
    json(ctx.res, 200, { enabled: false, templates: [] });
    return;
  }
  const raw = ctx.query.character;
  const characterId = await ownedCharacterId(ctx, rt, Array.isArray(raw) ? raw[0] : raw);
  if (characterId === null) return;
  json(ctx.res, 200, { enabled: true, templates: await rt.templates.listFor(characterId) });
}

/** POST /api/custom-award-templates { character, title, description } */
async function createTemplateHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  const rules = rt.achievementRules();
  if (!rt.enabled() || !rules) return json(ctx.res, 404, NOT_FOUND);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const characterId = await ownedCharacterId(ctx, rt, body.character);
  if (characterId === null) return;
  const draft = draftCustomAwardTemplate(String(body.title ?? ''), String(body.description ?? ''), rules);
  if (!draft.ok) return json(ctx.res, 400, INVALID_INPUT);
  const outcome = await rt.templates.create(
    characterId,
    draft.title,
    draft.titleKey,
    draft.description,
    rules.maxTemplatesPerOwner,
  );
  if (outcome === 'duplicate')
    return json(ctx.res, 409, { error: 'duplicate template', code: 'custom_award.template_duplicate' });
  if (outcome === 'capped')
    return json(ctx.res, 409, { error: 'template cap', code: 'custom_award.template_cap' });
  json(ctx.res, 200, { ok: true });
}

/** DELETE /api/custom-award-templates { character, template } */
async function deleteTemplateHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  if (!rt.enabled()) return json(ctx.res, 404, NOT_FOUND);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const templateId = positiveInt(body.template);
  if (templateId === null) return json(ctx.res, 400, INVALID_INPUT);
  const characterId = await ownedCharacterId(ctx, rt, body.character);
  if (characterId === null) return;
  if (!(await rt.templates.delete(characterId, templateId))) return json(ctx.res, 404, NOT_FOUND);
  json(ctx.res, 200, { ok: true });
}

/** POST /api/custom-awards/issue { character, template, recipient } */
async function issueTemplateHandler(ctx: Ctx): Promise<void> {
  const rt = await useRuntime();
  const rules = rt.achievementRules();
  const svc = customAwardsService();
  if (!rt.enabled() || !rules || !svc) return json(ctx.res, 404, NOT_FOUND);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const templateId = positiveInt(body.template);
  const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
  if (templateId === null || !recipient) return json(ctx.res, 400, INVALID_INPUT);
  const accountId = ctxAccountId(ctx);
  const characterId = await ownedCharacterId(ctx, rt, body.character);
  if (characterId === null) return;
  const row = await getCharacter(accountId, characterId);
  if (!row) return json(ctx.res, 404, NOT_FOUND);
  const template = await rt.templates.get(characterId, templateId);
  if (!template) return json(ctx.res, 404, NOT_FOUND);
  const result = await svc.finishGrant(
    { accountId, characterId, name: row.name },
    recipient,
    template.title,
    template.description,
    `ui:${templateId}`,
  );
  if (result === 'busy') return json(ctx.res, 429, { error: 'busy', code: 'custom_award.busy' });
  if (result === 'disabled') return json(ctx.res, 404, NOT_FOUND);
  if (result.kind !== 'ok') {
    const code =
      result.kind === 'not_found'
        ? 'custom_award.not_found'
        : result.kind === 'self'
          ? 'custom_award.self'
          : result.kind === 'duplicate'
            ? 'custom_award.duplicate'
            : result.kind === 'capped'
              ? 'custom_award.daily_cap'
              : 'deeds.invalid_input';
    return json(ctx.res, 409, { ok: false, code });
  }
  customAwardChanged(result.recipientCharacterId);
  json(ctx.res, 200, { ok: true });
}

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/custom-awards',
    surface: 'api',
    middleware: [readAccount],
    handler: listHandler,
  },
  {
    method: 'GET',
    path: '/api/custom-awards/given',
    surface: 'api',
    middleware: [readAccount],
    handler: listGivenHandler,
  },
  {
    method: 'GET',
    path: '/api/custom-awards/public',
    surface: 'api',
    middleware: [readAccount],
    handler: listPublicHandler,
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
  {
    method: 'GET',
    path: '/api/custom-award-templates',
    surface: 'api',
    middleware: [readAccount],
    handler: listTemplatesHandler,
  },
  {
    method: 'POST',
    path: '/api/custom-award-templates',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: createTemplateHandler,
  },
  {
    method: 'DELETE',
    path: '/api/custom-award-templates',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: deleteTemplateHandler,
  },
  {
    method: 'POST',
    path: '/api/custom-awards/issue',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: issueTemplateHandler,
  },
];
