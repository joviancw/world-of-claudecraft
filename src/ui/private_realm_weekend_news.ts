// Gaming-weekend welcome news for a private realm shell (replaces GitHub
// release notes on the News page and character-select panel).

import { esc } from './esc';
import { t } from './i18n';

const GAMING_WEEKEND_MISSION_STEPS = [
  'gamingWeekend.newsStep1',
  'gamingWeekend.newsStep2',
  'gamingWeekend.newsStep3',
  'gamingWeekend.newsStep4',
  'gamingWeekend.newsStep5',
  'gamingWeekend.newsStep6',
] as const;

function gamingWeekendMissionListHtml(): string {
  const items = GAMING_WEEKEND_MISSION_STEPS.map(
    (key) => `<li>${esc(t(key))}</li>`,
  ).join('');
  return (
    `<p class="news-body__mission-title">${esc(t('gamingWeekend.newsMissionTitle'))}</p>` +
    `<ul class="news-body__checklist">${items}</ul>`
  );
}

function gamingWeekendNewsBodyHtml(): string {
  return (
    `<p>${esc(t('gamingWeekend.newsLead'))}</p>` +
    `<p>${esc(t('gamingWeekend.newsPatchPitch'))}</p>` +
    gamingWeekendMissionListHtml() +
    `<p class="news-body__rally">${esc(t('gamingWeekend.newsRally'))}</p>`
  );
}

export function gamingWeekendNewsArticleHtml(): string {
  return (
    `<article class="news-item gaming-weekend-news">` +
    `<header class="news-item-head"><h3 class="news-item-title">${esc(t('gamingWeekend.newsHeadline'))}</h3></header>` +
    `<div class="news-body">${gamingWeekendNewsBodyHtml()}</div>` +
    `</article>`
  );
}

export function gamingWeekendCharselectNewsHtml(): string {
  return (
    `<article class="news-item gaming-weekend-news cs-weekend-news">` +
    `<h3 class="news-item-title">${esc(t('gamingWeekend.newsHeadline'))}</h3>` +
    `<div class="news-body"><p>${esc(t('gamingWeekend.newsCharselectBlurb'))}</p></div>` +
    `</article>`
  );
}

export function loadGamingWeekendNewsInto(host: HTMLElement | null): void {
  if (!host) return;
  host.innerHTML = gamingWeekendNewsArticleHtml();
}

export function loadGamingWeekendCharselectNewsInto(host: HTMLElement | null): void {
  if (!host) return;
  host.innerHTML = gamingWeekendCharselectNewsHtml();
}

export function paintGamingWeekendNewsPageChrome(): void {
  const title = document.querySelector('#news-view .skeleton-title');
  const desc = document.querySelector('#news-view .skeleton-desc');
  if (title) title.textContent = t('gamingWeekend.newsPageTitle');
  if (desc) desc.textContent = t('gamingWeekend.newsPageDesc');
}