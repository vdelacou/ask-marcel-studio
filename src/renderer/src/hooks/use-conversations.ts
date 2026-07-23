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
import {
  addConversation,
  emptyConversationList,
  loadConversations,
  removeConversation,
  retitleConversation,
  selectConversation,
  setConversationModel,
} from '../lib/conversation-list.ts';
import type { ConversationListView } from '../lib/conversation-list.ts';
import { applyActivityEvent, clearActivity, emptyActivity } from '../lib/conversation-activity.ts';
import type { ActivityMap } from '../lib/conversation-activity.ts';
import { toMeta } from '../../../shared/conversation-doc.ts';

export type ConversationsController = {
  readonly view: ConversationListView;
  // Which conversations are working, and which finished while the user was elsewhere.
  readonly activity: ActivityMap;
  readonly error?: string;
  readonly editingId?: string;
  readonly draftTitle: string;
  readonly confirmingDeleteId?: string;
  // The title of the conversation waiting on a delete confirmation, so the dialog can
  // name what it is about to remove.
  readonly deletingTitle?: string;
  readonly menuOpenId?: string;
  readonly create: () => void;
  readonly select: (id: string) => void;
  // Applies from the next message; the turn in flight keeps the model it started with.
  readonly setModel: (id: string, model: string) => void;
  readonly startRename: (id: string, currentTitle: string) => void;
  readonly changeDraft: (title: string) => void;
  readonly commitRename: () => void;
  readonly cancelRename: () => void;
  readonly startDelete: (id: string) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
  readonly toggleRowMenu: (id: string) => void;
  readonly dismissError: () => void;
};

// hasModel says whether any model is configured yet; it is undefined until settings
// resolve, or while no provider exists. The list still loads in that window; only creating
// a conversation waits, so the sidebar never mints one before there is anything to answer
// it. WHICH model it opens on is not decided here: main resolves that from the last model
// used, because this value dates from boot and would miss a switch made since.
// onDeleted lets the app drop the deleted conversation's held transcript; the hook
// itself knows nothing about transcripts.
export const useConversations = (hasModel: string | undefined, onDeleted?: (id: string) => void): ConversationsController => {
  const [view, setView] = useState<ConversationListView>(emptyConversationList);
  const [activity, setActivity] = useState<ActivityMap>(emptyActivity);
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string>();
  const [menuOpenId, setMenuOpenId] = useState<string>();
  // Same read-then-write guard app.tsx documents: StrictMode double-invokes the
  // effect, and two empty-list reads would both create a conversation.
  const booting = useRef(false);
  // Read inside the event listener, which is attached once: state would be stale there.
  const activeIdRef = useRef<string | undefined>(undefined);
  activeIdRef.current = view.activeId;
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

  const boot = useCallback((): void => {
    if (booting.current) return;
    booting.current = true;
    void (async (): Promise<void> => {
      const listed = await studio.conversations.list();
      if (!listed.ok) return setError(listed.error.message);
      if (listed.value.length > 0) return setView(loadConversations(listed.value));
      if (hasModel === undefined) return setView(emptyConversationList);
      const created = await studio.conversations.create({});
      if (!created.ok) return setError(created.error.message);
      return setView(loadConversations([toMeta(created.value)]));
    })().finally(() => {
      booting.current = false;
    });
  }, [hasModel]);

  useEffect(boot, [boot]);

  useEffect(() => {
    // A new conversation's title flips from "New conversation" to the derived one on
    // its first turn; keep the sidebar in step without re-reading every file.
    const unsubscribe = studio.chat.onEvent((event) => {
      if (event.type === 'title') setView((v) => retitleConversation(v, event.conversationId, event.title));
      setActivity((a) => applyActivityEvent(a, event, activeIdRef.current));
    });
    return unsubscribe;
  }, []);

  const create = useCallback((): void => {
    if (hasModel === undefined) return;
    void (async (): Promise<void> => {
      const created = await studio.conversations.create({});
      if (!created.ok) return setError(created.error.message);
      return setView((v) => addConversation(v, toMeta(created.value)));
    })();
  }, [hasModel]);

  // Opening a conversation is reading it, so its "new reply" mark goes away.
  const select = useCallback((id: string): void => {
    setView((v) => selectConversation(v, id));
    setActivity((a) => clearActivity(a, id));
  }, []);

  const setModel = useCallback((id: string, model: string): void => {
    void (async (): Promise<void> => {
      const changed = await studio.conversations.setModel({ id, model });
      if (!changed.ok) return setError(changed.error.message);
      return setView((v) => setConversationModel(v, changed.value.id, changed.value.model));
    })();
  }, []);

  const toggleRowMenu = useCallback((id: string): void => setMenuOpenId((open) => (open === id ? undefined : id)), []);

  const startRename = useCallback((id: string, currentTitle: string): void => {
    setMenuOpenId(undefined);
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
    setMenuOpenId(undefined);
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
      setActivity((a) => clearActivity(a, id));
      onDeletedRef.current?.(id);
      return setView((v) => removeConversation(v, id));
    })();
  }, [confirmingDeleteId]);

  const dismissError = useCallback((): void => setError(undefined), []);

  const deletingTitle = view.conversations.find((c) => c.id === confirmingDeleteId)?.title;

  return {
    view,
    activity,
    ...(error === undefined ? {} : { error }),
    ...(editingId === undefined ? {} : { editingId }),
    draftTitle,
    ...(confirmingDeleteId === undefined ? {} : { confirmingDeleteId }),
    ...(deletingTitle === undefined ? {} : { deletingTitle }),
    ...(menuOpenId === undefined ? {} : { menuOpenId }),
    create,
    select,
    setModel,
    startRename,
    changeDraft,
    commitRename,
    cancelRename,
    startDelete,
    confirmDelete,
    cancelDelete,
    toggleRowMenu,
    dismissError,
  };
};
