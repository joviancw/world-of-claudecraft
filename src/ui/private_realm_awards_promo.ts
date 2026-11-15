// Desktop-web promo above chat on a private realm (reuses the WOC Store card
// chrome). Opens the Book of Deeds titles shelf where players create and issue
// custom awards.

import { t } from './i18n';
import {
  mountStorePromoCard,
  type StorePromoCardController,
  type StorePromoCardLabels,
} from './store_promo_card';

export const PRIVATE_REALM_AWARDS_PROMO_ID = 'gaming-weekend-awards';

export const PRIVATE_REALM_AWARDS_PROMO_IMAGE = '/ui/deeds/dgn_drowned_temple_heroic.webp';

export function privateRealmAwardsPromoLabels(): StorePromoCardLabels {
  return {
    open: t('hudChrome.customAward.gamingWeekendPromoOpen'),
    close: t('hudChrome.customAward.gamingWeekendPromoClose'),
    season: t('hudChrome.customAward.gamingWeekendPromoEyebrow'),
    title: t('hudChrome.customAward.gamingWeekendPromoTitle'),
    cta: t('hudChrome.customAward.gamingWeekendPromoCta'),
  };
}

export interface PrivateRealmAwardsPromoDeps {
  openDeedsTitles(): void;
  returnFocusTo(): HTMLElement | null;
  onDismiss?(): void;
}

export function mountPrivateRealmAwardsPromo(
  host: HTMLElement,
  deps: PrivateRealmAwardsPromoDeps,
): StorePromoCardController {
  const controller = mountStorePromoCard(host, {
    slides: [
      {
        id: PRIVATE_REALM_AWARDS_PROMO_ID,
        image: PRIVATE_REALM_AWARDS_PROMO_IMAGE,
        labels: privateRealmAwardsPromoLabels(),
        onOpen: deps.openDeedsTitles,
      },
    ],
    returnFocusTo: deps.returnFocusTo,
    onDismiss: deps.onDismiss,
  });
  host.querySelector('.store-promo-card')?.classList.add('store-promo-card--gaming-weekend');
  return controller;
}