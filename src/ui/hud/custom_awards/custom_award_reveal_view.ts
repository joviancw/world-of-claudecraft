// DOM contract for the custom-award reveal overlay (player-awarded achievements).

import { type TranslationKey, t } from '../../i18n';

export const CUSTOM_AWARD_REVEAL_MS = 5000;
export const CUSTOM_AWARD_REVEAL_GAP_MS = 250;
export const CUSTOM_AWARD_REVEAL_DEDUPE_MS = 6000;

export interface CustomAwardRevealPayload {
  recipient: string;
  title: string;
  giver: string;
  description?: string;
  isRecipient: boolean;
  motion: boolean;
  playSound: boolean;
  dedupeKey: string;
}

export function customAwardRevealDedupeKey(parts: {
  recipient: string;
  title: string;
  giver: string;
}): string {
  return `${parts.recipient}\0${parts.title}\0${parts.giver}`;
}

/** Book-style golden deed art (same family as friend-award promos). */
export const CUSTOM_AWARD_CREST_ART = '/ui/deeds/dgn_drowned_temple_heroic.webp';

export function buildCustomAwardRevealRoot(doc: Document): HTMLElement {
  const root = doc.createElement('div');
  root.id = 'custom-award-reveal-root';
  root.className = 'custom-award-reveal';
  root.setAttribute('aria-hidden', 'true');
  return root;
}

export function paintCustomAwardRevealCard(
  root: HTMLElement,
  payload: CustomAwardRevealPayload,
): void {
  const crestSize = payload.isRecipient ? 120 : 96;
  const description =
    payload.description && payload.description.trim().length > 0 ? payload.description.trim() : '';
  root.replaceChildren();
  root.classList.toggle('custom-award-reveal--recipient', payload.isRecipient);
  root.classList.toggle('custom-award-reveal--spectator', !payload.isRecipient);
  root.classList.toggle('custom-award-reveal--motion', payload.motion);

  const backdrop = document.createElement('div');
  backdrop.className = 'custom-award-reveal__backdrop';

  const card = document.createElement('div');
  card.className = 'custom-award-reveal__card';
  card.setAttribute('role', 'presentation');

  const glow = document.createElement('div');
  glow.className = 'custom-award-reveal__glow';
  glow.setAttribute('aria-hidden', 'true');

  const sparks = document.createElement('div');
  sparks.className = 'custom-award-reveal__sparks';
  sparks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('span');
    spark.className = 'custom-award-reveal__spark';
    sparks.appendChild(spark);
  }

  const crest = document.createElement('img');
  crest.className = 'custom-award-reveal__crest';
  crest.src = CUSTOM_AWARD_CREST_ART;
  crest.alt = '';
  crest.width = crestSize;
  crest.height = crestSize;
  crest.decoding = 'async';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'custom-award-reveal__eyebrow';
  eyebrow.textContent = t('hudChrome.customAward.revealEyebrow' as TranslationKey);

  const title = document.createElement('h2');
  title.className = 'custom-award-reveal__title';
  title.textContent = payload.title;

  const recipient = document.createElement('p');
  recipient.className = 'custom-award-reveal__recipient';
  recipient.textContent = t('hudChrome.customAward.revealRecipient', { name: payload.recipient });

  const giver = document.createElement('p');
  giver.className = 'custom-award-reveal__giver';
  giver.textContent = t('hudChrome.customAward.revealGiver', { name: payload.giver });

  card.append(glow, sparks, crest, eyebrow, title, recipient, giver);
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'custom-award-reveal__description';
    desc.textContent = description;
    card.appendChild(desc);
  }

  backdrop.appendChild(card);
  root.appendChild(backdrop);
}
