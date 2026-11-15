import { describe, expect, it } from 'vitest';
import {
  COMMERCE_CHROME_HIDDEN_BODY_CLASS,
  applyCommerceChromeHidden,
  removeGithubShellChrome,
  removePrivateRealmAccountSecurityChrome,
  removeWalletShellChrome,
  removeWebsiteToolsNav,
  removeEpicShellChrome,
  removeSteamShellChrome,
  removeWocExchangeShellChrome,
} from '../src/ui/commerce_chrome_policy';

describe('commerce chrome policy', () => {
  it('stamps the body class that hides Steam wishlist and shell promos', () => {
    const body = { classList: { tokens: [] as string[], add(token: string) { this.tokens.push(token); } } };
    applyCommerceChromeHidden(body);
    expect(body.classList.tokens).toContain(COMMERCE_CHROME_HIDDEN_BODY_CLASS);
  });

  it('removes wallet rows from the static shell', () => {
    const removed: string[] = [];
    const doc = {
      querySelector(selector: string) {
        if (
          selector === '#charselect-panel .cs-wallet-group' ||
          selector === '.cs-wallet-hidden-note' ||
          selector === '.account-wallet-card'
        ) {
          return { remove() { removed.push(selector); } };
        }
        return null;
      },
    } as unknown as Document;
    removeWalletShellChrome(doc);
    expect(removed).toEqual([
      '#charselect-panel .cs-wallet-group',
      '.cs-wallet-hidden-note',
      '.account-wallet-card',
    ]);
  });

  it('removes GitHub outbound links from the shell', () => {
    const removed: Element[] = [];
    const doc = {
      querySelectorAll(selector: string) {
        if (selector.includes('github')) {
          return [{ remove() { removed.push(this as Element); } }] as unknown as NodeListOf<Element>;
        }
        return [] as unknown as NodeListOf<Element>;
      },
    } as unknown as Document;
    removeGithubShellChrome(doc);
    expect(removed).toHaveLength(1);
  });

  it('removes account email/2FA and the Tools nav', () => {
    const removed: string[] = [];
    const doc = {
      getElementById(id: string) {
        if (
          id === 'account-change-email-form' ||
          id === 'account-2fa' ||
          id === 'account-email'
        ) {
          return {
            parentElement:
              id === 'account-email'
                ? { querySelector() { return { remove() { removed.push('hint'); } }; } }
                : null,
            remove() { removed.push(id); },
          };
        }
        return null;
      },
      querySelector(sel: string) {
        if (sel === '.website-tools-item') {
          return { remove() { removed.push('tools'); } };
        }
        return null;
      },
    } as unknown as Document;
    removePrivateRealmAccountSecurityChrome(doc);
    removeWebsiteToolsNav(doc);
    expect(removed).toContain('account-change-email-form');
    expect(removed).toContain('account-2fa');
    expect(removed).toContain('tools');
  });

  it('removes Steam wishlist surfaces and the char-select link card', () => {
    const removed: string[] = [];
    const doc = {
      getElementById(id: string) {
        if (id === 'cs-steam-group') {
          return { remove() { removed.push(id); } };
        }
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector === '.steam-wishlist') {
          return [
            { remove() { removed.push('steam-wishlist-1'); } },
            { remove() { removed.push('steam-wishlist-2'); } },
          ] as unknown as NodeListOf<Element>;
        }
        return [] as unknown as NodeListOf<Element>;
      },
    } as unknown as Document;
    removeSteamShellChrome(doc);
    expect(removed).toContain('cs-steam-group');
    expect(removed.filter((id) => id.startsWith('steam-wishlist'))).toHaveLength(2);
  });

  it('removes the char-select Link Epic card', () => {
    const removed: string[] = [];
    const doc = {
      getElementById(id: string) {
        if (id === 'cs-epic-group') {
          return { remove() { removed.push(id); } };
        }
        return null;
      },
    } as unknown as Document;
    removeEpicShellChrome(doc);
    expect(removed).toEqual(['cs-epic-group']);
  });

  it('removes the char-select $WOC Exchange launcher and panel', () => {
    const removed: string[] = [];
    const doc = {
      getElementById(id: string) {
        if (id === 'btn-charselect-woc-market' || id === 'charselect-woc-market') {
          return { remove() { removed.push(id); } };
        }
        return null;
      },
    } as unknown as Document;
    removeWocExchangeShellChrome(doc);
    expect(removed).toEqual(['btn-charselect-woc-market', 'charselect-woc-market']);
  });
});