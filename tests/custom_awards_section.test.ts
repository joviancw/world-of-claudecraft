// @vitest-environment jsdom
//
// The Book of Deeds "Awarded by Friends" section: the pure model
// (custom_awards_view.ts), the painter (custom_awards_section.ts) over jsdom
// with a stub source, and the online REST client's parse and request shapes
// (src/net/custom_awards_client.ts). Award text is player-authored, so the
// painter must render it as text, never markup.

import { describe, expect, it } from 'vitest';
import { customAwardsClient, parseCustomAwardsBody } from '../src/net/custom_awards_client';
import { CUSTOM_AWARDS_SLOT_HTML, CustomAwardsSection } from '../src/ui/custom_awards_section';
import {
  applyCustomAwardHidden,
  applyCustomAwardRejected,
  customAwardsSectionModel,
} from '../src/ui/custom_awards_view';
import { deedTitleText } from '../src/ui/deed_i18n';
import { t } from '../src/ui/i18n';
import type { CustomAwardsSource, CustomAwardView } from '../src/world_api/deeds';

const a = (id: number, createdAt: number, hidden = false, title = `Award ${id}`) =>
  ({
    id,
    title,
    description: `Desc ${id}`,
    giverName: 'Thorne',
    hidden,
    createdAt,
  }) satisfies CustomAwardView;

describe('customAwardsSectionModel', () => {
  it('is absent with no surface and empty with no awards', () => {
    expect(customAwardsSectionModel(null, null)).toEqual({ state: 'absent' });
    expect(customAwardsSectionModel([], null)).toEqual({ state: 'empty' });
  });

  it('orders shown before hidden, newest first, and marks the armed reject', () => {
    const m = customAwardsSectionModel([a(1, 100), a(2, 300, true), a(3, 200)], 3);
    if (m.state !== 'rows') throw new Error('expected rows');
    expect(m.rows.map((r) => r.id)).toEqual([3, 1, 2]);
    expect(m.rows.map((r) => r.confirmingReject)).toEqual([true, false, false]);
  });

  it('applies hide and reject to the local mirror without mutating it', () => {
    const list = [a(1, 1), a(2, 2)];
    expect(applyCustomAwardHidden(list, 2, true)[1].hidden).toBe(true);
    expect(applyCustomAwardRejected(list, 1).map((x) => x.id)).toEqual([2]);
    expect(list.map((x) => x.hidden)).toEqual([false, false]);
  });
});

