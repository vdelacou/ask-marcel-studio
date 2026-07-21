/*
 * Pressing Test next to a model, and remembering what came back.
 *
 * Keyed by the model's name rather than by its position: renaming a model is exactly
 * when its old verdict stops being true, and a list that shifts under a stale row
 * would otherwise show one model's answer against another's.
 */
import { useCallback, useState } from 'react';
import type { ModelTestTarget, ModelTestVerdict } from '../../../shared/model-test.ts';

export type ModelTestState = { readonly isRunning: boolean; readonly verdict?: ModelTestVerdict };

export type UseModelTest = {
  readonly tests: Readonly<Record<string, ModelTestState>>;
  readonly run: (target: ModelTestTarget) => void;
  readonly clear: () => void;
};

export const useModelTest = (): UseModelTest => {
  const [tests, setTests] = useState<Readonly<Record<string, ModelTestState>>>({});

  const run = useCallback((target: ModelTestTarget): void => {
    const key = target.modelId;
    setTests((current) => ({ ...current, [key]: { isRunning: true } }));
    void (async (): Promise<void> => {
      const verdict = await studio.models.test(target);
      setTests((current) => ({ ...current, [key]: { isRunning: false, verdict } }));
    })();
  }, []);

  // Closing a provider forgets its results: they belong to the key and address that
  // were on screen at the time, and both may be different next time it opens.
  const clear = useCallback((): void => setTests({}), []);

  return { tests, run, clear };
};
