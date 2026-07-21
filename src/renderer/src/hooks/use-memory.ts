/*
 * The questions the app wants to ask, and the notes it keeps.
 *
 * Wiring only. When it is polite to ask is the pure, tested lib/memory-gate; this owns
 * the IPC, the draft answer, and the streaming count that gate needs.
 */
import { useCallback, useEffect, useState } from 'react';
import { shouldOpenMemoryDialog } from '../lib/memory-gate.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type MemoryController = {
  readonly pending: readonly MemoryCandidate[];
  readonly current?: MemoryCandidate;
  readonly isOpen: boolean;
  readonly isSaving: boolean;
  readonly selected?: string;
  readonly ownAnswer: string;
  readonly error?: string;
  readonly select: (choice: string) => void;
  readonly changeOwn: (text: string) => void;
  readonly accept: () => void;
  readonly skip: () => void;
  readonly snooze: () => void;
  readonly readNote: (name: MemoryFileName) => Promise<string>;
  readonly writeNote: (name: MemoryFileName, contents: string) => Promise<void>;
};

export type MemoryGateState = {
  readonly composerEmpty: boolean;
  readonly settingsOpen: boolean;
};

export const useMemory = (gate: MemoryGateState): MemoryController => {
  const [pending, setPending] = useState<readonly MemoryCandidate[]>([]);
  const [streaming, setStreaming] = useState<ReadonlySet<string>>(new Set());
  const [snoozed, setSnoozed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [ownAnswer, setOwnAnswer] = useState('');
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

  useEffect(() => {
    const stopChat = studio.chat.onEvent((event) => {
      // Which conversations are answering right now, anywhere in the app: asking a
      // question over a running turn would be an interruption.
      if (event.type === 'turn-start') setStreaming((current) => new Set(current).add(event.conversationId));
      if (event.type === 'turn-done' || event.type === 'error') {
        setStreaming((current) => {
          const next = new Set(current);
          next.delete(event.conversationId);
          return next;
        });
      }
    });
    const stopMemory = studio.memory.onEvent(() => {
      // Something new turned up, which is worth asking about even if the last question
      // was waved away.
      setSnoozed(false);
      load();
    });
    return () => {
      stopChat();
      stopMemory();
    };
  }, [load]);

  const current = pending[0];

  useEffect(() => {
    const open = shouldOpenMemoryDialog({
      pendingCount: pending.length,
      streamingCount: streaming.size,
      composerEmpty: gate.composerEmpty,
      settingsOpen: gate.settingsOpen,
      dialogOpen: isOpen,
      snoozed,
    });
    if (!open) return;
    setSelected(current?.suggestedDetail);
    setOwnAnswer('');
    setIsOpen(true);
  }, [pending.length, streaming.size, gate.composerEmpty, gate.settingsOpen, isOpen, snoozed, current]);

  const moveOn = useCallback((left: readonly MemoryCandidate[]): void => {
    setPending(left);
    setSelected(left[0]?.suggestedDetail);
    setOwnAnswer('');
    if (left.length === 0) setIsOpen(false);
  }, []);

  const answer = useCallback(
    (resolve: () => Promise<Awaited<ReturnType<typeof studio.memory.resolve>>>): void => {
      setError(undefined);
      setIsSaving(true);
      void (async (): Promise<void> => {
        const left = await resolve();
        setIsSaving(false);
        if (!left.ok) {
          setError(left.error.message);
          return;
        }
        moveOn(left.value);
      })();
    },
    [moveOn]
  );

  const accept = useCallback((): void => {
    if (current === undefined) return;
    const detail = (selected ?? ownAnswer).trim();
    if (detail.length === 0) return;
    answer(() => studio.memory.resolve({ id: current.id, action: 'accept', detail }));
  }, [current, selected, ownAnswer, answer]);

  const skip = useCallback((): void => {
    if (current === undefined) return;
    answer(() => studio.memory.resolve({ id: current.id, action: 'reject' }));
  }, [current, answer]);

  const snooze = useCallback((): void => {
    setSnoozed(true);
    setIsOpen(false);
  }, []);

  const readNote = useCallback(async (name: MemoryFileName): Promise<string> => {
    const read = await studio.memory.read(name);
    return read.ok ? read.value : '';
  }, []);

  const writeNote = useCallback(async (name: MemoryFileName, contents: string): Promise<void> => {
    const written = await studio.memory.write({ name, contents });
    if (!written.ok) setError(written.error.message);
  }, []);

  return {
    pending,
    ...(current === undefined ? {} : { current }),
    isOpen: isOpen && current !== undefined,
    isSaving,
    ...(selected === undefined ? {} : { selected }),
    ownAnswer,
    ...(error === undefined ? {} : { error }),
    select: setSelected,
    changeOwn: (text: string) => {
      setSelected(undefined);
      setOwnAnswer(text);
    },
    accept,
    skip,
    snooze,
    readNote,
    writeNote,
  };
};
