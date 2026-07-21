/*
 * Pressing Test next to a model.
 *
 * The one outbound call in the app that is not the agent: a single request to the
 * provider, with a deadline, whose answer is a sentence rather than a stack trace.
 * The shape of the request and the reading of the status are pure (shared/model-test);
 * this is the shell that makes the call and refuses to throw.
 *
 * No retry, deliberately. A failed test is not a failed operation: the person is
 * standing there and can press it again, and a silent retry would only make a slow
 * endpoint look slower.
 *
 * fetch is a dependency, not an import, so the whole thing is testable without a
 * network (rule 13).
 */
import { buildModelTestRequest, checkTarget, TOO_SLOW, UNREACHABLE, verdictForStatus } from '../../../shared/model-test.ts';
import type { ModelTestTarget, ModelTestVerdict } from '../../../shared/model-test.ts';

export type ModelTestFetch = (
  url: string,
  init: { readonly method: string; readonly headers: Record<string, string>; readonly body: string; readonly signal: AbortSignal }
) => Promise<{ readonly status: number }>;

export type ModelTestDeps = {
  readonly fetch: ModelTestFetch;
  readonly timeoutMs?: number;
};

// Long enough for a cold model on a slow link, short enough that a wrong address does
// not leave a button spinning.
const DEFAULT_TIMEOUT_MS = 15_000;

// AbortSignal.timeout raises TimeoutError; an aborted controller raises AbortError.
// Everything else (DNS, refused connection, TLS) is simply not reaching them.
const isDeadline = (error: unknown): boolean => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

export type ModelTestService = {
  // Never rejects, and never fails: not reaching the provider IS the answer.
  readonly test: (target: ModelTestTarget) => Promise<ModelTestVerdict>;
};

export const createModelTestService = (deps: ModelTestDeps): ModelTestService => {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const test = async (target: ModelTestTarget): Promise<ModelTestVerdict> => {
    const missing = checkTarget(target);
    if (missing !== undefined) return missing;

    const request = buildModelTestRequest(target);
    try {
      const response = await deps.fetch(request.url, { method: 'POST', headers: { ...request.headers }, body: request.body, signal: AbortSignal.timeout(timeoutMs) });
      return verdictForStatus(response.status);
    } catch (error) {
      // The provider's own failure text is never surfaced: it is written for whoever
      // built the endpoint, and it is where a key would leak into a screenshot.
      return isDeadline(error) ? TOO_SLOW : UNREACHABLE;
    }
  };

  return { test };
};
