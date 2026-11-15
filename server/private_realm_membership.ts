// Private realms treat every account as fully subscribed: extra character slots and
// membership-slot characters stay unlocked. Adaptive gear minting is gated separately
// (src/sim/private_realm.ts membershipGearClaims, off by default).

import { privateRealmMembershipFromEnv } from './private_realm_config';
import type { MembershipAuthorization } from './membership_service';

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export function privateRealmMembershipGranted(): boolean {
  return privateRealmMembershipFromEnv();
}

export function privateRealmMembershipAllAccess(nowMs: number): MembershipAuthorization {
  const until = nowMs + TEN_YEARS_MS;
  return {
    active: true,
    expiresAt: until,
    authorizedUntil: until,
    recurringExpiresAt: until,
    recurringAuthorizedUntil: until,
  };
}
