// View model for the Book of Deeds award-templates shelf (IWorldDeeds.customAwardTemplates).

import type { CustomAwardTemplateView } from '../world_api/deeds';

export type CustomAwardTemplatesSectionState = 'absent' | 'empty' | 'ready';

export interface CustomAwardTemplateRowModel {
  id: number;
  title: string;
  description: string;
  issuing: boolean;
  sending: boolean;
}

export interface CustomAwardTemplatesSectionModel {
  state: CustomAwardTemplatesSectionState;
  rows: readonly CustomAwardTemplateRowModel[];
  createOpen: boolean;
}

export function customAwardTemplatesSectionModel(
  list: readonly CustomAwardTemplateView[] | null,
  issuingId: number | null,
  createOpen: boolean,
  sendingId: number | null = null,
): CustomAwardTemplatesSectionModel {
  if (list === null) return { state: 'absent', rows: [], createOpen: false };
  const rows = list.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    issuing: issuingId === t.id,
    sending: sendingId === t.id,
  }));
  return {
    state: list.length === 0 && !createOpen ? 'empty' : 'ready',
    rows,
    createOpen,
  };
}

export function applyTemplateCreated(
  list: readonly CustomAwardTemplateView[],
  row: CustomAwardTemplateView,
): CustomAwardTemplateView[] {
  return [row, ...list.filter((t) => t.id !== row.id)];
}

export function applyTemplateDeleted(
  list: readonly CustomAwardTemplateView[],
  templateId: number,
): CustomAwardTemplateView[] {
  return list.filter((t) => t.id !== templateId);
}