function stubSource(list: CustomAwardView[] | null, ok = true) {
  const calls: string[] = [];
  const source: CustomAwardsSource = {
    list: async () => list,
    setHidden: async (id, hidden) => {
      calls.push(`hide:${id}:${hidden}`);
      return ok;
    },
    reject: async (id) => {
      calls.push(`reject:${id}`);
      return ok;
    },
  };
  return { source, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mounted(source: CustomAwardsSource | null) {
  document.body.innerHTML = CUSTOM_AWARDS_SLOT_HTML;
  const slot = document.body.firstElementChild as Element;
  const section = new CustomAwardsSection(() => source);
  section.mount(slot);
  section.refresh();
  await flush();
  return { slot, section };
}

const buttons = (slot: Element, id: number) =>
  [
    ...(slot.querySelector(`[data-custom-award="${id}"]`)?.querySelectorAll('button') ?? []),
  ] as HTMLButtonElement[];

describe('CustomAwardsSection painter', () => {
  it('paints nothing without a surface (offline or a stock realm)', async () => {
    const { slot } = await mounted(null);
    expect(slot.childElementCount).toBe(0);
    const { slot: slot2 } = await mounted(stubSource(null).source);
    expect(slot2.childElementCount).toBe(0);
  });

  it('shows the empty line when the character has no awards', async () => {
    const { slot } = await mounted(stubSource([]).source);
    expect(slot.textContent).toContain(t('hudChrome.customAward.sectionTitle'));
    expect(slot.textContent).toContain(t('hudChrome.customAward.empty'));
  });

  it('renders player text as text, never markup', async () => {
    const evil = a(9, 1, false, '<img src=x onerror=alert(1)>');
    const { slot } = await mounted(stubSource([evil]).source);
    expect(slot.querySelector('img')).toBeNull();
    expect(slot.querySelector('.deed-custom-award-title')?.textContent).toBe(evil.title);
    const hide = buttons(slot, 9)[0];
    expect(hide.getAttribute('aria-label')).toBe(
      t('hudChrome.customAward.hideAria', { title: evil.title }),
    );
  });

  it('hides then shows an award through the source', async () => {
    const { source, calls } = stubSource([a(1, 1)]);
    const { slot } = await mounted(source);
    buttons(slot, 1)[0].click();
    await flush();
    const row = slot.querySelector('[data-custom-award="1"]');
    expect(row?.classList.contains('is-hidden')).toBe(true);
    expect(buttons(slot, 1)[0].textContent).toBe(t('hudChrome.customAward.show'));
    buttons(slot, 1)[0].click();
    await flush();
    expect(calls).toEqual(['hide:1:true', 'hide:1:false']);
  });

  it('rejects only on the second press and drops the row', async () => {
    const { source, calls } = stubSource([a(1, 1), a(2, 2)]);
    const { slot } = await mounted(source);
    buttons(slot, 1)[1].click();
    await flush();
    expect(calls).toEqual([]);
    expect(buttons(slot, 1)[1].textContent).toBe(t('hudChrome.customAward.confirmReject'));
    buttons(slot, 1)[1].click();
    await flush();
    expect(calls).toEqual(['reject:1']);
    expect(slot.querySelector('[data-custom-award="1"]')).toBeNull();
    expect(slot.querySelector('[data-custom-award="2"]')).not.toBeNull();
  });

  it('keeps the row and reports a failed write', async () => {
    const { source } = stubSource([a(1, 1)], false);
    const { slot } = await mounted(source);
    buttons(slot, 1)[0].click();
    await flush();
    expect(slot.querySelector('[data-custom-award="1"]')?.classList.contains('is-hidden')).toBe(
      false,
    );
    expect(slot.textContent).toContain(t('hudChrome.customAward.actionFailed'));
  });

  it('wears a shown award as the title and takes it off again', async () => {
    const worn: (string | null)[] = [];
    const host = {
      activeTitle: null as string | null,
      setActiveTitle: (id: string | null) => worn.push(id),
    };
    document.body.innerHTML = CUSTOM_AWARDS_SLOT_HTML;
    const slot = document.body.firstElementChild as Element;
    const section = new CustomAwardsSection(
      () => stubSource([a(1, 1), a(2, 2, true)]).source,
      () => host,
    );
    section.mount(slot);
    section.refresh();
    await flush();
    expect(deedTitleText('custom:1')).toBe('Award 1');
    const wear = buttons(slot, 1)[0];
    expect(wear.textContent).toBe(t('hudChrome.customAward.wearTitle'));
    wear.click();
    expect(worn).toEqual(['custom:1']);
    const remove = buttons(slot, 1)[0];
    expect(remove.textContent).toBe(t('hudChrome.customAward.removeTitle'));
    remove.click();
    expect(worn).toEqual(['custom:1', null]);
    const hiddenLabels = buttons(slot, 2).map((b) => b.textContent);
    expect(hiddenLabels).not.toContain(t('hudChrome.customAward.wearTitle'));
  });

  it('repaints the kept list into a fresh slot after a window rebuild', async () => {
    const { section } = await mounted(stubSource([a(1, 1)]).source);
    document.body.innerHTML = CUSTOM_AWARDS_SLOT_HTML;
    const fresh = document.body.firstElementChild as Element;
    section.mount(fresh);
    expect(fresh.querySelector('[data-custom-award="1"]')).not.toBeNull();
  });
});

describe('custom awards REST client', () => {
  it('parses only an enabled, well-formed body and drops bad rows', () => {
    expect(parseCustomAwardsBody({ enabled: false, awards: [] })).toBeNull();
    expect(parseCustomAwardsBody({ awards: [] })).toBeNull();
    expect(parseCustomAwardsBody(null)).toBeNull();
    expect(parseCustomAwardsBody({ enabled: true, awards: 'x' })).toBeNull();
    expect(parseCustomAwardsBody({ enabled: true, awards: [a(1, 5), { id: 'x' }] })).toEqual([
      a(1, 5),
    ]);
  });

  it('names the self character and sends the bearer on every request', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ enabled: true, awards: [a(4, 1)] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = customAwardsClient(
      () => ({ base: 'https://realm.test', token: 'tok', characterId: 42 }),
      fetchImpl,
    );
    expect(await client.list()).toEqual([a(4, 1)]);
    expect(await client.setHidden(4, true)).toBe(true);
    expect(await client.reject(4)).toBe(true);
    expect(seen[0].url).toBe('https://realm.test/api/custom-awards?character=42');
    expect(seen[1].url).toBe('https://realm.test/api/custom-awards/hide');
    expect(JSON.parse(String(seen[1].init?.body))).toEqual({
      character: 42,
      award: 4,
      hidden: true,
    });
    expect(JSON.parse(String(seen[2].init?.body))).toEqual({ character: 42, award: 4 });
    for (const s of seen) {
      const headers = (s.init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer tok');
    }
  });

  it('resolves null and false on failure', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const client = customAwardsClient(() => ({ base: '', token: 't', characterId: 1 }), fetchImpl);
    expect(await client.list()).toBeNull();
    expect(await client.setHidden(1, true)).toBe(false);
    expect(await client.reject(1)).toBe(false);
  });
});
