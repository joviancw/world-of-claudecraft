// Book of Deeds shelf: awards this character granted to others.

import type { CustomAwardGivenView, CustomAwardsSource } from '../world_api/deeds';
import { formatDateTime, t } from './i18n';

export const CUSTOM_AWARDS_GIVEN_SLOT_CLASS = 'deeds-custom-awards-given';
export const CUSTOM_AWARDS_GIVEN_SLOT_HTML = `<div class="${CUSTOM_AWARDS_GIVEN_SLOT_CLASS}"></div>`;

export class CustomAwardsGivenSection {
  private list: readonly CustomAwardGivenView[] | null = null;
  private slot: Element | null = null;
  private fetchSeq = 0;

  constructor(private readonly source: () => CustomAwardsSource | null) {}

  refresh(): void {
    const src = this.source();
    const seq = ++this.fetchSeq;
    this.list = null;
    this.paint();
    if (!src) return;
    void src.listGiven().then((list) => {
      if (seq !== this.fetchSeq) return;
      this.list = list;
      this.paint();
    });
  }

  mount(slot: Element | null): void {
    this.slot = slot;
    this.paint();
  }

  private paint(): void {
    const slot = this.slot;
    if (!slot || !slot.isConnected) return;
    slot.replaceChildren();
    if (this.list === null) return;
    const doc = slot.ownerDocument;
    const group = doc.createElement('div');
    group.className = 'deeds-titles deeds-custom-award-given-list';
    group.setAttribute('role', 'group');
    const head = doc.createElement('h3');
    head.className = 'deeds-picker-head';
    head.id = 'deeds-custom-awards-given-head';
    head.textContent = t('hudChrome.customAward.givenSectionTitle');
    group.setAttribute('aria-labelledby', head.id);
    group.append(head);
    if (this.list.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'deeds-empty';
      empty.textContent = t('hudChrome.customAward.givenEmpty');
      group.append(empty);
    } else {
      for (const row of this.list) group.append(this.rowEl(doc, row));
    }
    slot.append(group);
  }

  private rowEl(doc: Document, row: CustomAwardGivenView): HTMLElement {
    const el = doc.createElement('div');
    el.className = 'deed-custom-award';
    const title = doc.createElement('div');
    title.className = 'deed-custom-award-title';
    title.textContent = row.title;
    el.append(title);
    if (row.description) {
      const desc = doc.createElement('div');
      desc.className = 'deed-custom-award-desc';
      desc.textContent = row.description;
      el.append(desc);
    }
    const by = doc.createElement('div');
    by.className = 'deed-custom-award-by';
    by.textContent = t('hudChrome.customAward.givenTo', {
      name: row.recipientName,
      date: formatDateTime(row.createdAt, { dateStyle: 'medium' }),
    });
    el.append(by);
    return el;
  }
}