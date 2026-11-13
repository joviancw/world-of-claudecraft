// Player-awarded titles (the private realm's custom achievements,
// server/custom_awards.ts). Unlike every other title they are not content: an
// award is a database row, so its title id is `custom:<awardId>` and its text
// is player-authored. The sim never reads the database. The server hands it
// the character's wearable awards (shown, not rejected) as an id-to-text map
// on the entity, and setActiveTitle accepts a custom id only when that map
// holds it. The text rides the identity wire beside the id
// (server/player_identity_wire.ts) because no client catalog can resolve it.

import type { PlayerMeta } from './sim';
import type { Entity } from './types';

export const CUSTOM_TITLE_PREFIX = 'custom:';

export function isCustomTitleId(id: string): boolean {
  return id.startsWith(CUSTOM_TITLE_PREFIX);
}

export function customTitleId(awardId: number): string {
  return `${CUSTOM_TITLE_PREFIX}${awardId}`;
}

/**
 * Install the character's wearable custom titles, then settle the worn one: a
 * custom title restored from the save (held on meta while the list loads)
 * goes back on the nameplate if it is still owned, and is cleared if it was
 * hidden or rejected since. Other titles are untouched.
 */
export function applyCustomTitles(
  meta: PlayerMeta,
  e: Entity,
  titles: ReadonlyMap<string, string>,
): void {
  e.customTitles = titles;
  const active = meta.activeTitle;
  if (active === null || !isCustomTitleId(active)) return;
  if (titles.has(active)) {
    e.title = active;
  } else {
    meta.activeTitle = null;
    e.title = null;
  }
}
