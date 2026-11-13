import { describe, expect, it } from 'vitest';
import {
  CUSTOM_AWARD_NOTICES,
  cleanCustomAwardText,
  customAwardAnnouncement,
  draftCustomAward,
  parseCustomAwardCommand,
} from '../../server/custom_award_command';
import { type CustomAwardSession, CustomAwards } from '../../server/custom_awards';
import type {
  AwardRecipient,
  CustomAwardInsert,
  CustomAwardInsertResult,
  CustomAwardsStore,
} from '../../server/custom_awards_db';
import { CUSTOM_AWARDS_SCHEMA, INSERT_CUSTOM_AWARD_SQL } from '../../server/custom_awards_db';
import {
  PRIVATE_REALM_DEFAULTS,
  type PrivateRealmAchievementRules,
} from '../../src/sim/private_realm';

const LIMITS = { maxTitleLength: 40, maxDescriptionLength: 160 };

describe('parseCustomAwardCommand', () => {
  it('ignores chat that is not /award', () => {
    expect(parseCustomAwardCommand('hello')).toBeNull();
    expect(parseCustomAwardCommand('/awards')).toBeNull();
  });

  it('parses name, quoted title and free description', () => {
    expect(parseCustomAwardCommand('/award Bob "Fish Whisperer" caught 40 eels')).toEqual({
      kind: 'award',
      target: 'Bob',
      title: 'Fish Whisperer',
      description: 'caught 40 eels',
    });
    expect(parseCustomAwardCommand('/AWARD Bob "Solo"')).toEqual({
      kind: 'award',
      target: 'Bob',
      title: 'Solo',
      description: '',
    });
  });

  it('answers usage for a malformed line', () => {
    expect(parseCustomAwardCommand('/award')).toEqual({ kind: 'usage' });
    expect(parseCustomAwardCommand('/award Bob no quotes')).toEqual({ kind: 'usage' });
  });
});

describe('draftCustomAward', () => {
  const award = (title: string, description = '', target = 'Bob') =>
    ({ kind: 'award', target, title, description }) as const;

  it('enforces the title and description limits at exactly the configured length', () => {
    expect(draftCustomAward(award('x'.repeat(40)), 'Ann', LIMITS).ok).toBe(true);
    expect(draftCustomAward(award('x'.repeat(41)), 'Ann', LIMITS)).toEqual({
      ok: false,
      notice: 'Achievement titles are limited to 40 characters.',
    });
    expect(draftCustomAward(award('ok', 'y'.repeat(160)), 'Ann', LIMITS).ok).toBe(true);
    expect(draftCustomAward(award('ok', 'y'.repeat(161)), 'Ann', LIMITS)).toEqual({
      ok: false,
      notice: 'Achievement descriptions are limited to 160 characters.',
    });
  });

  it('refuses a self award by name, case-insensitively', () => {
    expect(draftCustomAward(award('Hero', '', 'ann'), 'Ann', LIMITS)).toEqual({
      ok: false,
      notice: CUSTOM_AWARD_NOTICES.self,
    });
  });

  it('refuses a blocked word in the title or description', () => {
    expect(draftCustomAward(award('Total shit'), 'Ann', LIMITS)).toEqual({
      ok: false,
      notice: CUSTOM_AWARD_NOTICES.offensive,
    });
    expect(draftCustomAward(award('Hero', 'what a fucking legend'), 'Ann', LIMITS).ok).toBe(false);
  });

  it('refuses an empty title after cleaning', () => {
    expect(draftCustomAward(award('\u200b\u200b'), 'Ann', LIMITS)).toEqual({
      ok: false,
      notice: CUSTOM_AWARD_NOTICES.usage,
    });
  });

  it('folds control characters and defuses chat item-link tokens', () => {
    expect(cleanCustomAwardText('Line\none\u202e')).toBe('Line one');
    expect(cleanCustomAwardText('[[i:sword]]')).toBe('[i:sword]');
    const draft = draftCustomAward(award('Fish  Whisperer'), 'Ann', LIMITS);
    expect(draft).toMatchObject({ ok: true, title: 'Fish Whisperer', titleKey: 'fish whisperer' });
  });
});

