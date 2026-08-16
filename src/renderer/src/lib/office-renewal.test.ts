import { describe, expect, test } from 'bun:test';
import { tokenBreakdown } from './office-renewal.ts';
import type { OfficeStatus } from '../../../shared/office-status.ts';

const signedIn = (over: Partial<Extract<OfficeStatus, { signedIn: true }>> = {}): OfficeStatus => ({
  signedIn: true,
  scopes: ['Mail.Read'],
  expiresAt: '2026-07-21T12:00:00.000Z',
  tiers: {},
  ...over,
});

describe('the fuller breakdown for the dot tooltip', () => {
  test('not signed in has nothing to break down', () => {
    expect(tokenBreakdown({ signedIn: false, message: 'not authenticated' })).toBeUndefined();
  });

  test('no status at all has nothing to break down', () => {
    expect(tokenBreakdown(undefined)).toBeUndefined();
  });

  test('the tokens that renew themselves explain what would actually stop them, not a countdown', () => {
    expect(tokenBreakdown(signedIn())).toContain(
      'Mail, calendar, files and Teams chats: renew automatically, and only stop if you sign out, change your password, or access is revoked.'
    );
  });

  test('a known main-token expiry is not turned into a countdown, because it is not the number that matters', () => {
    const breakdown = tokenBreakdown(signedIn({ expiresInSeconds: 3480 }));

    expect(breakdown).not.toContain('minute');
  });
});
