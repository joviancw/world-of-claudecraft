// SQL boundary for player-awarded achievements (the *_db.ts convention; the
// service is server/custom_awards.ts). One row per award, keyed by stable
// character ids: the recipient row cascades with its character, the giver id
// is nulled on delete while the giver's name at award time is kept, so an
// award outlives the character that gave it.
//
// Retention: deliberately keep-forever, with no retention registration. Rows
// are human-rate (the per-giver daily cap bounds the table at cap x active
// characters per day) and each one is a player's keepsake; deleting old rows
// would erase a real award. A rejected award keeps its row (rejected = true)
// so the same giver cannot re-mint the title the recipient turned down.
//
// Takes a pool getter (read at query time, never at construction): db.ts
// applies CUSTOM_AWARDS_SCHEMA at boot, so this module stays './db'-free.

import type { Pool } from 'pg';

export const CUSTOM_AWARDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS custom_awards (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  recipient_character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  giver_character_id INT REFERENCES characters(id) ON DELETE SET NULL,
  giver_name TEXT NOT NULL,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  hidden BOOLEAN NOT NULL DEFAULT false,
  rejected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_awards_recipient_title
  ON custom_awards (recipient_character_id, title_key);
CREATE INDEX IF NOT EXISTS custom_awards_giver_time
  ON custom_awards (giver_character_id, created_at DESC);
`;

export const FIND_AWARD_RECIPIENT_SQL = `
SELECT id, account_id, name FROM characters
WHERE realm = $1 AND lower(name) = lower($2)
LIMIT 1`;

// The daily cap and the duplicate rule land in ONE statement: the insert runs
// only while the giver is under the cap, and the unique index turns a repeat
// title into no row. An empty RETURNING is disambiguated by the count read.
export const INSERT_CUSTOM_AWARD_SQL = `
WITH recent AS (
  SELECT count(*)::int AS n FROM custom_awards
  WHERE giver_character_id = $2 AND created_at > now() - interval '1 day'
)
INSERT INTO custom_awards
  (realm, giver_character_id, recipient_character_id, giver_name, title, title_key, description)
SELECT $1, $2, $3, $4, $5, $6, $7 FROM recent WHERE recent.n < $8
ON CONFLICT (recipient_character_id, title_key) DO NOTHING
RETURNING id`;

export const COUNT_RECENT_AWARDS_SQL = `
SELECT count(*)::int AS n FROM custom_awards
WHERE giver_character_id = $1 AND created_at > now() - interval '1 day'`;

// The giver's CURRENT name when the character still exists (a rename shows
// through), the name at award time otherwise.
export const LIST_CUSTOM_AWARDS_SQL = `
SELECT a.id, a.title, a.description, a.hidden, a.created_at,
       COALESCE(g.name, a.giver_name) AS giver_name
FROM custom_awards a
LEFT JOIN characters g ON g.id = a.giver_character_id
WHERE a.recipient_character_id = $1 AND NOT a.rejected
ORDER BY a.created_at DESC, a.id DESC
LIMIT 200`;

export const LIST_GIVER_CUSTOM_AWARDS_SQL = `
SELECT a.id, a.title, a.description, a.created_at, r.name AS recipient_name
FROM custom_awards a
JOIN characters r ON r.id = a.recipient_character_id
WHERE a.giver_character_id = $1 AND NOT a.rejected
ORDER BY a.created_at DESC, a.id DESC
LIMIT 200`;

export const LIST_PUBLIC_CUSTOM_AWARDS_SQL = `
SELECT a.id, a.title, a.description, a.created_at,
       COALESCE(g.name, a.giver_name) AS giver_name
FROM custom_awards a
LEFT JOIN characters g ON g.id = a.giver_character_id
JOIN characters r ON r.id = a.recipient_character_id
WHERE r.realm = $1 AND lower(r.name) = lower($2) AND NOT a.rejected AND NOT a.hidden
ORDER BY a.created_at DESC, a.id DESC
LIMIT 50`;

/** Visible friend awards for many leaderboard recipients (one round trip). */
export const LIST_PUBLIC_CUSTOM_AWARDS_FOR_RECIPIENTS_SQL = `
SELECT a.recipient_character_id, a.title,
       COALESCE(g.name, a.giver_name) AS giver_name
FROM custom_awards a
LEFT JOIN characters g ON g.id = a.giver_character_id
WHERE a.recipient_character_id = ANY($1::int[])
  AND NOT a.rejected AND NOT a.hidden
ORDER BY a.recipient_character_id, a.created_at DESC, a.id DESC`;

export const LEADERBOARD_FRIEND_AWARDS_PER_CHARACTER = 24;

/** Every visible friend award on this realm (for the public hall page). */
export const LIST_REALM_FRIEND_AWARDS_HALL_SQL = `
SELECT r.account_id, r.name AS recipient_name,
       a.title, COALESCE(g.name, a.giver_name) AS giver_name
FROM custom_awards a
JOIN characters r ON r.id = a.recipient_character_id
LEFT JOIN characters g ON g.id = a.giver_character_id
WHERE r.realm = $1 AND NOT a.rejected AND NOT a.hidden
ORDER BY r.account_id, r.name, a.created_at DESC, a.id DESC
LIMIT $2`;

export const FRIEND_AWARDS_HALL_ROW_LIMIT = 5000;

export interface FriendAwardsHallDbRow {
  accountId: number;
  recipientName: string;
  title: string;
  giverName: string;
}

export async function listRealmFriendAwardsHallRows(
  getPool: () => Pool,
  realm: string,
  rowLimit = FRIEND_AWARDS_HALL_ROW_LIMIT,
): Promise<FriendAwardsHallDbRow[]> {
  const limit = Math.max(1, Math.min(rowLimit, FRIEND_AWARDS_HALL_ROW_LIMIT));
  const { rows } = await getPool().query(LIST_REALM_FRIEND_AWARDS_HALL_SQL, [realm, limit]);
  const out: FriendAwardsHallDbRow[] = [];
  for (const row of rows) {
    const accountId = Number(row.account_id);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) continue;
    const recipientName = typeof row.recipient_name === 'string' ? row.recipient_name : '';
    const title = typeof row.title === 'string' ? row.title : '';
    const giverName = typeof row.giver_name === 'string' ? row.giver_name : '';
    if (!recipientName || !title) continue;
    out.push({ accountId, recipientName, title, giverName });
  }
  return out;
}

export interface FriendAwardLeaderboardRow {
  title: string;
  giverName: string;
}

export async function listPublicCustomAwardsForRecipients(
  getPool: () => Pool,
  recipientCharacterIds: readonly number[],
  perCharacter = LEADERBOARD_FRIEND_AWARDS_PER_CHARACTER,
): Promise<Map<number, FriendAwardLeaderboardRow[]>> {
  const ids = recipientCharacterIds.filter((id) => Number.isInteger(id) && id > 0);
  const out = new Map<number, FriendAwardLeaderboardRow[]>();
  if (ids.length === 0) return out;
  const { rows } = await getPool().query(LIST_PUBLIC_CUSTOM_AWARDS_FOR_RECIPIENTS_SQL, [ids]);
  const cap = Math.max(1, perCharacter);
  for (const row of rows) {
    const id = Number(row.recipient_character_id);
    if (!Number.isInteger(id)) continue;
    let list = out.get(id);
    if (!list) {
      list = [];
      out.set(id, list);
    }
    if (list.length >= cap) continue;
    const title = typeof row.title === 'string' ? row.title : '';
    const giverName = typeof row.giver_name === 'string' ? row.giver_name : '';
    if (!title) continue;
    list.push({ title, giverName });
  }
  return out;
}

export const SET_CUSTOM_AWARD_HIDDEN_SQL = `
UPDATE custom_awards SET hidden = $3
WHERE id = $1 AND recipient_character_id = $2 AND NOT rejected`;

export const REJECT_CUSTOM_AWARD_SQL = `
UPDATE custom_awards SET rejected = true, hidden = true
WHERE id = $1 AND recipient_character_id = $2 AND NOT rejected`;

export interface AwardRecipient {
  characterId: number;
  accountId: number;
  name: string;
}

export interface CustomAwardInsert {
  giverCharacterId: number;
  giverName: string;
  recipientCharacterId: number;
  title: string;
  titleKey: string;
  description: string;
  dailyCap: number;
}

export type CustomAwardInsertResult =
  | { kind: 'ok'; id: number }
  | { kind: 'duplicate' }
  | { kind: 'capped' };

export interface CustomAwardRow {
  id: number;
  title: string;
  description: string;
  giverName: string;
  hidden: boolean;
  createdAt: number;
}

export interface CustomAwardGivenRow {
  id: number;
  title: string;
  description: string;
  recipientName: string;
  createdAt: number;
}

export interface CustomAwardsStore {
  findRecipient(name: string): Promise<AwardRecipient | null>;
  insert(award: CustomAwardInsert): Promise<CustomAwardInsertResult>;
  listFor(recipientCharacterId: number): Promise<CustomAwardRow[]>;
  listGivenBy(giverCharacterId: number): Promise<CustomAwardGivenRow[]>;
  listPublicForRecipientName(recipientName: string): Promise<CustomAwardRow[]>;
  setHidden(recipientCharacterId: number, awardId: number, hidden: boolean): Promise<boolean>;
  reject(recipientCharacterId: number, awardId: number): Promise<boolean>;
}

export function customAwardsStore(getPool: () => Pool, realm: string): CustomAwardsStore {
  return {
    async findRecipient(name) {
      const { rows } = await getPool().query(FIND_AWARD_RECIPIENT_SQL, [realm, name.trim()]);
      const row = rows[0];
      return row
        ? { characterId: Number(row.id), accountId: Number(row.account_id), name: row.name }
        : null;
    },
    async insert(a) {
      const { rows } = await getPool().query(INSERT_CUSTOM_AWARD_SQL, [
        realm,
        a.giverCharacterId,
        a.recipientCharacterId,
        a.giverName,
        a.title,
        a.titleKey,
        a.description,
        a.dailyCap,
      ]);
      if (rows[0]) return { kind: 'ok', id: Number(rows[0].id) };
      const recent = await getPool().query(COUNT_RECENT_AWARDS_SQL, [a.giverCharacterId]);
      return Number(recent.rows[0]?.n ?? 0) >= a.dailyCap
        ? { kind: 'capped' }
        : { kind: 'duplicate' };
    },
    async listFor(recipientCharacterId) {
      const { rows } = await getPool().query(LIST_CUSTOM_AWARDS_SQL, [recipientCharacterId]);
      return rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        description: r.description,
        giverName: r.giver_name,
        hidden: r.hidden === true,
        createdAt: new Date(r.created_at).getTime(),
      }));
    },
    async listGivenBy(giverCharacterId) {
      const { rows } = await getPool().query(LIST_GIVER_CUSTOM_AWARDS_SQL, [giverCharacterId]);
      return rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        description: r.description,
        recipientName: r.recipient_name,
        createdAt: new Date(r.created_at).getTime(),
      }));
    },
    async listPublicForRecipientName(recipientName) {
      const { rows } = await getPool().query(LIST_PUBLIC_CUSTOM_AWARDS_SQL, [
        realm,
        recipientName.trim(),
      ]);
      return rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        description: r.description,
        giverName: r.giver_name,
        hidden: false,
        createdAt: new Date(r.created_at).getTime(),
      }));
    },
    async setHidden(recipientCharacterId, awardId, hidden) {
      const res = await getPool().query(SET_CUSTOM_AWARD_HIDDEN_SQL, [
        awardId,
        recipientCharacterId,
        hidden,
      ]);
      return (res.rowCount ?? 0) > 0;
    },
    async reject(recipientCharacterId, awardId) {
      const res = await getPool().query(REJECT_CUSTOM_AWARD_SQL, [awardId, recipientCharacterId]);
      return (res.rowCount ?? 0) > 0;
    },
  };
}
