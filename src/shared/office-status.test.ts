import { describe, expect, test } from 'bun:test';
import { parseScopesCheck } from './office-status.ts';

// A trimmed shape of the real `scopes-check --output json` envelope when signed in.
const signedIn = JSON.stringify({
  ok: true,
  data: {
    scopes: ['Mail.Read', 'Calendars.Read', 'Files.ReadWrite.All'],
    audience: '00000003-0000-0000-c000-000000000000',
    expiresAt: '2026-07-20T06:39:04.000Z',
    expiresInSeconds: 6312,
  },
});

describe('reading the office sign-in status from scopes-check', () => {
  test('a valid cached token reports signed in with its exact scopes and expiry', () => {
    const status = parseScopesCheck(signedIn);

    expect(status.signedIn).toBe(true);
    if (!status.signedIn) throw new Error('expected signed in');
    expect(status.scopes).toEqual(['Mail.Read', 'Calendars.Read', 'Files.ReadWrite.All']);
    expect(status.expiresAt).toBe('2026-07-20T06:39:04.000Z');
  });

  test('non-string entries in the scopes array are dropped', () => {
    const status = parseScopesCheck(JSON.stringify({ ok: true, data: { scopes: ['Mail.Read', 7, null], expiresAt: 'x' } }));

    expect(status.signedIn).toBe(true);
    if (!status.signedIn) throw new Error('expected signed in');
    expect(status.scopes).toEqual(['Mail.Read']);
  });

  test('ok true with no readable data is still signed in, with empty scopes and no expiry', () => {
    const status = parseScopesCheck('{"ok":true}');

    expect(status.signedIn).toBe(true);
    if (!status.signedIn) throw new Error('expected signed in');
    expect(status.scopes).toEqual([]);
    expect(status.expiresAt).toBe('');
  });
});

describe('a signed-out or unreadable probe', () => {
  test('a non-empty error is surfaced verbatim', () => {
    const status = parseScopesCheck('{"ok":false,"error":"no cached token; run login"}');

    expect(status.signedIn).toBe(false);
    if (status.signedIn) throw new Error('expected signed out');
    expect(status.message).toBe('no cached token; run login');
  });

  test('an ok:false envelope with a blank error falls back to the raw output', () => {
    const status = parseScopesCheck('{"ok":false,"error":""}');

    expect(status.signedIn).toBe(false);
    if (status.signedIn) throw new Error('expected signed out');
    expect(status.message).toBe('{"ok":false,"error":""}');
  });

  test('an ok:false envelope with no error field falls back to the raw output', () => {
    const status = parseScopesCheck('{"ok":false}');

    expect(status.signedIn).toBe(false);
    if (status.signedIn) throw new Error('expected signed out');
    expect(status.message).toBe('{"ok":false}');
  });

  test('output that is not json is reported signed out, trimmed of surrounding space', () => {
    const status = parseScopesCheck('  the cli crashed  ');

    expect(status.signedIn).toBe(false);
    if (status.signedIn) throw new Error('expected signed out');
    expect(status.message).toBe('the cli crashed');
  });

  test('empty or whitespace-only output gets a default message', () => {
    const status = parseScopesCheck('   ');

    expect(status.signedIn).toBe(false);
    if (status.signedIn) throw new Error('expected signed out');
    expect(status.message).toBe('not signed in');
  });

  test('a bare json null does not crash and is reported signed out', () => {
    expect(parseScopesCheck('null').signedIn).toBe(false);
  });
});

describe('reading the health of every cached token, not just the first', () => {
  const check = (data: Record<string, unknown>): ReturnType<typeof parseScopesCheck> => parseScopesCheck(JSON.stringify({ ok: true, data }));

  test('the seconds left on the basic token are kept, so a dot can warn before it expires', () => {
    const status = check({ scopes: ['Mail.Read'], expiresAt: '2026-07-21T12:00:00.000Z', expiresInSeconds: 240 });

    expect(status).toMatchObject({ signedIn: true, expiresInSeconds: 240 });
  });

  test('a tier block is read whole', () => {
    const status = check({ elevated: { available: false, expiresInSeconds: -60, scopes: ['Files.Read.All'], refresh: 'interactive', reason: 'sign in again to restore it' } });

    expect(status).toMatchObject({
      signedIn: true,
      tiers: { elevated: { available: false, expiresInSeconds: -60, scopes: ['Files.Read.All'], refresh: 'interactive', reason: 'sign in again to restore it' } },
    });
  });

  test('all three tiers are read', () => {
    const tier = { available: true, scopes: [], refresh: 'automatic' };
    const status = check({ elevated: tier, chatsvcagg: tier, ic3: tier });

    expect(status).toMatchObject({ signedIn: true, tiers: { elevated: {}, chatsvcagg: {}, ic3: {} } });
  });

  test('a refresh route that is not the interactive one is treated as self-healing', () => {
    // The safe assumption: a tier that heals itself needs nothing from the user.
    const status = check({ elevated: { available: true, scopes: [], refresh: 'whatever' } });

    expect(status).toMatchObject({ tiers: { elevated: { refresh: 'automatic' } } });
  });

  test('a tier with no availability claim is ignored rather than guessed at', () => {
    const status = check({ elevated: { scopes: [] } });

    expect(status).toMatchObject({ tiers: {} });
  });

  test('an older CLI with no tier blocks still reads as signed in', () => {
    const status = check({ scopes: ['Mail.Read'], expiresAt: '2026-07-21T12:00:00.000Z' });

    expect(status).toMatchObject({ signedIn: true, tiers: {} });
    expect(status).not.toHaveProperty('expiresInSeconds');
  });

  test('a response whose data is not an object still reads as signed in with nothing known', () => {
    const status = parseScopesCheck(JSON.stringify({ ok: true, data: 'nope' }));

    expect(status).toEqual({ signedIn: true, scopes: [], expiresAt: '', tiers: {} });
  });

  test('a tier reason is only carried when the CLI gave one', () => {
    const status = check({ elevated: { available: true, scopes: [], refresh: 'automatic' } });

    expect(status).toMatchObject({ tiers: { elevated: { available: true } } });
    expect((status as { tiers: { elevated?: Record<string, unknown> } }).tiers.elevated).not.toHaveProperty('reason');
  });
});
