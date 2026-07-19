/*
 * The sidebar's list state: which conversations exist and which one is open.
 * Pure and unit-tested, the same way ui-event-fold is: the reselect-after-delete
 * and ordering rules are the whole correctness surface, so they live here rather
 * than tangled into the hook that wires the IPC.
 *
 * Order is settled once, at load. Rename, retitle and select never reorder, so an
 * item cannot jump under the cursor mid-edit; the order refreshes on next launch.
 * A brand-new conversation is the exception: it is the newest, so it goes on top.
 */
import { byMostRecentlyUpdated } from '../../../shared/conversation-doc.ts';
import type { ConversationMeta } from '../../../shared/types.ts';

export type ConversationListView = {
  readonly conversations: readonly ConversationMeta[];
  readonly activeId?: string;
};

export const emptyConversationList: ConversationListView = { conversations: [] };

const withActive = (conversations: readonly ConversationMeta[], activeId: string | undefined): ConversationListView =>
  activeId === undefined ? { conversations } : { conversations, activeId };

export const loadConversations = (metas: readonly ConversationMeta[]): ConversationListView => {
  const conversations = [...metas].sort(byMostRecentlyUpdated);
  return withActive(conversations, conversations[0]?.id);
};

export const selectConversation = (view: ConversationListView, id: string): ConversationListView => {
  if (!view.conversations.some((c) => c.id === id)) return view;
  return { ...view, activeId: id };
};

export const addConversation = (view: ConversationListView, meta: ConversationMeta): ConversationListView => ({
  conversations: [meta, ...view.conversations],
  activeId: meta.id,
});

export const removeConversation = (view: ConversationListView, id: string): ConversationListView => {
  const conversations = view.conversations.filter((c) => c.id !== id);
  const stillActive = view.activeId !== id ? view.activeId : conversations[0]?.id;
  return withActive(conversations, stillActive);
};

export const retitleConversation = (view: ConversationListView, id: string, title: string): ConversationListView => {
  if (!view.conversations.some((c) => c.id === id)) return view;
  return { ...view, conversations: view.conversations.map((c) => (c.id === id ? { ...c, title } : c)) };
};
