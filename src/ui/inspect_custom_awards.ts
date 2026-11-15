// Player inspect: visible custom awards on another character.

import type { CustomAwardView } from '../world_api/deeds';
import { esc } from './esc';
import { formatDateTime, t } from './i18n';

export function inspectCustomAwardsHtml(awards: readonly CustomAwardView[]): string {
  if (awards.length === 0) return '';
  const rows = awards
    .map((a) => {
      const desc = a.description
        ? `<div class="deed-custom-award-desc">${esc(a.description)}</div>`
        : '';
      const by = esc(
        t('hudChrome.customAward.givenBy', {
          name: a.giverName,
          date: formatDateTime(a.createdAt, { dateStyle: 'medium' }),
        }),
      );
      return (
        `<div class="deed-custom-award">` +
        `<div class="deed-custom-award-title">${esc(a.title)}</div>` +
        desc +
        `<div class="deed-custom-award-by">${by}</div>` +
        `</div>`
      );
    })
    .join('');
  return (
    `<div class="inspect-custom-awards">` +
    `<div class="inspect-equip-title ui-h">${esc(t('hudChrome.customAward.inspectSectionTitle'))}</div>` +
    `<div class="inspect-custom-award-list">${rows}</div>` +
    `</div>`
  );
}