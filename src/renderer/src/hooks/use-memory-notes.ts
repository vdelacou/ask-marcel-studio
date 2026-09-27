/*
 * The three notes the memory lists show, and the changes made to them an entry at a time.
 *
 * Wiring only. The lists decide what a click means; this owns the IPC and the text of each
 * note as main last reported it. Every change answers with all three notes, so a list redraws
 * from what is on disk rather than from a guess about what the change did.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryEditError, MemoryEntryEdit, MemoryNotes } from '../../../shared/memory-entry-edit.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';
import type { StoreError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';

export type MemoryNotesController = {
  readonly notes: MemoryNotes;
  // False until the first read lands, so a list never claims to be empty before it knows.
  readonly isLoaded: boolean;
  readonly reload: () => void;
  // Resolves once main has answered; on success the notes are already the new ones.
  readonly edit: (change: MemoryEntryEdit) => Promise<Result<MemoryNotes, MemoryEditError>>;
  // A whole note written back from its text, for "Edit as text". `opened` is the note as the
  // text view began with it: main refuses the save if the note has changed since.
  readonly save: (name: MemoryFileName, contents: string, opened: string) => Promise<Result<null, StoreError>>;
};

const NO_NOTES: MemoryNotes = { jargon: '', team: '', people: '' };

// A note that cannot be read shows as empty, as the editor it replaces did: the list still
// opens, and a change goes through main, which reads the file for itself.
const textOf = (read: Result<string, StoreError>): string => (read.ok ? read.value : '');

export const useMemoryNotes = (): MemoryNotesController => {
  const [notes, setNotes] = useState<MemoryNotes>(NO_NOTES);
  const [isLoaded, setIsLoaded] = useState(false);

  const reload = useCallback((): void => {
    void (async (): Promise<void> => {
      const [jargon, team, people] = await Promise.all([studio.memory.read('jargon'), studio.memory.read('team'), studio.memory.read('people')]);
      setNotes({ jargon: textOf(jargon), team: textOf(team), people: textOf(people) });
      setIsLoaded(true);
    })();
  }, []);

  useEffect(reload, [reload]);

  const edit = useCallback(async (change: MemoryEntryEdit): Promise<Result<MemoryNotes, MemoryEditError>> => {
    const answered = await studio.memory.edit(change);
    if (answered.ok) setNotes(answered.value);
    return answered;
  }, []);

  const save = useCallback(async (name: MemoryFileName, contents: string, opened: string): Promise<Result<null, StoreError>> => {
    const saved = await studio.memory.write({ name, contents, expected: opened });
    if (saved.ok) setNotes((current) => ({ ...current, [name]: contents }));
    return saved;
  }, []);

  return { notes, isLoaded, reload, edit, save };
};
