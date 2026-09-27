/*
 * The Claude plan sign-in as the models screen sees it: who is signed in, and the button
 * that opens Claude Code's own browser sign-in.
 *
 * Asked only while a Claude plan provider is on screen, so nobody who has none ever
 * launches Claude Code from here. Read once when that becomes true, and taken from the
 * sign-in's own answer afterwards, which already carries the fresh status.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PlanSignInState } from '../lib/claude-plan-view.ts';

export type UseClaudePlan = {
  readonly state: PlanSignInState;
  readonly signIn: () => void;
};

// What is kept of the last answer when a new question starts: the status still stands, an
// old failure does not.
const knownStatus = (state: PlanSignInState): Pick<PlanSignInState, 'status'> => (state.status === undefined ? {} : { status: state.status });

export const useClaudePlan = (enabled: boolean): UseClaudePlan => {
  const [state, setState] = useState<PlanSignInState>({ isSigningIn: false });

  useEffect(() => {
    if (!enabled) return;
    void (async (): Promise<void> => {
      const read = await studio.claudePlan.status();
      setState((current) => (read.ok ? { isSigningIn: current.isSigningIn, status: read.value } : { ...current, error: read.error }));
    })();
  }, [enabled]);

  const signIn = useCallback((): void => {
    setState((current) => ({ ...knownStatus(current), isSigningIn: true }));
    void (async (): Promise<void> => {
      const done = await studio.claudePlan.login();
      setState((current) => (done.ok ? { isSigningIn: false, status: done.value } : { ...knownStatus(current), isSigningIn: false, error: done.error }));
    })();
  }, []);

  return { state, signIn };
};
