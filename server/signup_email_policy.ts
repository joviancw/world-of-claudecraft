// Signup email requirement: stock realms capture a recovery address at register;
// a private realm (PRIVATE_REALM=1) does not.

import { normalizeEmail } from './auth';

export function signupEmailRequired(): boolean {
  return process.env.PRIVATE_REALM !== '1';
}

/** Valid email, waived (private realm with none), or invalid (stock with none). */
export function resolveSignupEmail(body: Record<string, unknown>): string | null | 'invalid' {
  const normalized = normalizeEmail(body.email);
  if (normalized) return normalized;
  if (!signupEmailRequired()) return null;
  return 'invalid';
}

/** Whether the client should force the recovery-email prompt after sign-in. */
export function emailMissingForClient(stored: string | null | undefined): boolean {
  if (!signupEmailRequired()) return false;
  return !(stored && stored.trim());
}
