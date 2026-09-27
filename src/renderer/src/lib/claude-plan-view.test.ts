import { describe, expect, test } from 'bun:test';
import { planSignInView, providerRowFlags } from './claude-plan-view.ts';
import { emptyDraft } from './provider-draft.ts';
import type { ClaudePlanError } from '../../../shared/ipc-contract.ts';

describe('showing where the Claude plan sign-in stands', () => {
  test('signed in with a known plan shows the account and the plan', () => {
    const view = planSignInView({ status: { signedIn: true, email: 'ada@example.com', plan: 'max' }, isSigningIn: false });

    expect(view).toEqual({ line: 'Signed in as ada@example.com, Max plan.', tone: 'good', buttonLabel: 'Sign in again', isBusy: false });
  });

  test('signed in with no details still says so', () => {
    expect(planSignInView({ status: { signedIn: true }, isSigningIn: false }).line).toBe('Signed in to your Claude plan.');
  });

  test('nobody signed in offers the sign-in', () => {
    const view = planSignInView({ status: { signedIn: false }, isSigningIn: false });

    expect(view.line).toBe('Not signed in.');
    expect(view.buttonLabel).toBe('Sign in with Claude');
    expect(view.isBusy).toBe(false);
  });

  test('while the status is still being read, the button waits', () => {
    const view = planSignInView({ isSigningIn: false });

    expect(view.line).toBe('Checking…');
    expect(view.isBusy).toBe(true);
  });

  test('while the browser sign-in is open, the button says so', () => {
    const view = planSignInView({ status: { signedIn: false }, isSigningIn: true });

    expect(view.buttonLabel).toBe('Signing in…');
    expect(view.line).toBe('Finish signing in in your browser.');
    expect(view.isBusy).toBe(true);
  });

  test('each failure reads as a sentence the user can act on', () => {
    const kinds: readonly ClaudePlanError['kind'][] = ['spawn-failed', 'unreadable', 'busy', 'timed-out', 'login-failed'];
    const lines = kinds.map((kind) => planSignInView({ error: { kind, message: 'internal detail' }, isSigningIn: false }));

    expect(lines[3]).toEqual({ line: 'The sign-in window stayed open too long. Try again.', tone: 'bad', buttonLabel: 'Sign in with Claude', isBusy: false });
    // One sentence per kind, never the internal message, which is written for a log.
    expect(new Set(lines.map((view) => view.line)).size).toBe(kinds.length);
    for (const view of lines) expect(view.line).not.toContain('internal detail');
  });
});

describe('flagging the provider rows that cannot work yet', () => {
  const keyed = { ...emptyDraft(), rowId: 'keyed', kind: 'anthropic' as const, apiKey: 'sk-ant-real' };
  const keyless = { ...emptyDraft(), rowId: 'keyless', kind: 'anthropic' as const, apiKey: '   ' };
  const plan = { ...emptyDraft(), rowId: 'plan', kind: 'claude-plan' as const };

  test('a provider with no key is flagged as missing its key', () => {
    expect(providerRowFlags([keyless], { signedIn: true })['keyless']).toBe('no-key');
  });

  test('a provider with a key is not flagged', () => {
    expect(providerRowFlags([keyed], { signedIn: false })['keyed']).toBeUndefined();
  });

  test('a Claude plan provider is never flagged for a key, only for a missing sign-in', () => {
    expect(providerRowFlags([plan], { signedIn: false })['plan']).toBe('not-signed-in');
    expect(providerRowFlags([plan], { signedIn: true })['plan']).toBeUndefined();
  });

  test('a Claude plan provider is not flagged while its sign-in is still being checked', () => {
    expect(providerRowFlags([plan], undefined)['plan']).toBeUndefined();
  });
});
