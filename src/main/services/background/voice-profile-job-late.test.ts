/*
 * The writing voice the user writes while the job is still reading their sent mail is theirs:
 * the job, which started because there was none, does not replace it when it finishes. All
 * text here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { createVoiceProfileJob } from './voice-profile-job.ts';
import { ok } from '../../../shared/result.ts';

const PROFILE = 'Short sentences. First names. No emoji. '.repeat(10);

// Whether a profile exists, answered in turn: none when the job starts, one by the time it is done.
const jobWhere = (answers: readonly boolean[]): { readonly run: (force: boolean) => ReturnType<ReturnType<typeof createVoiceProfileJob>['run']>; readonly written: string[] } => {
  const written: string[] = [];
  let asked = 0;
  const built = createVoiceProfileJob({
    runAgentText: () => Promise.resolve(ok(PROFILE)),
    prompt: 'read their sent mail',
    hasProfile: () => {
      const answer = answers[Math.min(asked, answers.length - 1)] ?? false;
      asked += 1;
      return Promise.resolve(answer);
    },
    write: (markdown) => {
      written.push(markdown);
      return Promise.resolve(ok(null));
    },
    session: () => Promise.resolve(ok({ model: 'anthropic::m', cwd: '/scratch', env: {}, hooks: {} })),
  });
  return { run: (force) => built.run(force, new AbortController().signal), written };
};

describe('a writing voice written while the job ran', () => {
  test('is kept: the job that found none at the start does not replace it', async () => {
    const { run, written } = jobWhere([false, true]);

    expect(await run(false)).toEqual({ ok: false, error: { kind: 'skipped', message: 'there is already a writing voice' } });
    expect(written).toEqual([]);
  });

  test('is replaced when the user asked for the rebuild', async () => {
    const { run, written } = jobWhere([false, true]);

    expect((await run(true)).ok).toBe(true);
    expect(written).toEqual([PROFILE.trim()]);
  });
});
