/*
 * The things Marcel noticed and has not been told about yet.
 *
 * Wiring only. Nothing here decides when to show anything: the list is read at launch and
 * again whenever the main process says the queue changed, and the user opens the review
 * surface when they feel like it. Answering returns the items still waiting, so a row
 * leaves the list without a second read.
 *
 * The answers being written on the cards live here too, beside the list rather than on the
 * Memory page: closing Memory, or leaving it for the conversation a word was heard in, keeps
 * whatever was typed on a card. A card's answer is forgotten once it has landed, not before, so
 * a refusal leaves the words on the card.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';
import { emptyDrafts, forgetDraft } from '../lib/memory-review.ts';
import type { MemoryAnswer, MemoryDrafts } from '../lib/memory-review.ts';

export type MemoryController = {
  readonly pending: readonly MemoryCandidate[];
  // The row being written to disk right now, if any: only that row's buttons wait.
  readonly savingId?: string;
  readonly error?: string;
  // The suggestion skipped last, while that skip can still be taken back.
  readonly lastSkipped?: MemoryCandidate;
  // `term` is the word as the user left it: they may have corrected what Marcel heard. `kind`
  // is the list they filed it under, which may not be the one Marcel guessed.
  readonly remember: (id: string, detail: string, term: string, kind: MemoryFileName) => void;
  // For good: the word is never asked about again, unless the skip is taken back.
  readonly skip: (id: string) => void;
  readonly restore: (candidate: MemoryCandidate) => void;
  // Every answer, one after another. The first refusal stops the run and says why; what was
  // answered before it stays answered.
  readonly rememberAll: (answers: readonly MemoryAnswer[]) => void;
  // True while Remember all is working through the list: every row waits.
  readonly isAnsweringAll: boolean;
  // After everything was cleared, an earlier skip is no longer something to take back.
  readonly forgetSkip: () => void;
  readonly dismissError: () => void;
  // What is written on each card, by candidate.
  readonly drafts: MemoryDrafts;
  readonly changeDrafts: (change: (current: MemoryDrafts) => MemoryDrafts) => void;
};

export const useMemory = (): MemoryController => {
  const [pending, setPending] = useState<readonly MemoryCandidate[]>([]);
  const [savingId, setSavingId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastSkipped, setLastSkipped] = useState<MemoryCandidate | undefined>(undefined);
  const [isAnsweringAll, setIsAnsweringAll] = useState(false);
  const [drafts, setDrafts] = useState<MemoryDrafts>(emptyDrafts);

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

  // `skipped` is what the answer leaves to be taken back: the candidate after a skip, nothing
  // after anything else.
  const answer = useCallback((id: string, resolve: () => Promise<Awaited<ReturnType<typeof studio.memory.resolve>>>, skipped?: MemoryCandidate): void => {
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
      setDrafts((current) => forgetDraft(current, id));
      setLastSkipped(skipped);
    })();
  }, []);

  const remember = useCallback(
    (id: string, detail: string, term: string, kind: MemoryFileName): void => {
      answer(id, () => studio.memory.resolve({ id, action: 'accept', detail, term, kind }));
    },
    [answer]
  );

  const skip = useCallback(
    (id: string): void => {
      answer(
        id,
        () => studio.memory.resolve({ id, action: 'reject' }),
        pending.find((candidate) => candidate.id === id)
      );
    },
    [answer, pending]
  );

  const restore = useCallback(
    (candidate: MemoryCandidate): void => {
      answer(candidate.id, () => studio.memory.resolve({ action: 'restore', candidate }));
    },
    [answer]
  );

  const rememberAll = useCallback((answers: readonly MemoryAnswer[]): void => {
    setError(undefined);
    setIsAnsweringAll(true);
    void (async (): Promise<void> => {
      for (const answer of answers) {
        const left = await studio.memory.resolve({ id: answer.id, action: 'accept', detail: answer.detail, term: answer.term, kind: answer.kind });
        if (!left.ok) {
          setError(left.error.message);
          break;
        }
        setPending(left.value);
        setDrafts((current) => forgetDraft(current, answer.id));
      }
      setIsAnsweringAll(false);
      setLastSkipped(undefined);
    })();
  }, []);

  const forgetSkip = useCallback((): void => setLastSkipped(undefined), []);

  const dismissError = useCallback((): void => setError(undefined), []);

  return {
    pending,
    ...(savingId === undefined ? {} : { savingId }),
    ...(error === undefined ? {} : { error }),
    ...(lastSkipped === undefined ? {} : { lastSkipped }),
    remember,
    skip,
    restore,
    rememberAll,
    isAnsweringAll,
    forgetSkip,
    dismissError,
    drafts,
    changeDrafts: setDrafts,
  };
};
