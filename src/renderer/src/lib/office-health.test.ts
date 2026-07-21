import { describe, expect, test } from 'bun:test';
import { healthFromStatus } from './office-health.ts';
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
