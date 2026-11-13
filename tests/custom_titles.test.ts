// Player-awarded titles (`custom:<awardId>`, src/sim/custom_titles.ts): the
// sim accepts one only when the server installed it on the entity, a restored
// one waits off the nameplate until the owned list arrives, the identity wire
// carries its text beside the id, and the client resolves it through
// deedTitleText.
import { describe, expect, it } from 'vitest';
import { writePlayerIdentityWire } from '../server/player_identity_wire';
import { decodePlayerIdentityWire } from '../src/net/player_identity_wire';
import { applyCustomTitles, customTitleId, isCustomTitleId } from '../src/sim/custom_titles';
import { setActiveTitle } from '../src/sim/deeds';
import { Sim } from '../src/sim/sim';
import { rememberCustomTitleText } from '../src/ui/custom_title_text';
import { deedTitleText } from '../src/ui/deed_i18n';

function player() {
  const sim = new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Wearer');
  return { meta: sim.players.get(pid)!, e: sim.entities.get(pid)! };
}

const ID = customTitleId(12);

describe('custom title ids', () => {
  it('namespace award ids', () => {
    expect(ID).toBe('custom:12');
    expect(isCustomTitleId(ID)).toBe(true);
    expect(isCustomTitleId('dev:1')).toBe(false);
  });
});

describe('setActiveTitle with a custom title', () => {
  it('refuses a custom title the character does not own', () => {
    const { meta, e } = player();
    setActiveTitle(meta, e, ID);
    expect(meta.activeTitle).toBeNull();
    expect(e.title ?? null).toBeNull();
    applyCustomTitles(meta, e, new Map([[customTitleId(99), 'Other']]));
    setActiveTitle(meta, e, ID);
    expect(meta.activeTitle).toBeNull();
  });

  it('wears an owned one and clears it with null', () => {
    const { meta, e } = player();
    applyCustomTitles(meta, e, new Map([[ID, 'Pull Champion']]));
    setActiveTitle(meta, e, ID);
    expect(meta.activeTitle).toBe(ID);
    expect(e.title).toBe(ID);
    setActiveTitle(meta, e, null);
    expect(meta.activeTitle).toBeNull();
  });

  it('holds a restored one off the nameplate until the owned list confirms it', () => {
    const { meta, e } = player();
    setActiveTitle(meta, e, ID, { restore: true });
    expect(meta.activeTitle).toBe(ID);
    expect(e.title).toBeNull();
    applyCustomTitles(meta, e, new Map([[ID, 'Pull Champion']]));
    expect(e.title).toBe(ID);
  });

  it('clears a worn one that was hidden or rejected', () => {
    const { meta, e } = player();
    applyCustomTitles(meta, e, new Map([[ID, 'Pull Champion']]));
    setActiveTitle(meta, e, ID);
    applyCustomTitles(meta, e, new Map());
    expect(meta.activeTitle).toBeNull();
    expect(e.title).toBeNull();
  });

  it('leaves a non-custom worn title alone', () => {
    const { meta, e } = player();
    meta.activeTitle = 'some_deed';
    e.title = 'some_deed';
    applyCustomTitles(meta, e, new Map());
    expect(meta.activeTitle).toBe('some_deed');
    expect(e.title).toBe('some_deed');
  });
});

describe('the identity wire', () => {
  it('carries the text only for a worn custom title', () => {
    const { meta, e } = player();
    applyCustomTitles(meta, e, new Map([[ID, 'Pull Champion']]));
    setActiveTitle(meta, e, ID);
    const out: Record<string, unknown> = {};
    writePlayerIdentityWire(e, out);
    expect(out).toMatchObject({ title: ID, ttx: 'Pull Champion' });
    expect(decodePlayerIdentityWire(out)).toMatchObject({ title: ID, titleText: 'Pull Champion' });

    const plain: Record<string, unknown> = {};
    writePlayerIdentityWire({ ...e, title: 'some_deed' }, plain);
    expect(plain.ttx).toBeUndefined();
    expect(decodePlayerIdentityWire(plain).titleText).toBe('');
  });
});

describe('client title text', () => {
  it('resolves a custom id through the registry, and nothing before it is known', () => {
    const id = customTitleId(4242);
    expect(deedTitleText(id)).toBe('');
    rememberCustomTitleText(id, 'Raid Saviour');
    expect(deedTitleText(id)).toBe('Raid Saviour');
  });
});
