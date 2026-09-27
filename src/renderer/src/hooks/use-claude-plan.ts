/*
 * The Claude plan sign-in as the models screen sees it: who is signed in, and the button
 * that opens Claude Code's own browser sign-in.
 *
 * Asked only while a Claude plan provider is on screen, so nobody who has none ever
 * launches Claude Code from here. Read once when that becomes true, and taken from the
 * sign-in's own answer afterwards, which already carries the fresh status. The plan's models
 * are asked of Claude Code too, on demand; the page decides when and where they land.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PlanModelsState, PlanSignInState } from '../lib/claude-plan-view.ts';

export type UseClaudePlan = {
  readonly state: PlanSignInState;
  readonly models: PlanModelsState;
  readonly signIn: () => void;
  // Resolves with the model ids Claude Code lists, or undefined when it could not list them
  // (the reason is then in `models.error`).
  readonly loadModels: () => Promise<readonly string[] | undefined>;
};

// What is kept of the last answer when a new question starts: the status still stands, an
// old failure does not.
const knownStatus = (state: PlanSignInState): Pick<PlanSignInState, 'status'> => (state.status === undefined ? {} : { status: state.status });

export const useClaudePlan = (enabled: boolean): UseClaudePlan => {
  const [state, setState] = useState<PlanSignInState>({ isSigningIn: false });
  const [models, setModels] = useState<PlanModelsState>({ isLoading: false });

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

  const loadModels = useCallback(async (): Promise<readonly string[] | undefined> => {
    setModels({ isLoading: true });
    const listed = await studio.claudePlan.models();
    if (!listed.ok) {
      setModels({ isLoading: false, error: listed.error });
      return undefined;
    }
    setModels({ isLoading: false });
    return listed.value.map((model) => model.id);
  }, []);

  return { state, models, signIn, loadModels };
};
