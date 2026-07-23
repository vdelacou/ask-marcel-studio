/*
 * The office service: probe sign-in status, and drive the interactive login.
 *
 * Pure orchestration with an injected `run` seam (hard rule 13), so no child process
 * is spawned in a test. The seam is the SDK-side slice (how to launch the CLI), which
 * the composition root wires to child_process; this module owns only the policy: which
 * command, how its output is read (via the shared parser), the login deadline, and the
 * single-flight lock that stops a second login opening a second browser.
 */
import { parseScopesCheck } from '../../../shared/office-status.ts';
import type { OfficeStatus } from '../../../shared/office-status.ts';
import type { OfficeError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type OfficeRunOutcome =
  | { readonly ran: true; readonly stdout: string; readonly stderr: string; readonly code: number; readonly timedOut: boolean }
  // Could not even launch the CLI (missing binary, permission): distinct from a CLI
  // that ran and reported a problem of its own.
  | { readonly ran: false; readonly message: string };

export type OfficeRun = (args: readonly string[], timeoutMs: number) => Promise<OfficeRunOutcome>;

export type OfficeService = {
  readonly status: () => Promise<Result<OfficeStatus, OfficeError>>;
  // force re-captures every token, not just the ones that expired. It is the only way
  // to renew the elevated token, which carries no refresh token of its own.
  readonly login: (force: boolean) => Promise<Result<null, OfficeError>>;
  // Drops every cached token. The agent is never allowed to run this (the shell guard
  // denies it), so signing out is the user's decision alone.
  readonly logout: () => Promise<Result<null, OfficeError>>;
};

// scopes-check decodes a local token, so it is fast; login opens a browser the user
// completes by hand, so it gets ten minutes.
const STATUS_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 600_000;

export const createOfficeService = (run: OfficeRun): OfficeService => {
  let loginInFlight: Promise<Result<null, OfficeError>> | undefined;

  const status = async (): Promise<Result<OfficeStatus, OfficeError>> => {
    const outcome = await run(['scopes-check', '--output', 'json'], STATUS_TIMEOUT_MS);
    // Signed-out is a normal probe result, not an error: only a failure to launch is.
    if (!outcome.ran) return err({ kind: 'spawn-failed', message: outcome.message });
    return ok(parseScopesCheck(outcome.stdout));
  };

  const runLogin = async (force: boolean): Promise<Result<null, OfficeError>> => {
    const outcome = await run(force ? ['login', '--force'] : ['login'], LOGIN_TIMEOUT_MS);
    if (!outcome.ran) return err({ kind: 'login-failed', message: outcome.message });
    if (outcome.timedOut) return err({ kind: 'timed-out', message: 'sign-in timed out after ten minutes' });
    if (outcome.code !== 0) return err({ kind: 'login-failed', message: outcome.stderr.trim().length > 0 ? outcome.stderr.trim() : `login exited with code ${outcome.code}` });
    return ok(null);
  };

  const login = (force: boolean): Promise<Result<null, OfficeError>> => {
    if (loginInFlight !== undefined) return Promise.resolve(err({ kind: 'busy', message: 'a sign-in is already in progress' }));
    const flight = runLogin(force).finally(() => {
      loginInFlight = undefined;
    });
    loginInFlight = flight;
    return flight;
  };

  const logout = async (): Promise<Result<null, OfficeError>> => {
    const outcome = await run(['logout'], STATUS_TIMEOUT_MS);
    if (!outcome.ran) return err({ kind: 'spawn-failed', message: outcome.message });
    // A logout that reports failure because nothing was cached still leaves the user
    // signed out, which is what they asked for, so only a launch failure is an error.
    return ok(null);
  };

  return { status, login, logout };
};
