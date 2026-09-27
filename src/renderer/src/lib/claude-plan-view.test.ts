import { describe, expect, test } from 'bun:test';
import { mergeModelsInto, planModelsView, planSignInView, providerRowFlags, shouldLoadPlanModels } from './claude-plan-view.ts';
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

describe('filling a Claude plan provider with the models Claude Code lists', () => {
  const plan = { ...emptyDraft(), rowId: 'plan', kind: 'claude-plan' as const, modelIds: ['claude-sonnet-5', '', 'sonnet'] };
  const other = { ...emptyDraft(), rowId: 'other', kind: 'anthropic' as const, modelIds: ['claude-opus-4-8'] };

  test('loaded models land in that provider only, loaded first, and a typed model stays', () => {
    const [filled, untouched] = mergeModelsInto([plan, other], 'plan', ['opus[1m]', 'sonnet']);

    // Blank rows an edit left behind go; `sonnet` is listed once, where Claude Code put it.
    expect(filled?.modelIds).toEqual(['opus[1m]', 'sonnet', 'claude-sonnet-5']);
    expect(untouched).toBe(other);
  });

  test('only a signed-in plan provider with no models is filled on its own', () => {
    const empty = { ...plan, modelIds: ['', '  '] };

    expect(shouldLoadPlanModels(empty, { signedIn: true })).toBe(true);
    expect(shouldLoadPlanModels(empty, { signedIn: false })).toBe(false);
    expect(shouldLoadPlanModels(empty, undefined)).toBe(false);
    expect(shouldLoadPlanModels(plan, { signedIn: true })).toBe(false);
    expect(shouldLoadPlanModels({ ...other, modelIds: [] }, { signedIn: true })).toBe(false);
    expect(shouldLoadPlanModels(undefined, { signedIn: true })).toBe(false);
  });

  test('while the models load, the button says so and waits', () => {
    expect(planModelsView({ isLoading: true })).toEqual({ label: 'Loading models…', isBusy: true });
  });

  test('a failed load reads as a sentence to act on, never the internal message', () => {
    const slow = planModelsView({ isLoading: false, error: { kind: 'timed-out', message: 'internal detail' } });
    const unreadable = planModelsView({ isLoading: false, error: { kind: 'unreadable', message: 'internal detail' } });

    expect(slow).toEqual({ label: 'Load models from Claude Code', isBusy: false, note: 'Claude Code took too long to list its models. Try again.' });
    expect(unreadable.note).toBe('Claude Code could not list its models. Try again, or type them by hand.');
  });
});
