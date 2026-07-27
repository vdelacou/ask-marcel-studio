import { describe, expect, test } from 'bun:test';
import { renewalNote, tokenBreakdown } from './office-renewal.ts';
import type { OfficeStatus, TokenTier } from '../../../shared/office-status.ts';

const tier = (over: Partial<TokenTier> = {}): TokenTier => ({ available: true, scopes: [], refresh: 'automatic', ...over });

const signedIn = (over: Partial<Extract<OfficeStatus, { signedIn: true }>> = {}): OfficeStatus => ({
  signedIn: true,
  scopes: ['Mail.Read'],
  expiresAt: '2026-07-21T12:00:00.000Z',
  tiers: {},
  ...over,
});

describe('telling the user how long the elevated token is good for', () => {
  test('a healthy elevated token with time left says roughly how long, rounded to the minute', () => {
    expect(renewalNote(signedIn({ tiers: { elevated: tier({ expiresInSeconds: 2700 }) } }))).toContain('about 45 minutes left');
  });

  test('a single minute is not pluralised', () => {
    expect(renewalNote(signedIn({ tiers: { elevated: tier({ expiresInSeconds: 65 }) } }))).toContain('about 1 minute left');
  });

  test('under a minute reads as under a minute, not zero', () => {
    expect(renewalNote(signedIn({ tiers: { elevated: tier({ expiresInSeconds: 40 }) } }))).toContain('under a minute left');
  });

  test('no elevated tier in the response means nothing to say', () => {
    expect(renewalNote(signedIn())).toBeUndefined();
  });

  test('an already-broken elevated token gets no countdown, the reassurance says it elsewhere', () => {
    expect(renewalNote(signedIn({ tiers: { elevated: tier({ available: false, refresh: 'interactive' }) } }))).toBeUndefined();
  });

  test('an elevated tier with no known expiry has nothing to count down', () => {
    expect(renewalNote(signedIn({ tiers: { elevated: tier() } }))).toBeUndefined();
  });

  test('signed out is not a countdown either', () => {
    expect(renewalNote({ signedIn: false, message: 'not authenticated' })).toBeUndefined();
  });

  test('no status at all is not a countdown either', () => {
    expect(renewalNote(undefined)).toBeUndefined();
  });
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

  test('a healthy elevated token gets its own countdown line, same wording as the popover', () => {
    const breakdown = tokenBreakdown(signedIn({ tiers: { elevated: tier({ expiresInSeconds: 2700 }) } }));

    expect(breakdown).toContain('Colleague lookups: about 45 minutes left');
  });

  test('a broken elevated token with no expiry data just says it needs a refresh', () => {
    const breakdown = tokenBreakdown(signedIn({ tiers: { elevated: tier({ available: false, refresh: 'interactive' }) } }));

    expect(breakdown).toContain('Colleague lookups: needs a refresh');
  });

  test('an overdue elevated token says roughly how long it has been overdue', () => {
    const breakdown = tokenBreakdown(signedIn({ tiers: { elevated: tier({ available: false, refresh: 'interactive', expiresInSeconds: -720 }) } }));

    expect(breakdown).toContain('Colleague lookups: needs a refresh, expired about 12 minutes ago');
  });

  test('a token inside the pre-expiry safety buffer just says it needs a refresh, not a countdown that contradicts that', () => {
    const breakdown = tokenBreakdown(signedIn({ tiers: { elevated: tier({ available: false, refresh: 'interactive', expiresInSeconds: 200 }) } }));

    expect(breakdown).toContain('Colleague lookups: needs a refresh');
    expect(breakdown).not.toContain('ago');
  });

  test('no elevated tier in the response reads as unknown, not broken', () => {
    const breakdown = tokenBreakdown(signedIn());

    expect(breakdown).toContain('Colleague lookups: status unknown');
  });

  test('an elevated tier with no known expiry is just available, no number to give', () => {
    const breakdown = tokenBreakdown(signedIn({ tiers: { elevated: tier() } }));

    expect(breakdown).toContain('Colleague lookups: available');
  });
});
