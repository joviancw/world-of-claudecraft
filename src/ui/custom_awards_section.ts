// The Book of Deeds "Awarded by Friends" section painter. The deeds window
// rebuilds its markup wholesale, so it leaves an empty slot and calls mount()
// after every rebuild; this painter keeps the fetched list and repaints into
// whichever slot is current. Every award string is player-authored, so it is
// written through textContent only, never markup. A shown award can also be
// worn as the title (`custom:<id>`); the server validates ownership.

import { customTitleId } from '../sim/custom_titles';
import type { CustomAwardsSource, CustomAwardView } from '../world_api/deeds';
import {
  applyCustomAwardHidden,
  applyCustomAwardRejected,
  type CustomAwardRowModel,
  customAwardsSectionModel,
} from './custom_awards_view';
import { rememberCustomTitleText } from './custom_title_text';
import { formatDateTime, t } from './i18n';

export const CUSTOM_AWARDS_SLOT_CLASS = 'deeds-custom-awards';
export const CUSTOM_AWARDS_SLOT_HTML = `<div class="${CUSTOM_AWARDS_SLOT_CLASS}"></div>`;

/** The worn-title half of the deeds facet (IWorldDeeds activeTitle and
 *  setActiveTitle). */
export interface CustomAwardTitleHost {
  readonly activeTitle: string | null;
  setActiveTitle(id: string | null): void;
}

export class CustomAwardsSection {
  private list: readonly CustomAwardView[] | null = null;
  private confirmingId: number | null = null;
  private slot: Element | null = null;
  private fetchSeq = 0;
  private failed = false;
  // The title just picked here, shown until the next refresh so the button
  // flips at once instead of waiting for the server echo.
  private pendingWorn: string | null | undefined = undefined;

  constructor(
    private readonly source: () => CustomAwardsSource | null,
    private readonly titles: () => CustomAwardTitleHost | null = () => null,
  ) {}

  /** One fetch per window open; a stale answer after a reopen is dropped. */
  refresh(): void {
    const src = this.source();
    const seq = ++this.fetchSeq;
    this.list = null;
    this.confirmingId = null;
    this.failed = false;
    this.pendingWorn = undefined;
    this.paint();
    if (!src) return;
    void src
      .list()
      .then((list) => {
        if (seq !== this.fetchSeq) return;
        for (const a of list ?? []) rememberCustomTitleText(customTitleId(a.id), a.title);
        this.list = list;
        this.paint();
      })
      .catch(() => {
        /* null-on-failure is the facet contract: the section stays absent */
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
    const worn =
      this.pendingWorn !== undefined ? this.pendingWorn : (this.titles()?.activeTitle ?? null);
    const model = customAwardsSectionModel(this.list, this.confirmingId, worn);
    if (model.state === 'absent') return;
    const doc = slot.ownerDocument;
    const group = doc.createElement('div');
    group.className = 'deeds-titles deeds-custom-award-list';
    group.setAttribute('role', 'group');
    const head = doc.createElement('h3');
    head.className = 'deeds-picker-head';
    head.id = 'deeds-custom-awards-head';
    head.textContent = t('hudChrome.customAward.sectionTitle');
    group.setAttribute('aria-labelledby', head.id);
    group.append(head);
    if (model.state === 'empty') {
      const empty = doc.createElement('div');
      empty.className = 'deeds-empty';
      empty.textContent = t('hudChrome.customAward.empty');
      group.append(empty);
    } else {
      for (const row of model.rows) group.append(this.rowEl(doc, row));
    }
    if (this.failed) {
      const err = doc.createElement('div');
      err.className = 'deeds-empty';
      err.setAttribute('role', 'status');
      err.textContent = t('hudChrome.customAward.actionFailed');
      group.append(err);
    }
    slot.append(group);
  }

  private rowEl(doc: Document, row: CustomAwardRowModel): HTMLElement {
    const el = doc.createElement('div');
    el.className = `deed-custom-award${row.hidden ? ' is-hidden' : ''}`;
    el.dataset.customAward = String(row.id);
    const title = doc.createElement('div');
    title.className = 'deed-custom-award-title';
    title.textContent = row.hidden
      ? t('hudChrome.customAward.hiddenTitle', { title: row.title })
      : row.title;
    el.append(title);
    if (row.description) {
      const desc = doc.createElement('div');
      desc.className = 'deed-custom-award-desc';
      desc.textContent = row.description;
      el.append(desc);
    }
    const by = doc.createElement('div');
    by.className = 'deed-custom-award-by';
    by.textContent = t('hudChrome.customAward.givenBy', {
      name: row.giverName,
      date: formatDateTime(row.createdAt, { dateStyle: 'medium' }),
    });
    el.append(by);
    const actions = doc.createElement('div');
    actions.className = 'deed-custom-award-actions';
    const host = this.titles();
    if (host && !row.hidden) {
      const id = customTitleId(row.id);
      actions.append(
        this.button(
          doc,
          row.worn ? 'hudChrome.customAward.removeTitle' : 'hudChrome.customAward.wearTitle',
          row.worn
            ? 'hudChrome.customAward.removeTitleAria'
            : 'hudChrome.customAward.wearTitleAria',
          row.title,
          () => this.wear(host, row.worn ? null : id),
        ),
      );
    }
    actions.append(
      this.button(
        doc,
        row.hidden ? 'hudChrome.customAward.show' : 'hudChrome.customAward.hide',
        row.hidden ? 'hudChrome.customAward.showAria' : 'hudChrome.customAward.hideAria',
        row.title,
        () => this.setHidden(row.id, !row.hidden),
      ),
      this.button(
        doc,
        row.confirmingReject
          ? 'hudChrome.customAward.confirmReject'
          : 'hudChrome.customAward.reject',
        'hudChrome.customAward.rejectAria',
        row.title,
        () => this.reject(row.id),
      ),
    );
    el.append(actions);
    return el;
  }

  private button(
    doc: Document,
    labelKey: Parameters<typeof t>[0],
    ariaKey: Parameters<typeof t>[0],
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ui-chip deed-custom-award-btn';
    b.textContent = t(labelKey);
    b.setAttribute('aria-label', t(ariaKey, { title }));
    b.addEventListener('click', onClick);
    return b;
  }

  private wear(host: CustomAwardTitleHost, id: string | null): void {
    host.setActiveTitle(id);
    this.pendingWorn = id;
    this.paint();
  }

  private setHidden(id: number, hidden: boolean): void {
    const src = this.source();
    if (!src || !this.list) return;
    this.confirmingId = null;
    void src.setHidden(id, hidden).then((ok) => {
      this.failed = !ok;
      if (ok && this.list) this.list = applyCustomAwardHidden(this.list, id, hidden);
      this.paint();
    });
  }

  private reject(id: number): void {
    const src = this.source();
    if (!src || !this.list) return;
    if (this.confirmingId !== id) {
      this.confirmingId = id;
      this.paint();
      return;
    }
    this.confirmingId = null;
    void src.reject(id).then((ok) => {
      this.failed = !ok;
      if (ok && this.list) this.list = applyCustomAwardRejected(this.list, id);
      this.paint();
    });
  }
}
