import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_WEAPON_ID } from '../src/sim/content/membership';
import { claimMembershipArmour } from '../src/sim/membership';
import { resolvePrivateRealmRules } from '../src/sim/private_realm';
import { Sim } from '../src/sim/sim';

describe('private realm membership gear claims', () => {
  it('does not mint adaptive gear on activation when claims are off', () => {
    const sim = new Sim({
      seed: 1,
      playerClass: 'warrior',
      privateRealm: resolvePrivateRealmRules({ membershipGearClaims: false }),
    });
    const pid = sim.playerId;
    sim.setMembership(pid, 3600);
    const meta = sim.meta(pid)!;
    const ids = meta.inventory.map((s) => s.itemId);
    expect(ids).not.toContain('membership_chest');
    expect(ids).not.toContain(MEMBERSHIP_WEAPON_ID);
    claimMembershipArmour(sim.ctx, pid);
    expect(meta.inventory.map((s) => s.itemId)).not.toContain('membership_chest');
  });

  it('still mints adaptive gear when PRIVATE_REALM_MEMBERSHIP_GEAR is enabled', () => {
    const sim = new Sim({
      seed: 2,
      playerClass: 'warrior',
      privateRealm: resolvePrivateRealmRules({ membershipGearClaims: true }),
    });
    const pid = sim.playerId;
    sim.setMembership(pid, 3600);
    const meta = sim.meta(pid)!;
    expect(meta.inventory.some((s) => s.itemId === 'membership_chest')).toBe(true);
  });
});