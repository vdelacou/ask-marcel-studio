/*
 * The Claude plan service: ask Claude Code who is signed in, and open its own sign-in.
 *
 * Pure orchestration with an injected `run` seam (hard rule 13), so no child process is
 * spawned in a test. The seam launches the Claude Code binary the agent's turns run; this
 * module owns only the policy: which command, how its output is read (the shared parser),
 * the deadlines, and the single-flight lock that stops a second sign-in opening a second
 * browser window.
 *
 * The sign-in is Claude Code's, start to finish. `auth login --claudeai` runs Anthropic's
 * browser flow and stores the token where Claude Code keeps it; nothing here reads, stores
 * or relays it, which is what Anthropic's terms ask of an app built on Claude Code.
 */
import { parseClaudeAuthStatus } from '../../../shared/claude-plan.ts';
import type { ClaudePlanStatus } from '../../../shared/claude-plan.ts';
import type { ClaudePlanError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err } from '../../../shared/result.ts';

export type ClaudeRunOutcome =
  | { readonly ran: true; readonly stdout: string; readonly stderr: string; readonly code: number; readonly timedOut: boolean }
  // Could not even launch Claude Code (missing binary, permission): distinct from a Claude
  // Code that ran and reported a problem of its own.
  | { readonly ran: false; readonly message: string };

export type ClaudeRun = (args: readonly string[], timeoutMs: number) => Promise<ClaudeRunOutcome>;

export type ClaudePlanService = {
  readonly status: () => Promise<Result<ClaudePlanStatus, ClaudePlanError>>;
  // Resolves with the status once the browser sign-in has ended, so the screen can show who
  // is now signed in without asking again.
  readonly login: () => Promise<Result<ClaudePlanStatus, ClaudePlanError>>;
};

// `auth status` reads local state, so it is quick; the sign-in waits on a person in a
// browser, so it gets ten minutes, like the Microsoft 365 one.
const STATUS_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 600_000;

// `auth status` exits 1 when nobody is signed in and still prints its json, so the exit
// code says nothing the output does not: only the output is read.
const STATUS_ARGS = ['auth', 'status', '--json'];
// --claudeai: the subscription sign-in, never the Console one, which bills an api key.
const LOGIN_ARGS = ['auth', 'login', '--claudeai'];

const loginFailure = (outcome: Extract<ClaudeRunOutcome, { ran: true }>): ClaudePlanError => {
  if (outcome.timedOut) return { kind: 'timed-out', message: 'the sign-in timed out after ten minutes' };
  const reason = outcome.stderr.trim();
  return { kind: 'login-failed', message: reason.length > 0 ? reason : `the sign-in exited with code ${String(outcome.code)}` };
};

export const createClaudePlanService = (run: ClaudeRun): ClaudePlanService => {
  let loginInFlight: Promise<Result<ClaudePlanStatus, ClaudePlanError>> | undefined;

  const status = async (): Promise<Result<ClaudePlanStatus, ClaudePlanError>> => {
    const outcome = await run(STATUS_ARGS, STATUS_TIMEOUT_MS);
    if (!outcome.ran) return err({ kind: 'spawn-failed', message: outcome.message });
    const parsed = parseClaudeAuthStatus(outcome.stdout);
    return parsed.ok ? parsed : err({ kind: 'unreadable', message: parsed.error });
  };

  const runLogin = async (): Promise<Result<ClaudePlanStatus, ClaudePlanError>> => {
    const outcome = await run(LOGIN_ARGS, LOGIN_TIMEOUT_MS);
    if (!outcome.ran) return err({ kind: 'spawn-failed', message: outcome.message });
    if (outcome.timedOut || outcome.code !== 0) return err(loginFailure(outcome));
    return status();
  };

  const login = (): Promise<Result<ClaudePlanStatus, ClaudePlanError>> => {
    if (loginInFlight !== undefined) return Promise.resolve(err({ kind: 'busy', message: 'a sign-in is already in progress' }));
    const flight = runLogin().finally(() => {
      loginInFlight = undefined;
    });
    loginInFlight = flight;
    return flight;
  };

  return { status, login };
};
