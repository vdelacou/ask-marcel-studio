/*
 * A signature the user writes while the app is still fetching one from their mailbox is
 * theirs: the fetch lands beside it and takes its place only if they still have none, or
 * asked for it. All text here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { createSignatureService } from './signature-service.ts';
import type { OfficeRun } from './office-service.ts';

const FETCH_PATH = '/scratch/claude-config/signature.fetched.html';

// Whether a signature exists, answered in turn (none when the fetch starts, then as given),
// and what became of the fetched one: put in place, or thrown away.
const fetchWhere = (
  answers: readonly boolean[],
  canKeep = true
): { readonly prefill: (force: boolean) => ReturnType<ReturnType<typeof createSignatureService>['prefill']>; readonly settled: string[] } => {
  const settled: string[] = [];
  let asked = 0;
  const run: OfficeRun = () => Promise.resolve({ ran: true, stdout: '', stderr: '', code: 0, timedOut: false });
  const built = createSignatureService({
    run,
    fetchPath: FETCH_PATH,
    hasSignature: () => {
      const answer = answers[Math.min(asked, answers.length - 1)] ?? false;
      asked += 1;
      return Promise.resolve(answer);
    },
    wroteSomething: () => Promise.resolve(true),
    keepFetched: () => {
      settled.push('kept');
      return Promise.resolve(canKeep);
    },
    dropFetched: () => {
      settled.push('dropped');
      return Promise.resolve();
    },
  });
  return { prefill: (force) => built.prefill(force), settled };
};

describe('a signature written while one was being fetched', () => {
  test('is kept, and the one fetched is thrown away', async () => {
    const { prefill, settled } = fetchWhere([false, true]);

    expect(await prefill(false)).toEqual({ ok: false, error: { kind: 'skipped', message: 'there is already a signature' } });
    expect(settled.at(-1)).toBe('dropped');
    expect(settled).not.toContain('kept');
  });

  test('is replaced when the user asked for the one in their mailbox', async () => {
    const { prefill, settled } = fetchWhere([true]);

    expect(await prefill(true)).toEqual({ ok: true, value: null });
    expect(settled.at(-1)).toBe('kept');
  });

  test('with none written meanwhile, the one fetched takes its place', async () => {
    const { prefill, settled } = fetchWhere([false]);

    expect(await prefill(false)).toEqual({ ok: true, value: null });
    expect(settled.at(-1)).toBe('kept');
  });

  test('a fetched signature that cannot be put in place is a failure, not a success', async () => {
    const { prefill } = fetchWhere([false], false);

    expect(await prefill(false)).toEqual({ ok: false, error: { kind: 'failed', message: 'the signature fetched could not be put in place' } });
  });

  test('each fetch starts from nothing, so a file left by an earlier one is never taken for this one', async () => {
    const { prefill, settled } = fetchWhere([false]);

    await prefill(false);

    expect(settled[0]).toBe('dropped');
  });
});
