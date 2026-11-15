// Award templates a giver character authors in the Book of Deeds, then issues
// to other players (server/custom_award_grant.ts).

import type { Pool } from 'pg';

export const CUSTOM_AWARD_TEMPLATES_SCHEMA = `
CREATE TABLE IF NOT EXISTS custom_award_templates (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  owner_character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_award_templates_owner_title
  ON custom_award_templates (owner_character_id, title_key);
CREATE INDEX IF NOT EXISTS custom_award_templates_owner_time
  ON custom_award_templates (owner_character_id, created_at DESC);
`;

export const LIST_CUSTOM_AWARD_TEMPLATES_SQL = `
SELECT id, title, description, created_at
FROM custom_award_templates
WHERE owner_character_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 100`;

export const INSERT_CUSTOM_AWARD_TEMPLATE_SQL = `
WITH owned AS (
  SELECT count(*)::int AS n FROM custom_award_templates WHERE owner_character_id = $1
)
INSERT INTO custom_award_templates (realm, owner_character_id, title, title_key, description)
SELECT $2, $1, $3, $4, $5 FROM owned WHERE owned.n < $6
ON CONFLICT (owner_character_id, title_key) DO NOTHING
RETURNING id`;

export const DELETE_CUSTOM_AWARD_TEMPLATE_SQL = `
DELETE FROM custom_award_templates WHERE id = $1 AND owner_character_id = $2 RETURNING id`;

export const GET_CUSTOM_AWARD_TEMPLATE_SQL = `
SELECT id, title, title_key, description
FROM custom_award_templates
WHERE id = $1 AND owner_character_id = $2`;

export interface CustomAwardTemplateRow {
  id: number;
  title: string;
  description: string;
  createdAt: number;
}

export interface CustomAwardTemplateRecord {
  id: number;
  title: string;
  titleKey: string;
  description: string;
}

export interface CustomAwardTemplatesStore {
  listFor(ownerCharacterId: number): Promise<CustomAwardTemplateRow[]>;
  create(
    ownerCharacterId: number,
    title: string,
    titleKey: string,
    description: string,
    maxPerOwner: number,
  ): Promise<'ok' | 'duplicate' | 'capped'>;
  delete(ownerCharacterId: number, templateId: number): Promise<boolean>;
  get(ownerCharacterId: number, templateId: number): Promise<CustomAwardTemplateRecord | null>;
}

export function customAwardTemplatesStore(getPool: () => Pool, realm: string): CustomAwardTemplatesStore {
  return {
    async listFor(ownerCharacterId) {
      const { rows } = await getPool().query(LIST_CUSTOM_AWARD_TEMPLATES_SQL, [ownerCharacterId]);
      return rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        description: r.description,
        createdAt: new Date(r.created_at).getTime(),
      }));
    },
    async create(ownerCharacterId, title, titleKey, description, maxPerOwner) {
      const { rows } = await getPool().query(INSERT_CUSTOM_AWARD_TEMPLATE_SQL, [
        ownerCharacterId,
        realm,
        title,
        titleKey,
        description,
        maxPerOwner,
      ]);
      if (rows[0]) return 'ok';
      const dup = await getPool().query(
        `SELECT 1 FROM custom_award_templates WHERE owner_character_id = $1 AND title_key = $2 LIMIT 1`,
        [ownerCharacterId, titleKey],
      );
      return dup.rows[0] ? 'duplicate' : 'capped';
    },
    async delete(ownerCharacterId, templateId) {
      const res = await getPool().query(DELETE_CUSTOM_AWARD_TEMPLATE_SQL, [templateId, ownerCharacterId]);
      return (res.rowCount ?? 0) > 0;
    },
    async get(ownerCharacterId, templateId) {
      const { rows } = await getPool().query(GET_CUSTOM_AWARD_TEMPLATE_SQL, [templateId, ownerCharacterId]);
      const r = rows[0];
      return r
        ? {
            id: Number(r.id),
            title: r.title,
            titleKey: r.title_key,
            description: r.description,
          }
        : null;
    },
  };
}