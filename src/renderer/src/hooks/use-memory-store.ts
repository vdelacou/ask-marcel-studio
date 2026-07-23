/*
 * The Memory page: the list of what the agent remembers, and editing it.
 *
 * Wiring only. The store lives in main behind the port; this drives the CRUD channels and
 * holds the small UI state (which row is being edited, whether a clear-all is being
 * confirmed).
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryItem, MemoryStoreError } from '../../../shared/memory-store.ts';

export type MemoryStoreView = {
  readonly items: readonly MemoryItem[];
  readonly notice?: string;
  readonly isLoading: boolean;
  readonly editingId?: string;
  readonly draft: string;
  readonly newText: string;
  readonly isConfirmingClear: boolean;
  readonly reload: () => void;
  readonly startEdit: (id: string, text: string) => void;
  readonly changeDraft: (text: string) => void;
  readonly saveEdit: () => void;
  readonly cancelEdit: () => void;
  readonly remove: (id: string) => void;
  readonly changeNew: (text: string) => void;
  readonly addNew: () => void;
  readonly askClear: () => void;
  readonly cancelClear: () => void;
  readonly confirmClear: () => void;
};

const messageFor = (error: MemoryStoreError): string =>
  error.kind === 'not-configured' ? 'Memory is not set up yet. Choose an embedding provider in Settings to start remembering things.' : error.message;

export const useMemoryStore = (): MemoryStoreView => {
  const [items, setItems] = useState<readonly MemoryItem[]>([]);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [newText, setNewText] = useState('');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const reload = useCallback((): void => {
    void (async (): Promise<void> => {
      const listed = await studio.memory.list();
      setIsLoading(false);
      if (!listed.ok) {
        setItems([]);
        setNotice(messageFor(listed.error));
        return;
      }
      setNotice(undefined);
      setItems(listed.value);
    })();
  }, []);

  useEffect(reload, [reload]);

  const startEdit = useCallback((id: string, text: string): void => {
    setEditingId(id);
    setDraft(text);
  }, []);
  const changeDraft = useCallback((text: string): void => setDraft(text), []);
  const cancelEdit = useCallback((): void => setEditingId(undefined), []);

  const saveEdit = useCallback((): void => {
    if (editingId === undefined) return;
    const id = editingId;
    void (async (): Promise<void> => {
      const saved = await studio.memory.update({ id, text: draft });
      if (!saved.ok) return setNotice(messageFor(saved.error));
      setEditingId(undefined);
      return reload();
    })();
  }, [editingId, draft, reload]);

  const remove = useCallback(
    (id: string): void => {
      void (async (): Promise<void> => {
        const removed = await studio.memory.remove(id);
        if (!removed.ok) return setNotice(messageFor(removed.error));
        return reload();
      })();
    },
    [reload]
  );

  const changeNew = useCallback((text: string): void => setNewText(text), []);
  const addNew = useCallback((): void => {
    if (newText.trim().length === 0) return;
    void (async (): Promise<void> => {
      const added = await studio.memory.add(newText.trim());
      if (!added.ok) return setNotice(messageFor(added.error));
      setNewText('');
      return reload();
    })();
  }, [newText, reload]);

  const confirmClear = useCallback((): void => {
    void (async (): Promise<void> => {
      const cleared = await studio.memory.clearAll();
      setIsConfirmingClear(false);
      if (!cleared.ok) return setNotice(messageFor(cleared.error));
      return reload();
    })();
  }, [reload]);

  return {
    items,
    ...(notice === undefined ? {} : { notice }),
    isLoading,
    ...(editingId === undefined ? {} : { editingId }),
    draft,
    newText,
    isConfirmingClear,
    reload,
    startEdit,
    changeDraft,
    saveEdit,
    cancelEdit,
    remove,
    changeNew,
    addNew,
    askClear: () => setIsConfirmingClear(true),
    cancelClear: () => setIsConfirmingClear(false),
    confirmClear,
  };
};
