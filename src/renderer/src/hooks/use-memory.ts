/*
 * The things Marcel noticed and has not been told about yet.
 *
 * Wiring only. Nothing here decides when to show anything: the list is read at launch and
 * again whenever the main process says the queue changed, and the user opens the review
 * surface when they feel like it. Answering returns the items still waiting, so a row
 * leaves the list without a second read.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';

export type MemoryController = {
  readonly pending: readonly MemoryCandidate[];
  // The row being written to disk right now, if any: only that row's buttons wait.
  readonly savingId?: string;
  readonly error?: string;
  // `term` is the word as the user left it: they may have corrected what Marcel heard.
  readonly remember: (id: string, detail: string, term: string) => void;
  readonly skip: (id: string) => void;
  readonly dismissError: () => void;
};

export const useMemory = (): MemoryController => {
  const [pending, setPending] = useState<readonly MemoryCandidate[]>([]);
  const [savingId, setSavingId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback((): void => {
    void (async (): Promise<void> => {
      const waiting = await studio.memory.pending();
      if (!waiting.ok) {
        setError(waiting.error.message);
        return;
      }
      setPending(waiting.value);
    })();
  }, []);

  useEffect(load, [load]);

  useEffect(() => studio.memory.onEvent(load), [load]);

  const answer = useCallback((id: string, resolve: () => Promise<Awaited<ReturnType<typeof studio.memory.resolve>>>): void => {
    setError(undefined);
    setSavingId(id);
    void (async (): Promise<void> => {
      const left = await resolve();
      setSavingId(undefined);
      if (!left.ok) {
        setError(left.error.message);
        return;
      }
      setPending(left.value);
    })();
  }, []);

  const remember = useCallback(
    (id: string, detail: string, term: string): void => {
      answer(id, () => studio.memory.resolve({ id, action: 'accept', detail, term }));
    },
    [answer]
  );

  const skip = useCallback(
    (id: string): void => {
      answer(id, () => studio.memory.resolve({ id, action: 'reject' }));
    },
    [answer]
  );

  const dismissError = useCallback((): void => setError(undefined), []);

  return {
    pending,
    ...(savingId === undefined ? {} : { savingId }),
    ...(error === undefined ? {} : { error }),
    remember,
    skip,
    dismissError,
  };
};
