import { afterEach, describe, expect, it } from 'vitest';
import { getMembership } from '../../server/membership_service';
import {
  privateRealmMembershipAllAccess,
  privateRealmMembershipGranted,
} from '../../server/private_realm_membership';
import { membershipActive } from '../../src/membership_contract';

describe('private realm membership', () => {
  const prev = process.env.PRIVATE_REALM;
  const prevMembership = process.env.PRIVATE_REALM_MEMBERSHIP;
  afterEach(() => {
    process.env.PRIVATE_REALM = prev;
    if (prevMembership === undefined) delete process.env.PRIVATE_REALM_MEMBERSHIP;
    else process.env.PRIVATE_REALM_MEMBERSHIP = prevMembership;
  });

  it('is off unless PRIVATE_REALM=1', () => {
    process.env.PRIVATE_REALM = '';
    expect(privateRealmMembershipGranted()).toBe(false);
    process.env.PRIVATE_REALM = '1';
    expect(privateRealmMembershipGranted()).toBe(true);
  });

  it('stays off when PRIVATE_REALM_MEMBERSHIP=0', () => {
    process.env.PRIVATE_REALM = '1';
    process.env.PRIVATE_REALM_MEMBERSHIP = '0';
    expect(privateRealmMembershipGranted()).toBe(false);
  });

  it('returns a long-lived active entitlement', () => {
    const now = 1_700_000_000_000;
    const snap = privateRealmMembershipAllAccess(now);
    expect(membershipActive(snap, now)).toBe(true);
    expect(snap.expiresAt).toBeGreaterThan(now);
    expect(snap.authorizedUntil).toBe(snap.expiresAt);
  });

  it('short-circuits getMembership without touching subscription sources', async () => {
    process.env.PRIVATE_REALM = '1';
    const m = await getMembership(999_001);
    expect(m.active).toBe(true);
    expect(m.expiresAt).toBeGreaterThan(Date.now());
  });
});
