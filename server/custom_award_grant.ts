// Shared grant path for player-awarded achievements: the /award chat command
// and the Deeds UI issue action both land here.

import type { CustomAwardsStore } from './custom_awards_db';
import type { CustomAwardLimits } from './custom_award_command';
import { cleanCustomAwardText } from './custom_award_command';

export type CustomAwardGrantResult =
  | { kind: 'ok'; awardId: number; recipientCharacterId: number; recipientName: string }
  | { kind: 'not_found' }
  | { kind: 'self' }
  | { kind: 'duplicate' }
  | { kind: 'capped' }
  | { kind: 'invalid' };

export interface CustomAwardGrantInput {
  giverCharacterId: number;
  giverAccountId: number;
  giverName: string;
  recipientName: string;
  title: string;
  description: string;
  limits: CustomAwardLimits;
  dailyCap: number;
}

export function cleanAwardTemplateText(raw: string): string {
  return cleanCustomAwardText(raw);
}

export function titleKeyFromTitle(title: string): string {
  return title.toLowerCase();
}

/** Validate giver-owned template text (no recipient yet). */
export function draftCustomAwardTemplate(
  titleRaw: string,
  descriptionRaw: string,
  limits: CustomAwardLimits,
): { ok: true; title: string; titleKey: string; description: string } | { ok: false } {
  const title = cleanCustomAwardText(titleRaw);
  const description = cleanCustomAwardText(descriptionRaw);
  if (!title || title.length > limits.maxTitleLength) return { ok: false };
  if (description.length > limits.maxDescriptionLength) return { ok: false };
  return { ok: true, title, titleKey: titleKeyFromTitle(title), description };
}

export async function grantCustomAward(
  store: CustomAwardsStore,
  input: CustomAwardGrantInput,
): Promise<CustomAwardGrantResult> {
  const title = cleanCustomAwardText(input.title);
  const description = cleanCustomAwardText(input.description);
  if (!title || title.length > input.limits.maxTitleLength) return { kind: 'invalid' };
  if (description.length > input.limits.maxDescriptionLength) return { kind: 'invalid' };
  const recipient = await store.findRecipient(input.recipientName);
  if (!recipient) return { kind: 'not_found' };
  if (
    recipient.characterId === input.giverCharacterId ||
    recipient.accountId === input.giverAccountId
  ) {
    return { kind: 'self' };
  }
  const result = await store.insert({
    giverCharacterId: input.giverCharacterId,
    giverName: input.giverName,
    recipientCharacterId: recipient.characterId,
    title,
    titleKey: titleKeyFromTitle(title),
    description,
    dailyCap: input.dailyCap,
  });
  if (result.kind === 'capped') return { kind: 'capped' };
  if (result.kind === 'duplicate') return { kind: 'duplicate' };
  return {
    kind: 'ok',
    awardId: result.id,
    recipientCharacterId: recipient.characterId,
    recipientName: recipient.name,
  };
}