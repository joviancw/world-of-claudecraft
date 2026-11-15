// Hides stock monetization chrome on a private realm (PRIVATE_REALM=1 on the
// server, advertised as status.private_realm): WOC Store / daily rewards chest,
// cosmetics shop launcher, referral and stamp card surfaces, rotating store promo
// banners, Steam wishlist links on the shell, outbound GitHub community links,
// every $WOC / Solana wallet surface (character select, account portal, player card,
// Claudium, World Market, and Riftwright), account email/2FA tools, the Tools nav,
// the char-select $WOC Exchange, and Steam / Epic link cards on character select.

import { syncHomepageHeaderReserve } from './homepage_header_reserve';

export const COMMERCE_CHROME_HIDDEN_BODY_CLASS = 'commerce-chrome-hidden';

/** Safe before Hud constructor parameter properties run (body class is set in main before Hud). */
export function isCommerceChromeHiddenOnDocument(
  doc: Document | undefined = globalThis.document,
): boolean {
  return doc?.body?.classList.contains(COMMERCE_CHROME_HIDDEN_BODY_CLASS) ?? false;
}

export function applyCommerceChromeHidden(
  body: { classList: { add(token: string): void } } | null =
    globalThis.document?.body ?? null,
): void {
  body?.classList.add(COMMERCE_CHROME_HIDDEN_BODY_CLASS);
}

/** Removes pre-game wallet rows from the static shell (idempotent). */
export function removeWalletShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  doc.querySelector('#charselect-panel .cs-wallet-group')?.remove();
  doc.querySelector('.cs-wallet-hidden-note')?.remove();
  doc.querySelector('.account-wallet-card')?.remove();
}

const GITHUB_SHELL_SELECTOR =
  'a.shell-github-link, #cs-github-group, .news-link[href*="github.com"], .news-view-all a[href*="github.com"]';

/** Removes GitHub outbound chrome from the static shell (idempotent). */
export function removeGithubShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  for (const el of doc.querySelectorAll(GITHUB_SHELL_SELECTOR)) {
    el.remove();
  }
}

/** Account portal knobs we hide on a private gaming-weekend realm. */
export function removePrivateRealmAccountSecurityChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  doc.getElementById('account-change-email-form')?.remove();
  doc.getElementById('account-2fa')?.remove();
  const hint = doc.querySelector('#account-email')?.parentElement?.querySelector('.account-hint');
  if (hint && typeof (hint as Element).remove === 'function') hint.remove();
}

export function removeWebsiteToolsNav(
  doc: Document | undefined = globalThis.document,
): void {
  doc?.querySelector('.website-tools-item')?.remove();
}

/** Char-select read-only $WOC Exchange launcher + panel (idempotent). */
export function removeWocExchangeShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  doc.getElementById('btn-charselect-woc-market')?.remove();
  doc.getElementById('charselect-woc-market')?.remove();
}

/** Steam wishlist links + char-select Link Steam card (idempotent). */
export function removeSteamShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  doc.getElementById('cs-steam-group')?.remove();
  for (const el of doc.querySelectorAll('.steam-wishlist')) {
    el.remove();
  }
}

/** Char-select Link Epic card (idempotent). */
export function removeEpicShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  doc.getElementById('cs-epic-group')?.remove();
}

export function applyPrivateRealmShellChrome(
  doc: Document | undefined = globalThis.document,
): void {
  removePrivateRealmAccountSecurityChrome(doc);
  removeWebsiteToolsNav(doc);
  removeWocExchangeShellChrome(doc);
  removeSteamShellChrome(doc);
  removeEpicShellChrome(doc);
}

export async function syncCommerceChromeFromPrivateRealmAdvert(
  advert: () => Promise<boolean>,
  body: { classList: { add(token: string): void } } | null =
    globalThis.document?.body ?? null,
  doc: Document | undefined = globalThis.document,
): Promise<boolean> {
  try {
    const hidden = await advert();
    if (hidden) {
      applyCommerceChromeHidden(body);
      removeWalletShellChrome(doc);
      removeGithubShellChrome(doc);
      applyPrivateRealmShellChrome(doc);
      syncHomepageHeaderReserve(doc);
    }
    return hidden;
  } catch {
    return false;
  }
}