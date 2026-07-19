/*
 * The sidebar's interaction state: the conversation list plus the transient rename
 * and delete affordances. Wiring only — the list transitions it calls are the pure,
 * unit-tested fold in ../lib/conversation-list.ts; this hook owns the IPC and the React
 * state, which is why it is verified by a live run rather than a unit test.
 *
 * It lives in src/renderer/src/hooks, NOT src/renderer/src/lib: lib is the 100%
 * coverage tier for pure logic bun can run, and a React hook is not that. Everything
 * under src/renderer outside lib is the skipped tier, alongside the components. See
 * .claude/LESSONS.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addConversation, emptyConversationList, loadConversations, removeConversation, retitleConversation, selectConversation } from '../lib/conversation-list.ts';
import type { ConversationListView } from '../lib/conversation-list.ts';
import { toMeta } from '../../../shared/conversation-doc.ts';

export type ConversationsController = {
  readonly view: ConversationListView;
  readonly error?: string;
  readonly editingId?: string;
  readonly draftTitle: string;
  readonly confirmingDeleteId?: string;
  readonly create: () => void;
  readonly select: (id: string) => void;
  readonly startRename: (id: string, currentTitle: string) => void;
  readonly changeDraft: (title: string) => void;
  readonly commitRename: () => void;
  readonly cancelRename: () => void;
  readonly startDelete: (id: string) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
  readonly dismissError: () => void;
};

// defaultModel is undefined until settings resolve (or while no provider exists). The
// list still loads in that window; only auto-creating a first conversation waits for a
// model, so the sidebar never mints a conversation pinned to a model that is not there.
export const useConversations = (defaultModel: string | undefined): ConversationsController => {
  const [view, setView] = useState<ConversationListView>(emptyConversationList);
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string>();
  // Same read-then-write guard app.tsx documents: StrictMode double-invokes the
  // effect, and two empty-list reads would both create a conversation.
  const booting = useRef(false);

  const boot = useCallback((): void => {
    if (booting.current) return;
    booting.current = true;
    void (async (): Promise<void> => {
      const listed = await studio.conversations.list();
      if (!listed.ok) return setError(listed.error.message);
      if (listed.value.length > 0) return setView(loadConversations(listed.value));
      if (defaultModel === undefined) return setView(emptyConversationList);
      const created = await studio.conversations.create({ model: defaultModel });
      if (!created.ok) return setError(created.error.message);
      return setView(loadConversations([toMeta(created.value)]));
    })().finally(() => {
      booting.current = false;
    });
  }, [defaultModel]);

  useEffect(boot, [boot]);

  useEffect(() => {
    // A new conversation's title flips from "New conversation" to the derived one on
    // its first turn; keep the sidebar in step without re-reading every file.
    const unsubscribe = studio.chat.onEvent((event) => {
      if (event.type === 'title') setView((v) => retitleConversation(v, event.conversationId, event.title));
    });
    return unsubscribe;
  }, []);

  const create = useCallback((): void => {
    if (defaultModel === undefined) return;
    void (async (): Promise<void> => {
      const created = await studio.conversations.create({ model: defaultModel });
      if (!created.ok) return setError(created.error.message);
      return setView((v) => addConversation(v, toMeta(created.value)));
    })();
  }, [defaultModel]);

  const select = useCallback((id: string): void => setView((v) => selectConversation(v, id)), []);

  const startRename = useCallback((id: string, currentTitle: string): void => {
    setConfirmingDeleteId(undefined);
    setEditingId(id);
    setDraftTitle(currentTitle);
  }, []);
  const changeDraft = useCallback((title: string): void => setDraftTitle(title), []);
  const cancelRename = useCallback((): void => setEditingId(undefined), []);
  const commitRename = useCallback((): void => {
    if (editingId === undefined) return;
    const title = draftTitle.trim();
    setEditingId(undefined);
    // Blank is a cancel, not a store round trip: the store rejects an empty title.
    if (title.length === 0) return;
    void (async (): Promise<void> => {
      const renamed = await studio.conversations.rename({ id: editingId, title });
      if (!renamed.ok) return setError(renamed.error.message);
      return setView((v) => retitleConversation(v, renamed.value.id, renamed.value.title));
    })();
  }, [editingId, draftTitle]);

  const startDelete = useCallback((id: string): void => {
    setEditingId(undefined);
    setConfirmingDeleteId(id);
  }, []);
  const cancelDelete = useCallback((): void => setConfirmingDeleteId(undefined), []);
  const confirmDelete = useCallback((): void => {
    if (confirmingDeleteId === undefined) return;
    const id = confirmingDeleteId;
    setConfirmingDeleteId(undefined);
    void (async (): Promise<void> => {
      const removed = await studio.conversations.remove(id);
      if (!removed.ok) return setError(removed.error.message);
      return setView((v) => removeConversation(v, id));
    })();
  }, [confirmingDeleteId]);

  const dismissError = useCallback((): void => setError(undefined), []);

  return {
    view,
    ...(error === undefined ? {} : { error }),
    ...(editingId === undefined ? {} : { editingId }),
    draftTitle,
    ...(confirmingDeleteId === undefined ? {} : { confirmingDeleteId }),
    create,
    select,
    startRename,
    changeDraft,
    commitRename,
    cancelRename,
    startDelete,
    confirmDelete,
    cancelDelete,
    dismissError,
  };
};
