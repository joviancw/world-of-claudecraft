// GET /api/friend-awards/hall: public cross-account board of visible friend awards
// on this realm (private realm with custom awards enabled only).

import type { Pool } from 'pg';
import { listRealmFriendAwardsHallRows } from './custom_awards_db';
import { buildFriendAwardsHallEntries } from './friend_awards_hall_build';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';
import { privateRealmRules } from './private_realm_config';
import { REALM } from './realm';

function customAwardsPublicEnabled(): boolean {
  return privateRealmRules()?.achievements.customAwardsEnabled === true;
}

async function hallHandler(ctx: Ctx): Promise<void> {
  if (!customAwardsPublicEnabled()) {
    json(ctx.res, 200, { enabled: false, entries: [] });
    return;
  }
  const db = await import('./db');
  const rows = await listRealmFriendAwardsHallRows(() => db.pool as Pool, REALM);
  const entries = buildFriendAwardsHallEntries(rows);
  json(ctx.res, 200, { enabled: true, entries });
}

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/friend-awards/hall',
    surface: 'api',
    handler: hallHandler,
  },
];