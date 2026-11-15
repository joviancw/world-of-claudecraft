// The Book of Deeds "Your Awards" shelf: create templates and issue them in game.

import type { CustomAwardIssueOutcome, CustomAwardTemplatesSource } from '../world_api/deeds';
import {
  applyTemplateDeleted,
  customAwardTemplatesSectionModel,
} from './custom_award_templates_view';
import { t } from './i18n';

export const CUSTOM_AWARD_TEMPLATES_SLOT_CLASS = 'deeds-custom-award-templates';
export const CUSTOM_AWARD_TEMPLATES_SLOT_HTML = `<div class="${CUSTOM_AWARD_TEMPLATES_SLOT_CLASS}"></div>`;

type StatusKey = Parameters<typeof t>[0];

export class CustomAwardTemplatesSection {
  private list: readonly import('../world_api/deeds').CustomAwardTemplateView[] | null = null;
  private slot: Element | null = null;
  private fetchSeq = 0;
  private issuingId: number | null = null;
  private sendingId: number | null = null;
  private recipientById = new Map<number, string>();
  private createOpen = false;
  private draftTitle = '';
  private draftDescription = '';
  private statusKey: StatusKey | null = null;

  constructor(
    private readonly source: () => CustomAwardTemplatesSource | null,
    private readonly onIssued?: () => void,
    private readonly onIssuedSuccess?: (title: string, recipient: string) => void,
  ) {}

  refresh(): void {
    const src = this.source();
    const seq = ++this.fetchSeq;
    this.list = null;
    this.issuingId = null;
    this.sendingId = null;
    this.recipientById.clear();
    this.createOpen = false;
    this.draftTitle = '';
    this.draftDescription = '';
    this.statusKey = null;
    this.paint();
    if (!src) return;
    void src.list().then((list) => {
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
    const model = customAwardTemplatesSectionModel(
      this.list,
      this.issuingId,
      this.createOpen,
      this.sendingId,
    );
    if (model.state === 'absent') return;
    const doc = slot.ownerDocument;
    const group = doc.createElement('div');
    group.className = 'deeds-titles deeds-custom-award-templates-list';
    group.setAttribute('role', 'group');
    const head = doc.createElement('h3');
    head.className = 'deeds-picker-head';
    head.id = 'deeds-custom-award-templates-head';
    head.textContent = t('hudChrome.customAward.templatesSectionTitle');
    group.setAttribute('aria-labelledby', head.id);
    group.append(head);
    const intro = doc.createElement('div');
    intro.className = 'deeds-custom-award-templates-hint';
    intro.textContent = t('hudChrome.customAward.templatesHint');
    group.append(intro);
    group.append(this.createPanel(doc, model.createOpen));
    if (model.state === 'empty') {
      const empty = doc.createElement('div');
      empty.className = 'deeds-empty';
      empty.textContent = t('hudChrome.customAward.templatesEmpty');
      group.append(empty);
    } else {
      for (const row of model.rows) group.append(this.rowEl(doc, row));
    }
    if (this.statusKey) {
      const err = doc.createElement('div');
      const ok = this.statusKey === 'hudChrome.customAward.templatesIssued';
      err.className = ok ? 'deeds-custom-award-status-ok' : 'deeds-empty';
      err.setAttribute('role', 'status');
      err.setAttribute('aria-live', ok ? 'polite' : 'off');
      err.textContent = t(this.statusKey);
      group.append(err);
    }
    slot.append(group);
  }

  private createPanel(doc: Document, open: boolean): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'deeds-custom-award-template-form';
    if (!open) {
      wrap.append(
        this.chip(doc, 'hudChrome.customAward.templatesNew', () => {
          this.createOpen = true;
          this.statusKey = null;
          this.paint();
        }),
      );
      return wrap;
    }
    const title = doc.createElement('input');
    title.type = 'text';
    title.className = 'deeds-custom-award-template-input';
    title.value = this.draftTitle;
    title.setAttribute('aria-label', t('hudChrome.customAward.templatesTitleField'));
    title.setAttribute('placeholder', t('hudChrome.customAward.templatesTitlePlaceholder'));
    title.addEventListener('input', () => {
      this.draftTitle = title.value;
    });
    const desc = doc.createElement('textarea');
    desc.className = 'deeds-custom-award-template-input deeds-custom-award-template-desc';
    desc.value = this.draftDescription;
    desc.setAttribute('aria-label', t('hudChrome.customAward.templatesDescField'));
    desc.setAttribute('placeholder', t('hudChrome.customAward.templatesDescPlaceholder'));
    desc.addEventListener('input', () => {
      this.draftDescription = desc.value;
    });
    const actions = doc.createElement('div');
    actions.className = 'deed-custom-award-actions';
    actions.append(
      this.chip(doc, 'hudChrome.customAward.templatesSave', () => this.saveTemplate()),
      this.chip(doc, 'hudChrome.customAward.templatesCancel', () => {
        this.createOpen = false;
        this.draftTitle = '';
        this.draftDescription = '';
        this.statusKey = null;
        this.paint();
      }),
    );
    wrap.append(title, desc, actions);
    return wrap;
  }

  private rowEl(
    doc: Document,
    row: import('./custom_award_templates_view').CustomAwardTemplateRowModel,
  ): HTMLElement {
    const el = doc.createElement('div');
    el.className = 'deed-custom-award';
    el.dataset.customAwardTemplate = String(row.id);
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
    const actions = doc.createElement('div');
    actions.className = 'deed-custom-award-actions';
    if (row.issuing) {
      const recipient = doc.createElement('input');
      recipient.type = 'text';
      recipient.className = 'deeds-custom-award-template-input';
      recipient.value = this.recipientById.get(row.id) ?? '';
      recipient.setAttribute('aria-label', t('hudChrome.customAward.templatesRecipientField'));
      recipient.setAttribute(
        'placeholder',
        t('hudChrome.customAward.templatesRecipientPlaceholder'),
      );
      recipient.addEventListener('input', () => {
        this.recipientById.set(row.id, recipient.value);
      });
      const send = this.chip(
        doc,
        row.sending
          ? 'hudChrome.customAward.templatesSending'
          : 'hudChrome.customAward.templatesSend',
        () => this.issue(row.id),
      );
      send.disabled = row.sending;
      actions.append(
        recipient,
        send,
        this.chip(doc, 'hudChrome.customAward.templatesCancelIssue', () => {
          if (this.sendingId !== null) return;
          this.issuingId = null;
          this.recipientById.delete(row.id);
          this.statusKey = null;
          this.paint();
        }),
      );
    } else {
      actions.append(
        this.chip(doc, 'hudChrome.customAward.templatesIssue', () => {
          this.issuingId = row.id;
          this.statusKey = null;
          this.paint();
        }),
        this.chip(doc, 'hudChrome.customAward.templatesDelete', () => this.deleteTemplate(row.id)),
      );
    }
    el.append(actions);
    return el;
  }

  private chip(doc: Document, labelKey: StatusKey, onClick: () => void): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ui-chip deed-custom-award-btn';
    b.textContent = t(labelKey);
    b.addEventListener('click', onClick);
    return b;
  }

