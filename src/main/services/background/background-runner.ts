/*
 * Work the app does for the user without them asking: fetching their signature,
 * writing their voice profile, and later, remembering what a word in their inbox
 * means.
 *
 * One at a time, in order, and never more than one, because every one of these can
 * spend the user's tokens or their Microsoft 365 quota. Anything that fails fails
 * alone: a job that throws is reported and the queue carries on.
 *
 * enqueue resolves when THAT job finishes, so a settings button can await its own work
 * rather than polling for it.
 */
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { Result } from '../../../shared/result.ts';
import { err } from '../../../shared/result.ts';

export type BackgroundJob =
  | { readonly kind: 'signature-prefill'; readonly force?: boolean }
  | { readonly kind: 'voice-profile'; readonly force?: boolean }
  | { readonly kind: 'memory-extract'; readonly conversationId: string }
  | { readonly kind: 'conversation-title'; readonly conversationId: string };

//   skipped  nothing to do (already there, not signed in, no model configured)
//   failed   it was tried and did not work
export type BackgroundJobError = { readonly kind: 'skipped' | 'failed'; readonly message: string };

export type BackgroundJobState = 'queued' | 'running' | 'done' | 'skipped' | 'failed';
export type BackgroundStatusEvent = { readonly job: BackgroundJob; readonly state: BackgroundJobState; readonly message?: string };

export type BackgroundRunnerDeps = {
  readonly runJob: (job: BackgroundJob, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>;
  // Where the app watches its own background work. Nothing user-facing hangs off this;
  // it exists so a silent job is not also invisible to whoever is debugging it.
  readonly onStatus: (event: BackgroundStatusEvent) => void;
};

export type BackgroundRunner = {
  readonly enqueue: (job: BackgroundJob) => Promise<Result<null, BackgroundJobError>>;
  // Called at quit. A job left running would keep a subprocess alive after the window
  // is gone.
  readonly stop: () => void;
};

type Queued = {
  readonly job: BackgroundJob;
  readonly key: string;
  readonly settle: (outcome: Result<null, BackgroundJobError>) => void;
};

export const createBackgroundRunner = (deps: BackgroundRunnerDeps): BackgroundRunner => {
  const pending: Queued[] = [];
  // Every job asked for and not yet finished, keyed by what it is. Asking again while
  // one is in flight joins it rather than queueing a second: at launch several things
  // ask for the same prefill, and the user can click Regenerate while it runs.
  const inFlight = new Map<string, Promise<Result<null, BackgroundJobError>>>();
  const controller = new AbortController();
  let draining = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      deps.onStatus({ job: next.job, state: 'running' });
      // A job that throws must not take the queue down with it: everything after it
      // would silently never run.
      const outcome = await deps.runJob(next.job, controller.signal).catch((e: unknown): Result<null, BackgroundJobError> => err({ kind: 'failed', message: formatError(e) }));

      if (outcome.ok) deps.onStatus({ job: next.job, state: 'done' });
      else deps.onStatus({ job: next.job, state: outcome.error.kind, message: outcome.error.message });
      inFlight.delete(next.key);
      next.settle(outcome);
    }
    draining = false;
  };

  const enqueue = (job: BackgroundJob): Promise<Result<null, BackgroundJobError>> => {
    if (stopped) return Promise.resolve(err({ kind: 'skipped', message: 'the app is closing' }));

    const key = JSON.stringify(job);
    const already = inFlight.get(key);
    if (already !== undefined) return already;

    const flight = new Promise<Result<null, BackgroundJobError>>((resolve) => {
      pending.push({ job, key, settle: resolve });
      deps.onStatus({ job, state: 'queued' });
    });
    inFlight.set(key, flight);
    void drain();
    return flight;
  };

  const stop = (): void => {
    stopped = true;
    controller.abort();
    for (const queued of pending.splice(0)) {
      inFlight.delete(queued.key);
      queued.settle(err({ kind: 'skipped', message: 'the app is closing' }));
    }
  };

  return { enqueue, stop };
};
