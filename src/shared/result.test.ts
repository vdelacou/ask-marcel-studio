/*
 * Test for the canonical Result helpers. Mirrors the shipped format-error.test.ts
 * pattern: result.ts is the shared kernel every later layer imports, it sits in the
 * 100% coverage tier, and it is inside the Stryker mutate glob — so it carries its
 * own test rather than waiting for an importer to cover it incidentally.
 */
import { describe, expect, test } from 'bun:test';
import { andThen, err, mapError, mapResult, ok, unwrap } from './result.ts';
import type { Result } from './result.ts';

type LoadError = { readonly kind: 'not-found'; readonly message: string };

const loaded = (title: string): Result<string, LoadError> => ok(title);
const missing = (): Result<string, LoadError> => err({ kind: 'not-found', message: 'no such conversation' });

describe('reading a value that a step successfully produced', () => {
  test('a successful step carries its value', () => {
    const result = loaded('daily standup');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('daily standup');
  });

  test('transforming a successful value applies the transform', () => {
    const result = mapResult(loaded('daily standup'), (t) => t.length);

    expect(result).toEqual({ ok: true, value: 13 });
  });

  test('chaining onto a successful step runs the next step', () => {
    const result = andThen(loaded('daily standup'), (t) => ok(t.toUpperCase()));

    expect(result).toEqual({ ok: true, value: 'DAILY STANDUP' });
  });

  test('rewriting the error of a successful step leaves the value untouched', () => {
    const result = mapError(loaded('daily standup'), () => ({ kind: 'other' as const }));

    expect(result).toEqual({ ok: true, value: 'daily standup' });
  });

  test('unwrapping a successful step returns its value', () => {
    expect(unwrap(loaded('daily standup'))).toBe('daily standup');
  });
});

describe('propagating a failure without letting it masquerade as success', () => {
  test('a failed step carries its typed error', () => {
    const result = missing();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-found');
  });

  test('transforming a failed value skips the transform and keeps the error', () => {
    const result = mapResult(missing(), (t) => t.length);

    expect(result).toEqual({ ok: false, error: { kind: 'not-found', message: 'no such conversation' } });
  });

  test('chaining onto a failed step short-circuits the next step', () => {
    const result = andThen(missing(), (t) => ok(t.toUpperCase()));

    expect(result).toEqual({ ok: false, error: { kind: 'not-found', message: 'no such conversation' } });
  });

  test('rewriting the error of a failed step replaces the error', () => {
    const result = mapError(missing(), (e) => `${e.kind}: ${e.message}`);

    expect(result).toEqual({ ok: false, error: 'not-found: no such conversation' });
  });

  test('unwrapping a failed step throws rather than returning a fake value', () => {
    expect(() => unwrap(missing())).toThrow('unwrap on err: {"kind":"not-found","message":"no such conversation"}');
  });
});
