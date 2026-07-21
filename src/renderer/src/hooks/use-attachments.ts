/*
 * Files waiting to be sent with the next message.
 *
 * Wiring only: the naming and collision rules live in src/shared/import-plan.ts, and
 * the copy happens in main. This hook owns the IPC, the list on screen, and the one
 * decision the renderer has to make: a dropped file either has a real path (copy it
 * from there) or exists only as bytes, which is what an attachment dragged straight
 * out of a mail client looks like.
 */
import { useCallback, useState } from 'react';
import { MAX_IMPORT_BYTES } from '../../../shared/import-plan.ts';
import type { ImportedFile } from '../../../shared/ipc-contract.ts';

export type AttachmentsController = {
  readonly items: readonly ImportedFile[];
  readonly error?: string;
  readonly isImporting: boolean;
  readonly pick: () => void;
  readonly acceptDrop: (files: readonly File[]) => void;
  readonly remove: (relativePath: string) => void;
  readonly clear: () => void;
  readonly dismissError: () => void;
};

export const useAttachments = (conversationId: string): AttachmentsController => {
  const [items, setItems] = useState<readonly ImportedFile[]>([]);
  const [error, setError] = useState<string>();
  const [isImporting, setIsImporting] = useState(false);

  const pick = useCallback((): void => {
    setError(undefined);
    setIsImporting(true);
    void (async (): Promise<void> => {
      const picked = await studio.conversations.importPick(conversationId);
      setIsImporting(false);
      // Closing the picker is not a failure, so it says nothing.
      if (!picked.ok && picked.error.kind === 'cancelled') return;
      if (!picked.ok) {
        setError(picked.error.message);
        return;
      }
      setItems((current) => [...current, ...picked.value]);
    })();
  }, [conversationId]);

  const acceptDrop = useCallback(
    (files: readonly File[]): void => {
      if (files.length === 0) return;
      setError(undefined);
      setIsImporting(true);
      void (async (): Promise<void> => {
        const withPath: string[] = [];
        const withoutPath: File[] = [];
        for (const file of files) {
          const path = studio.files.pathForFile(file);
          if (path.length > 0) withPath.push(path);
          else withoutPath.push(file);
        }

        const added: ImportedFile[] = [];
        if (withPath.length > 0) {
          const imported = await studio.conversations.importPaths({ id: conversationId, paths: withPath });
          if (!imported.ok) setError(imported.error.message);
          else added.push(...imported.value);
        }
        for (const file of withoutPath) {
          // Checked before reading the whole thing into memory to hand across IPC.
          if (file.size > MAX_IMPORT_BYTES) {
            setError(`${file.name} is too big to attach (the limit is 25 MB)`);
            continue;
          }
          const imported = await studio.conversations.importData({ id: conversationId, name: file.name, bytes: await file.arrayBuffer() });
          if (!imported.ok) setError(imported.error.message);
          else added.push(imported.value);
        }

        setIsImporting(false);
        if (added.length > 0) setItems((current) => [...current, ...added]);
      })();
    },
    [conversationId]
  );

  // Only the chip goes. The copy stays in the workspace, which is the conversation's
  // own scratch folder and is deleted with it.
  const remove = useCallback((relativePath: string): void => setItems((current) => current.filter((item) => item.relativePath !== relativePath)), []);
  const clear = useCallback((): void => setItems([]), []);
  const dismissError = useCallback((): void => setError(undefined), []);

  return { items, ...(error === undefined ? {} : { error }), isImporting, pick, acceptDrop, remove, clear, dismissError };
};
