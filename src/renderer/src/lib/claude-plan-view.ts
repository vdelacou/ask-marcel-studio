/*
 * What the models screen says about the Claude plan sign-in, and which provider rows cannot
 * work yet.
 *
 * Lives in lib, not in a component: rule 21 keeps the design system props-only, so every
 * decision about wording and state belongs on this side of the wall. A failure is said as
 * a sentence the user can act on, never as the service's own message, which is written for
 * a log and can carry Claude Code's stderr.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { ClaudePlanStatus } from '../../../shared/claude-plan.ts';
import type { ClaudePlanError } from '../../../shared/ipc-contract.ts';
import type { PlanSignInView, ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import type { ProviderRowFlag } from '../components/molecules/provider-row/index.tsx';

export type PlanSignInState = {
  // Absent until Claude Code has answered.
  readonly status?: ClaudePlanStatus;
  readonly error?: ClaudePlanError;
  readonly isSigningIn: boolean;
};

const SIGN_IN = 'Sign in with Claude';

const FAILURES: Record<ClaudePlanError['kind'], string> = {
  'spawn-failed': 'Claude Code could not be started. Restart the app and try again.',
  unreadable: 'Claude Code answered with something unexpected. Try again.',
  busy: 'A sign-in window is already open. Finish it, or close it and try again.',
  'timed-out': 'The sign-in window stayed open too long. Try again.',
  'login-failed': 'The sign-in did not finish. If you closed the browser window, just try again.',
};

// Claude Code names the plan in lower case ("max", "pro").
const planName = (plan: string): string => `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;

const signedInLine = (status: Extract<ClaudePlanStatus, { signedIn: true }>): string => {
  if (status.email === undefined) return 'Signed in to your Claude plan.';
  return status.plan === undefined ? `Signed in as ${status.email}.` : `Signed in as ${status.email}, ${planName(status.plan)}.`;
};

export const planSignInView = (state: PlanSignInState): PlanSignInView => {
  if (state.isSigningIn) return { line: 'Finish signing in in your browser.', tone: 'muted', buttonLabel: 'Signing in…', isBusy: true };
  if (state.error !== undefined) return { line: FAILURES[state.error.kind], tone: 'bad', buttonLabel: SIGN_IN, isBusy: false };
  if (state.status === undefined) return { line: 'Checking…', tone: 'muted', buttonLabel: SIGN_IN, isBusy: true };
  if (!state.status.signedIn) return { line: 'Not signed in.', tone: 'muted', buttonLabel: SIGN_IN, isBusy: false };
  return { line: signedInLine(state.status), tone: 'good', buttonLabel: 'Sign in again', isBusy: false };
};

// A plan row is flagged only once Claude Code has said nobody is signed in: while it is
// still being asked, or could not be asked, a flag would be a guess.
const rowFlag = (draft: ProviderDraft, status: ClaudePlanStatus | undefined): ProviderRowFlag | undefined => {
  if (draft.kind === 'claude-plan') return status?.signedIn === false ? 'not-signed-in' : undefined;
  return draft.apiKey.trim().length > 0 ? undefined : 'no-key';
};

export const providerRowFlags = (drafts: readonly ProviderDraft[], status: ClaudePlanStatus | undefined): Readonly<Record<string, ProviderRowFlag>> =>
  Object.fromEntries(
    drafts.flatMap((draft) => {
      const flag = rowFlag(draft, status);
      return flag === undefined ? [] : [[draft.rowId, flag] as const];
    })
  );
