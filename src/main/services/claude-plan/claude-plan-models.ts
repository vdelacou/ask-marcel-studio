/*
 * Which models the Claude plan offers, asked of Claude Code itself.
 *
 * Pure orchestration behind a `ClaudeModelList` seam (hard rule 13): the IO shell starts a
 * session whose prompt never yields and reads the SDK's `supportedModels()`, so nothing here
 * spawns anything in a test. This module owns the policy: the deadline, how the answer is
 * read (the shared parser, since it crosses a process boundary), and what a failure is called.
 * The list goes through Claude Code's own sign-in, so the app still never holds a token.
 */
import { parsePlanModels } from '../../../shared/claude-plan.ts';
import type { PlanModel } from '../../../shared/claude-plan.ts';
import type { ClaudePlanError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err } from '../../../shared/result.ts';

export type ClaudeModelListOutcome =
  | { readonly listed: true; readonly models: unknown }
  // Could not get an answer: Claude Code did not start, or did not answer before the deadline.
  | { readonly listed: false; readonly timedOut: boolean; readonly message: string };

export type ClaudeModelList = (timeoutMs: number) => Promise<ClaudeModelListOutcome>;

export type ClaudePlanModels = {
  readonly list: () => Promise<Result<readonly PlanModel[], ClaudePlanError>>;
};

// Starting Claude Code and its handshake took under a second when probed; a machine that has
// not answered in fifteen is not going to.
const LIST_TIMEOUT_MS = 15_000;

export const createClaudePlanModels = (listModels: ClaudeModelList): ClaudePlanModels => {
  const list = async (): Promise<Result<readonly PlanModel[], ClaudePlanError>> => {
    const outcome = await listModels(LIST_TIMEOUT_MS);
    if (!outcome.listed) return err({ kind: outcome.timedOut ? 'timed-out' : 'spawn-failed', message: outcome.message });
    const parsed = parsePlanModels(outcome.models);
    return parsed.ok ? parsed : err({ kind: 'unreadable', message: parsed.error });
  };

  return { list };
};
