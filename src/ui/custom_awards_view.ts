// The pure model behind the Book of Deeds "Awarded by Friends" section (the
// private realm's player-awarded achievements, IWorldDeeds.customAwards).
// DOM-free so a Vitest drives it directly; custom_awards_section.ts paints it.

import type { CustomAwardView } from '../world_api/deeds';

export interface CustomAwardRowModel {
  id: number;
  title: string;
  description: string;
  giverName: string;
  createdAt: number;
  hidden: boolean;
  // The first Reject press arms this row; only a second press rejects.
  confirmingReject: boolean;
}

export type CustomAwardsSectionModel =
  | { state: 'absent' }
  | { state: 'empty' }
  | { state: 'rows'; rows: CustomAwardRowModel[] };

/** null list = the host has no awards surface (offline, or not a private
 *  realm): the section is not shown at all. Shown awards come first, hidden
 *  ones after; newest first within each group. */
export function customAwardsSectionModel(
  list: readonly CustomAwardView[] | null,
  confirmingId: number | null,
): CustomAwardsSectionModel {
  if (list === null) return { state: 'absent' };
  if (list.length === 0) return { state: 'empty' };
  const rows = [...list]
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.createdAt - a.createdAt || b.id - a.id)
    .map((a) => ({ ...a, confirmingReject: a.id === confirmingId }));
  return { state: 'rows', rows };
}

/** The local mirror after a confirmed server write. */
export function applyCustomAwardHidden(
  list: readonly CustomAwardView[],
  id: number,
  hidden: boolean,
): CustomAwardView[] {
  return list.map((a) => (a.id === id ? { ...a, hidden } : a));
}

export function applyCustomAwardRejected(
  list: readonly CustomAwardView[],
  id: number,
): CustomAwardView[] {
  return list.filter((a) => a.id !== id);
}
