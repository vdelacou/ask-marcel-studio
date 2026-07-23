import { describe, expect, test } from 'bun:test';
import { dotLabel, healthFromStatus, loginErrorMessage, popoverViewFromStatus } from './office-health.ts';
import type { OfficeStatus, TokenTier } from '../../../shared/office-status.ts';

const tier = (over: Partial<TokenTier> = {}): TokenTier => ({ available: true, scopes: [], refresh: 'automatic', ...over });

const signedIn = (over: Partial<Extract<OfficeStatus, { signedIn: true }>> = {}): OfficeStatus => ({
  signedIn: true,
  scopes: ['Mail.Read'],
  expiresAt: '2026-07-21T12:00:00.000Z',
  tiers: {},
  ...over,
});

describe('reporting whether Microsoft 365 is working', () => {
  test('a healthy sign-in says so', () => {
    expect(healthFromStatus(signedIn())).toEqual({ health: 'healthy', message: 'Connected to Microsoft 365.' });
  });

  test('every tier available is still healthy', () => {
    expect(healthFromStatus(signedIn({ tiers: { elevated: tier(), chatsvcagg: tier(), ic3: tier() } })).health).toBe('healthy');
  });

  test('a signed-out user is signed out', () => {
    expect(healthFromStatus({ signedIn: false, message: 'not authenticated' }).health).toBe('signed-out');
  });

  test('a probe that could not run reads as signed out, because nothing will work either way', () => {
    expect(healthFromStatus(undefined).health).toBe('signed-out');
  });

  test('an expired main token is signed out however cheerful the rest of the response is', () => {
    expect(healthFromStatus(signedIn({ expiresInSeconds: -30, tiers: { elevated: tier() } })).health).toBe('signed-out');
  });

  test('a token that expired exactly now is expired', () => {
    expect(healthFromStatus(signedIn({ expiresInSeconds: 0 })).health).toBe('signed-out');
  });

  test('a token with seconds left is fine', () => {
    expect(healthFromStatus(signedIn({ expiresInSeconds: 240 })).health).toBe('healthy');
  });

  test('one tier gone needs attention, even though mail still works', () => {
    // The quiet failure: looking a colleague up starts failing while everything else
    // carries on, and nothing else in the app would say so.
    expect(healthFromStatus(signedIn({ tiers: { elevated: tier({ available: false }) } })).health).toBe('attention');
  });

  test('the reason the CLI gave is what the user is told', () => {
    const view = healthFromStatus(signedIn({ tiers: { elevated: tier({ available: false, reason: 'the people directory needs a fresh sign-in' }) } }));

    expect(view.message).toBe('the people directory needs a fresh sign-in');
  });

  test('a tier gone with no reason still says something useful', () => {
    const view = healthFromStatus(signedIn({ tiers: { ic3: tier({ available: false }) } }));

    expect(view.message).toContain('expired');
  });

  test('a healthy tier alongside a broken one does not hide it', () => {
    expect(healthFromStatus(signedIn({ tiers: { elevated: tier(), ic3: tier({ available: false }) } })).health).toBe('attention');
  });
});

describe('what the sign-in popover says', () => {
  test('a healthy sign-in offers a refresh and a way out, and names nothing as broken', () => {
    const view = popoverViewFromStatus(signedIn());

    expect(view.action).toBe('refresh');
    expect(view.canSignOut).toBe(true);
    expect(view.unavailable).toEqual([]);
  });

  test('a dead elevated token says colleague details stopped working', () => {
    const view = popoverViewFromStatus(signedIn({ tiers: { elevated: tier({ available: false }) } }));

    expect(view.health).toBe('attention');
    expect(view.unavailable).toEqual(['Look up colleague details like phone numbers, offices and managers']);
  });

  test('a degraded sign-in promises the user will not have to sign in again from scratch', () => {
    const view = popoverViewFromStatus(signedIn({ tiers: { elevated: tier({ available: false }) } }));

    expect(view.reassurance).toContain('will not need to sign in again');
    expect(view.action).toBe('refresh');
  });

  test('both Teams tokens gone is one thing that stopped working, not two', () => {
    const view = popoverViewFromStatus(signedIn({ tiers: { chatsvcagg: tier({ available: false }), ic3: tier({ available: false }) } }));

    expect(view.unavailable).toEqual(['Read your Teams chats']);
  });

  test('an expired sign-in asks for a new one and offers no sign-out', () => {
    const view = popoverViewFromStatus({ signedIn: false, message: 'not authenticated' });

    expect(view.action).toBe('sign-in');
    expect(view.canSignOut).toBe(false);
    expect(view.headline).toContain('sign in again');
  });

  test('while the check is still running nothing is claimed to be broken', () => {
    const view = popoverViewFromStatus(undefined, true);

    expect(view.health).toBe('checking');
    expect(view.unavailable).toEqual([]);
  });
});

describe('explaining why a sign-in did not finish', () => {
  test('a sign-in already open tells the user to finish that one', () => {
    expect(loginErrorMessage({ kind: 'busy', message: 'a sign-in is already in progress' })).toContain('already open');
  });

  test('closing the browser window reads as try again, not as a failure to fear', () => {
    expect(loginErrorMessage({ kind: 'login-failed', message: 'login exited with code 1' })).toContain('try again');
  });

  test('a sign-in left open too long says so in plain words', () => {
    expect(loginErrorMessage({ kind: 'timed-out', message: 'sign-in timed out after ten minutes' })).toContain('too long');
  });

  test('a sign-in that could not even start asks for a restart', () => {
    expect(loginErrorMessage({ kind: 'spawn-failed', message: 'ENOENT' })).toContain('Restart the app');
  });
});

describe('what the dot says on hover', () => {
  test('a degraded sign-in is described in words, not in the cli’s own reason string', () => {
    expect(dotLabel('attention')).toBe('Part of your Microsoft 365 sign-in has expired');
  });

  test('every state has something to say', () => {
    expect([dotLabel('checking'), dotLabel('healthy'), dotLabel('signed-out')].every((label) => label.length > 0)).toBe(true);
  });
});
