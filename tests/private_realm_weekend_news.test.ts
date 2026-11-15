// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  gamingWeekendNewsArticleHtml,
  loadGamingWeekendNewsInto,
  paintGamingWeekendNewsPageChrome,
} from '../src/ui/private_realm_weekend_news';
import { setLanguage, t } from '../src/ui/i18n';

setLanguage('en');

describe('private_realm_weekend_news', () => {
  it('renders the welcome copy in the news article', () => {
    const html = gamingWeekendNewsArticleHtml();
    expect(html).toContain('gaming-weekend-news');
    expect(html).toContain(t('gamingWeekend.newsHeadline'));
    expect(html).toContain('news-body__rally');
    expect(html).toContain('Friend Awards');
    expect(html).toContain('news-body__checklist');
    expect(html).toContain(t('gamingWeekend.newsStep4'));
  });

  it('paints the news page chrome titles', () => {
    document.body.innerHTML =
      '<section id="news-view"><h2 class="skeleton-title"></h2><p class="skeleton-desc"></p></section>';
    paintGamingWeekendNewsPageChrome();
    const title = document.querySelector('#news-view .skeleton-title');
    expect(title?.textContent).toBe(t('gamingWeekend.newsPageTitle'));
  });

  it('loads into a host element', () => {
    const host = { innerHTML: '' } as HTMLElement & { innerHTML: string };
    loadGamingWeekendNewsInto(host);
    expect(host.innerHTML).toContain('gaming-weekend-news');
  });
});