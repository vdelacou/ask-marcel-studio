import { describe, expect, test } from 'bun:test';
import { createVoiceProfileJob } from './voice-profile-job.ts';
import type { RunAgentText } from './background-agent-io.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

const PROFILE = `# Writing voice\n\n${'Short sentences. First names. No emoji. '.repeat(10)}`;

type Scripted = {
  readonly hasProfile?: boolean;
  readonly answer?: Result<string, string>;
  readonly session?: Result<{ model: string; cwd: string; env: Record<string, string>; hooks: Record<string, never> }, string>;
  readonly write?: Result<null, string>;
};

const job = (
  scripted: Scripted = {}
): { readonly run: (force?: boolean) => Promise<Result<null, { readonly kind: 'skipped' | 'failed'; readonly message: string }>>; readonly written: string[] } => {
  const written: string[] = [];
  const runAgentText: RunAgentText = () => Promise.resolve(scripted.answer ?? ok(PROFILE));
  const built = createVoiceProfileJob({
    runAgentText,
    prompt: 'read their sent mail',
    hasProfile: () => Promise.resolve(scripted.hasProfile ?? false),
    write: (markdown) => {
      written.push(markdown);
      return Promise.resolve(scripted.write ?? ok(null));
    },
    session: () => Promise.resolve(scripted.session ?? ok({ model: 'anthropic::m', cwd: '/scratch', env: {}, hooks: {} })),
  });
  return { run: (force = false) => built.run(force, new AbortController().signal), written };
};

describe('writing the user’s voice profile from their sent mail', () => {
  test('what the model returns is what gets stored', async () => {
    const { run, written } = job();

    expect(await run()).toEqual({ ok: true, value: null });
    expect(written[0]).toBe(PROFILE.trim());
  });

  test('a profile the user already has is never overwritten', async () => {
    const { run, written } = job({ hasProfile: true });

    expect(await run()).toEqual({ ok: false, error: { kind: 'skipped', message: 'there is already a writing voice' } });
    expect(written).toEqual([]);
  });

  test('asking for it explicitly rebuilds it', async () => {
    const { run, written } = job({ hasProfile: true });

    expect((await run(true)).ok).toBe(true);
    expect(written).toHaveLength(1);
  });

  test('a fenced answer is unwrapped: the file has to be markdown, not a code block', async () => {
    const { run, written } = job({ answer: ok(`\`\`\`markdown\n${PROFILE.trim()}\n\`\`\``) });

    await run();

    expect(written[0]).toBe(PROFILE.trim());
  });

  test('a plain fence is unwrapped too', async () => {
    const { run, written } = job({ answer: ok(`\`\`\`\n${PROFILE.trim()}\n\`\`\``) });

    await run();

    expect(written[0]).toBe(PROFILE.trim());
  });

  test('an answer too short to be a profile is skipped rather than stored', async () => {
    // The prompt tells it to say so in one line when there is not enough sent mail.
    const { run, written } = job({ answer: ok('Not enough sent mail to tell.') });

    const done = await run();

    expect(done).toEqual({ ok: false, error: { kind: 'skipped', message: 'not enough sent mail to tell how you write yet' } });
    expect(written).toEqual([]);
  });

  test('an answer longer than the file allows is clipped, because it is read before every draft', async () => {
    const { run, written } = job({ answer: ok('x'.repeat(20_000)) });

    await run();

    expect(written[0]).toHaveLength(8_192);
  });

  test('no model configured is skipped quietly: nothing was asked for', async () => {
    const { run } = job({ session: err('no model is set up yet') });

    expect(await run()).toEqual({ ok: false, error: { kind: 'skipped', message: 'no model is set up yet' } });
  });

  test('a turn that failed is a failure, not a skip: something was tried', async () => {
    const { run } = job({ answer: err('the model refused') });

    expect(await run()).toEqual({ ok: false, error: { kind: 'failed', message: 'the model refused' } });
  });

  test('a write that cannot land is a failure', async () => {
    const { run } = job({ write: err('disk full') });

    expect(await run()).toEqual({ ok: false, error: { kind: 'failed', message: 'disk full' } });
  });
});
