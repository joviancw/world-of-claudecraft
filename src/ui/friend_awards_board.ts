// Home-page friend-awards hall (all accounts on this realm).
//
// Mirrors highscore_board.ts: host-agnostic HTML builders plus a thin loader with
// one in-flight guard.

import type { FriendAwardsHallEntry } from '../world_api/friend_awards_hall';
import { esc } from './esc';
import { formatNumber, t } from './i18n';

function formatAwardsCell(entry: FriendAwardsHallEntry): string {
  const recipientNames = new Set(entry.awards.map((a) => a.recipientName));
  const multi = recipientNames.size > 1;
  return entry.awards
    .map((a) => {
      const core = `${a.title} (${a.giverName})`;
      return multi ? `${a.recipientName}: ${core}` : core;
    })
    .join('; ');
}

function headHtml(): string {
  return (
    `<div class="fa-row fa-head">` +
    `<span class="fa-rank">${esc(t('game.leaderboard.rank'))}</span>` +
    `<span class="fa-name">${esc(t('friendAwards.accountCol'))}</span>` +
    `<span class="fa-count">${esc(t('friendAwards.countCol'))}</span>` +
    `<span class="fa-awards">${esc(t('friendAwards.awardsCol'))}</span></div>`
  );
}

export function friendAwardsRowHtml(rank: number, entry: FriendAwardsHallEntry): string {
  const countLabel = t('friendAwards.countCol');
  const awardsLabel = t('friendAwards.awardsCol');
  const awardsText = formatAwardsCell(entry);
  return (
    `<div class="fa-row${rank <= 3 ? ' fa-top' : ''}">` +
    `<span class="fa-rank">${formatNumber(rank, { maximumFractionDigits: 0 })}</span>` +
    `<span class="fa-name">${esc(entry.displayName)}</span>` +
    `<span class="fa-count" data-label="${esc(countLabel)}">${formatNumber(entry.awardCount, { maximumFractionDigits: 0 })}</span>` +
    `<span class="fa-awards" data-label="${esc(awardsLabel)}">${esc(awardsText)}</span></div>`
  );
}

export function friendAwardsBoardHtml(entries: FriendAwardsHallEntry[]): string {
  return (
    headHtml() +
    entries.map((entry, index) => friendAwardsRowHtml(index + 1, entry)).join('')
  );
}

export function friendAwardsLoadingHtml(): string {
  return `<div class="fa-loading">${esc(t('game.leaderboard.loading'))}</div>`;
}

export function friendAwardsEmptyHtml(): string {
  return `<div class="fa-empty">${esc(t('friendAwards.empty'))}</div>`;
}

export function friendAwardsErrorHtml(): string {
  return `<div class="fa-error">${esc(t('game.leaderboard.retry'))}</div>`;
}

export function friendAwardsDisabledHtml(): string {
  return `<div class="fa-empty">${esc(t('friendAwards.unavailable'))}</div>`;
}

let friendAwardsLoading = false;

export function syncFriendAwardsNavVisible(visible: boolean): void {
  document.getElementById('nav-item-friend-awards')?.toggleAttribute('hidden', !visible);
}

export async function loadFriendAwardsInto(
  host: HTMLElement | null,
  fetchHall: () => Promise<{ enabled: boolean; entries: FriendAwardsHallEntry[] }>,
): Promise<void> {
  if (!host || friendAwardsLoading) return;
  friendAwardsLoading = true;
  host.innerHTML = friendAwardsLoadingHtml();
  let enabled = false;
  let entries: FriendAwardsHallEntry[] = [];
  try {
    const data = await fetchHall();
    enabled = data.enabled === true;
    entries = data.entries ?? [];
  } catch {
    host.innerHTML = friendAwardsErrorHtml();
    friendAwardsLoading = false;
    return;
  }
  friendAwardsLoading = false;
  if (!enabled) {
    host.innerHTML = friendAwardsDisabledHtml();
    syncFriendAwardsNavVisible(false);
    return;
  }
  if (entries.length === 0) {
    host.innerHTML = friendAwardsEmptyHtml();
    return;
  }
  host.innerHTML = friendAwardsBoardHtml(entries);
}