describe('custom_awards schema', () => {
  it('keys awards by stable character ids with one title per recipient', () => {
    expect(CUSTOM_AWARDS_SCHEMA).toContain(
      'recipient_character_id INT NOT NULL REFERENCES characters(id)',
    );
    expect(CUSTOM_AWARDS_SCHEMA).toContain('giver_character_id INT REFERENCES characters(id)');
    expect(CUSTOM_AWARDS_SCHEMA).toContain('ON custom_awards (recipient_character_id, title_key)');
  });

  it('inserts with bound parameters only (cap and duplicate in one statement)', () => {
    expect(INSERT_CUSTOM_AWARD_SQL).toContain('WHERE recent.n < $8');
    expect(INSERT_CUSTOM_AWARD_SQL).toContain(
      'ON CONFLICT (recipient_character_id, title_key) DO NOTHING',
    );
    expect(INSERT_CUSTOM_AWARD_SQL).not.toMatch(/\$\{/);
  });
});

interface Sess extends CustomAwardSession {
  sent: string[];
}

function session(characterId: number, accountId: number, name: string): Sess {
  return { characterId, accountId, name, sent: [] };
}

class FakeStore implements CustomAwardsStore {
  inserts: CustomAwardInsert[] = [];
  result: CustomAwardInsertResult = { kind: 'ok', id: 7 };
  constructor(private readonly chars: AwardRecipient[]) {}
  async findRecipient(name: string) {
    return this.chars.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async insert(a: CustomAwardInsert) {
    this.inserts.push(a);
    return this.result;
  }
  async listFor() {
    return [];
  }
  async setHidden() {
    return true;
  }
  async reject() {
    return true;
  }
}

function harness(rules: PrivateRealmAchievementRules | null = PRIVATE_REALM_DEFAULTS.achievements) {
  const ann = session(1, 10, 'Ann');
  const bob = session(2, 20, 'Bob');
  const cy = session(3, 30, 'Cy');
  const sessions = [ann, bob, cy];
  const store = new FakeStore([
    { characterId: 1, accountId: 10, name: 'Ann' },
    { characterId: 2, accountId: 20, name: 'Bob' },
    { characterId: 4, accountId: 10, name: 'Annalt' },
  ]);
  const awarded: number[] = [];
  const awards = new CustomAwards<Sess>(
    { consumeCommandLane: () => true },
    { sessions: () => sessions, sendRaw: (s, payload) => s.sent.push(payload) },
    store,
    () => rules,
  );
  awards.onAwarded((id) => awarded.push(id));
  const lines = (s: Sess) => s.sent.map((p) => JSON.parse(p).list[0].text as string);
  return { ann, bob, cy, store, awards, awarded, lines };
}

describe('CustomAwards service', () => {
  it('does not claim /award when the private realm is off', () => {
    const h = harness(null);
    expect(h.awards.handleChat(h.ann, '/award Bob "Hero"', 0)).toBe(false);
  });

  it('records the giver from the session and announces realm-wide, serialized once', async () => {
    const h = harness();
    await h.awards.run(h.ann, parseCustomAwardCommand('/award bob "Fish Whisperer" 40 eels')!);
    expect(h.store.inserts).toEqual([
      {
        giverCharacterId: 1,
        giverName: 'Ann',
        recipientCharacterId: 2,
        title: 'Fish Whisperer',
        titleKey: 'fish whisperer',
        description: '40 eels',
        dailyCap: PRIVATE_REALM_DEFAULTS.achievements.dailyAwardCap,
      },
    ]);
    const line = customAwardAnnouncement('Bob', 'Fish Whisperer', 'Ann');
    expect(h.lines(h.bob)).toEqual([line]);
    expect(h.lines(h.cy)).toEqual([line]);
    expect(h.lines(h.ann)).toEqual(['You awarded "Fish Whisperer" to Bob.', line]);
    expect(h.bob.sent[0]).toBe(h.cy.sent[0]);
    expect(h.awarded).toEqual([2]);
  });

  it('refuses an award to an alt on the giver account', async () => {
    const h = harness();
    await h.awards.run(h.ann, parseCustomAwardCommand('/award Annalt "Hero"')!);
    expect(h.store.inserts).toEqual([]);
    expect(h.lines(h.ann)).toEqual([CUSTOM_AWARD_NOTICES.self]);
  });

  it('reports an unknown recipient, a duplicate and the daily cap', async () => {
    const h = harness();
    await h.awards.run(h.ann, parseCustomAwardCommand('/award Nobody "Hero"')!);
    h.store.result = { kind: 'duplicate' };
    await h.awards.run(h.ann, parseCustomAwardCommand('/award Bob "Hero"')!);
    h.store.result = { kind: 'capped' };
    await h.awards.run(h.ann, parseCustomAwardCommand('/award Bob "Hero two"')!);
    expect(h.lines(h.ann)).toEqual([
      CUSTOM_AWARD_NOTICES.notFound,
      CUSTOM_AWARD_NOTICES.duplicate,
      'You can award at most 10 achievements per day.',
    ]);
    expect(h.lines(h.bob)).toEqual([]);
    expect(h.awarded).toEqual([]);
  });

  it('tells only the recipient when global announcements are off', async () => {
    const h = harness({ ...PRIVATE_REALM_DEFAULTS.achievements, globalAnnouncements: false });
    await h.awards.run(h.ann, parseCustomAwardCommand('/award Bob "Hero"')!);
    expect(h.lines(h.bob)).toEqual([customAwardAnnouncement('Bob', 'Hero', 'Ann')]);
    expect(h.lines(h.cy)).toEqual([]);
  });

  it('meters a burst: one award in flight per account', () => {
    const h = harness();
    expect(h.awards.handleChat(h.ann, '/award Bob "One"', 10)).toBe(true);
    expect(h.awards.handleChat(h.ann, '/award Bob "Two"', 10.1)).toBe(true);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(h.store.inserts.map((i) => i.title)).toEqual(['One']);
        resolve();
      }, 10),
    );
  });
});
