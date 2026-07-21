import { describe, expect, test } from 'bun:test';
import { createBackgroundRunner } from './background-runner.ts';
import type { BackgroundJob, BackgroundJobError, BackgroundStatusEvent } from './background-runner.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

const done = (): Result<null, BackgroundJobError> => ok(null);

const runner = (
  runJob: (job: BackgroundJob, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>
): { readonly runner: ReturnType<typeof createBackgroundRunner>; readonly events: BackgroundStatusEvent[] } => {
  const events: BackgroundStatusEvent[] = [];
  return { runner: createBackgroundRunner({ runJob, onStatus: (event) => events.push(event) }), events };
};

describe('doing work for the user without them asking', () => {
  test('a job runs and its caller learns it finished', async () => {
    const { runner: background } = runner(() => Promise.resolve(done()));

    expect(await background.enqueue({ kind: 'signature-prefill' })).toEqual({ ok: true, value: null });
  });

  test('jobs run one at a time, in order, because each one spends the user’s quota', async () => {
    const order: string[] = [];
    let running = 0;
    const { runner: background } = runner(async (job) => {
      running += 1;
      expect(running).toBe(1);
      await Promise.resolve();
      order.push(job.kind);
      running -= 1;
      return done();
    });

    await Promise.all([
      background.enqueue({ kind: 'signature-prefill' }),
      background.enqueue({ kind: 'voice-profile' }),
      background.enqueue({ kind: 'memory-extract', conversationId: 'a' }),
    ]);

    expect(order).toEqual(['signature-prefill', 'voice-profile', 'memory-extract']);
  });

  test('the same job asked for again while it is running joins it rather than repeating it', async () => {
    const seen: string[] = [];
    const { runner: background } = runner(async (job) => {
      await Promise.resolve();
      seen.push(job.kind);
      return done();
    });

    await Promise.all([background.enqueue({ kind: 'voice-profile' }), background.enqueue({ kind: 'voice-profile' }), background.enqueue({ kind: 'voice-profile' })]);

    expect(seen.filter((kind) => kind === 'voice-profile')).toHaveLength(1);
  });

  test('two jobs of the same kind for different conversations are two jobs', async () => {
    const seen: string[] = [];
    const { runner: background } = runner(async (job) => {
      await Promise.resolve();
      seen.push(job.kind === 'memory-extract' ? job.conversationId : job.kind);
      return done();
    });

    await Promise.all([background.enqueue({ kind: 'memory-extract', conversationId: 'a' }), background.enqueue({ kind: 'memory-extract', conversationId: 'b' })]);

    expect(seen).toEqual(['a', 'b']);
  });

  test('a job that fails is reported and the queue carries on', async () => {
    const seen: string[] = [];
    const { runner: background } = runner(async (job) => {
      await Promise.resolve();
      seen.push(job.kind);
      return job.kind === 'signature-prefill' ? err({ kind: 'failed', message: 'no mailbox' }) : done();
    });

    const [first, second] = await Promise.all([background.enqueue({ kind: 'signature-prefill' }), background.enqueue({ kind: 'voice-profile' })]);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(seen).toEqual(['signature-prefill', 'voice-profile']);
  });

  test('a job that throws does not take the queue down with it', async () => {
    // Everything queued after it would silently never run.
    const seen: string[] = [];
    const { runner: background } = runner(async (job) => {
      await Promise.resolve();
      if (job.kind === 'signature-prefill') throw new Error('boom');
      seen.push(job.kind);
      return done();
    });

    const [first, second] = await Promise.all([background.enqueue({ kind: 'signature-prefill' }), background.enqueue({ kind: 'voice-profile' })]);

    expect(first).toEqual({ ok: false, error: { kind: 'failed', message: 'boom' } });
    expect(second.ok).toBe(true);
    expect(seen).toEqual(['voice-profile']);
  });

  test('every state change is reported, so silent work is not also invisible', async () => {
    const { runner: background, events } = runner(() => Promise.resolve(done()));

    await background.enqueue({ kind: 'voice-profile' });

    expect(events.map((event) => event.state)).toEqual(['queued', 'running', 'done']);
  });

  test('a skipped job says why', async () => {
    const { runner: background, events } = runner(() => Promise.resolve(err({ kind: 'skipped', message: 'already there' })));

    await background.enqueue({ kind: 'signature-prefill' });

    expect(events.at(-1)).toEqual({ job: { kind: 'signature-prefill' }, state: 'skipped', message: 'already there' });
  });

  test('quitting drops what is still waiting rather than leaving callers hanging', async () => {
    let release = (): void => undefined;
    const { runner: background } = runner(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return done();
    });

    const first = background.enqueue({ kind: 'signature-prefill' });
    const second = background.enqueue({ kind: 'voice-profile' });
    background.stop();
    release();

    expect(await second).toEqual({ ok: false, error: { kind: 'skipped', message: 'the app is closing' } });
    expect((await first).ok).toBe(true);
  });

  test('nothing new is accepted once the app is closing', async () => {
    const { runner: background } = runner(() => Promise.resolve(done()));
    background.stop();

    expect((await background.enqueue({ kind: 'voice-profile' })).ok).toBe(false);
  });

  test('a running job is told to stop', async () => {
    let aborted = false;
    const { runner: background } = runner(async (_job, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      await Promise.resolve();
      return done();
    });

    await background.enqueue({ kind: 'voice-profile' });
    background.stop();

    expect(aborted).toBe(true);
  });
});
