import { describe, expect, it } from 'vitest';
import {
  membershipGearClaimsAdvertised,
  syncMembershipGearClaimsFromStatus,
} from '../../src/ui/private_realm_membership_gear';

describe('private realm membership gear advert sync', () => {
  it('hides claims on a private realm unless the server advertises gear', async () => {
    await syncMembershipGearClaimsFromStatus(async () => ({
      private_realm: true,
      private_realm_membership_gear: false,
    }));
    expect(membershipGearClaimsAdvertised()).toBe(false);
  });

  it('shows claims when the server opts in', async () => {
    await syncMembershipGearClaimsFromStatus(async () => ({
      private_realm: true,
      private_realm_membership_gear: true,
    }));
    expect(membershipGearClaimsAdvertised()).toBe(true);
  });

  it('defaults to stock behavior off a private realm', async () => {
    await syncMembershipGearClaimsFromStatus(async () => ({ private_realm: false }));
    expect(membershipGearClaimsAdvertised()).toBe(true);
  });

  it('fails closed on status errors', async () => {
    await syncMembershipGearClaimsFromStatus(async () => {
      throw new Error('offline');
    });
    expect(membershipGearClaimsAdvertised()).toBe(true);
  });
});