  private saveTemplate(): void {
    const src = this.source();
    if (!src || this.list === null) return;
    const title = this.draftTitle.trim();
    const description = this.draftDescription.trim();
    if (!title) {
      this.statusKey = 'hudChrome.customAward.templatesTitleRequired';
      this.paint();
      return;
    }
    void src.create(title, description).then((outcome) => {
      this.statusKey = createStatus(outcome);
      if (outcome === 'ok') {
        this.createOpen = false;
        this.draftTitle = '';
        this.draftDescription = '';
        void this.source()
          ?.list()
          .then((fresh) => {
            if (fresh) this.list = fresh;
            this.paint();
          });
      } else {
        this.paint();
      }
    });
  }

  private deleteTemplate(id: number): void {
    const src = this.source();
    if (!src || !this.list) return;
    void src.delete(id).then((ok) => {
      this.statusKey = ok ? null : 'hudChrome.customAward.actionFailed';
      if (ok && this.list) {
        this.list = applyTemplateDeleted(this.list, id);
        if (this.issuingId === id) this.issuingId = null;
      }
      this.paint();
    });
  }

  private issue(id: number): void {
    const src = this.source();
    if (!src) return;
    const recipient = (this.recipientById.get(id) ?? '').trim();
    if (!recipient) {
      this.statusKey = 'hudChrome.customAward.templatesRecipientRequired';
      this.paint();
      return;
    }
    const row = this.list?.find((t) => t.id === id);
    if (this.sendingId !== null) return;
    this.sendingId = id;
    this.statusKey = null;
    this.paint();
    void src.issue(id, recipient).then((outcome) => {
      this.sendingId = null;
      this.statusKey = issueStatus(outcome);
      if (outcome === 'ok') {
        this.issuingId = null;
        this.recipientById.delete(id);
        this.onIssued?.();
        if (row) this.onIssuedSuccess?.(row.title, recipient);
      }
      this.paint();
    });
  }
}

function createStatus(
  outcome: import('../world_api/deeds').CustomAwardTemplateCreateOutcome,
): StatusKey | null {
  if (outcome === 'ok') return null;
  if (outcome === 'invalid') return 'hudChrome.customAward.templatesInvalid';
  if (outcome === 'duplicate') return 'hudChrome.customAward.duplicate';
  if (outcome === 'capped') return 'hudChrome.customAward.templateCap';
  return 'hudChrome.customAward.actionFailed';
}

function issueStatus(outcome: CustomAwardIssueOutcome): StatusKey | null {
  if (outcome === 'ok') return 'hudChrome.customAward.templatesIssued';
  if (outcome === 'not_found') return 'hudChrome.customAward.notFound';
  if (outcome === 'self') return 'hudChrome.customAward.self';
  if (outcome === 'duplicate') return 'hudChrome.customAward.duplicate';
  if (outcome === 'capped') return 'hudChrome.customAward.templatesDailyCap';
  if (outcome === 'busy') return 'hudChrome.customAward.actionFailed';
  return 'hudChrome.customAward.actionFailed';
}
