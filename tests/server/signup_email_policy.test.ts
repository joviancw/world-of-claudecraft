import { afterEach, describe, expect, it } from 'vitest';
import {
  emailMissingForClient,
  resolveSignupEmail,
  signupEmailRequired,
} from '../../server/signup_email_policy';

describe('signup_email_policy', () => {
  const prev = process.env.PRIVATE_REALM;
  afterEach(() => {
    process.env.PRIVATE_REALM = prev;
  });

  it('requires email on a stock realm', () => {
    process.env.PRIVATE_REALM = '';
    expect(signupEmailRequired()).toBe(true);
    expect(resolveSignupEmail({ email: '' })).toBe('invalid');
    expect(resolveSignupEmail({ email: 'a@b.co' })).toBe('a@b.co');
  });

  it('waives email on a private realm', () => {
    process.env.PRIVATE_REALM = '1';
    expect(signupEmailRequired()).toBe(false);
    expect(resolveSignupEmail({})).toBeNull();
    expect(resolveSignupEmail({ email: 'still@works.co' })).toBe('still@works.co');
    expect(emailMissingForClient(null)).toBe(false);
    expect(emailMissingForClient('')).toBe(false);
  });

  it('still reports missing email on stock realms', () => {
    process.env.PRIVATE_REALM = '';
    expect(emailMissingForClient(null)).toBe(true);
    expect(emailMissingForClient('a@b.co')).toBe(false);
  });
});
