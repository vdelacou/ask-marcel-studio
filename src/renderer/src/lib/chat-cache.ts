/*
 * One transcript per conversation, kept for the life of the app rather than the life of
 * the screen.
 *
 * The bug this exists to fix: the transcript used to live in the chat page's own state,
 * and the page is keyed by conversation id, so switching conversations unmounted it and
 * threw the transcript away. Coming back re-read the file, which is only written when a
 * turn ends, so a message sent moments earlier had simply vanished. The events kept
 * arriving, but the rebuilt view had never seen their turn-start and dropped them
 * (ui-event-fold drops a patch for a message it never saw begin).
 *
 * So the fold now runs above the screen, for every conversation at once, and the page
 * reads from here. A turn the user walked away from keeps streaming into its own entry.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { appendUserMessage, applyUIEvent, emptyChat } from './ui-event-fold.ts';
import type { ChatView } from './ui-event-fold.ts';
import type { UIEvent } from '../../../shared/ipc-contract.ts';
import type { Message } from '../../../shared/types.ts';

export type ChatCache = Readonly<Record<string, ChatView>>;

export const emptyChatCache: ChatCache = {};

// What the store gave back for one conversation.
export type LoadedConversation = { readonly title: string; readonly messages: readonly Message[] };

const patch = (cache: ChatCache, conversationId: string, change: (view: ChatView) => ChatView): ChatCache => {
  const existing = cache[conversationId];
  // Nothing on screen or in flight for that id: there is no transcript to patch, and
  // inventing one would put a bubble in a conversation nobody has opened.
  if (existing === undefined) return cache;
  return { ...cache, [conversationId]: change(existing) };
};

export const applyEventToCache = (cache: ChatCache, event: UIEvent): ChatCache => {
  const existing = cache[event.conversationId];
  if (existing === undefined) {
    // A turn can start for a conversation the user has never opened this session (they
    // sent, switched, and the entry was never created). turn-start is the one event
    // that may create the entry; the rest have nothing to attach to.
    if (event.type !== 'turn-start') return cache;
    return { ...cache, [event.conversationId]: applyUIEvent(emptyChat(event.conversationId), event) };
  }
  const next = applyUIEvent(existing, event);
  // Same object back means the fold ignored the event; returning the same cache too
  // keeps React from re-rendering every conversation over a no-op.
  return next === existing ? cache : { ...cache, [event.conversationId]: next };
};

export const hydrateFromDisk = (cache: ChatCache, conversationId: string, loaded: LoadedConversation): ChatCache => {
  const existing = cache[conversationId];
  if (existing === undefined) return { ...cache, [conversationId]: { conversationId, title: loaded.title, messages: loaded.messages, isStreaming: false } };
  // Not mid-turn: the file is the truth, so it replaces what is held. This is what
  // reconciles the optimistic user echo (a throwaway id) with the persisted message.
  if (!existing.isStreaming) return { ...cache, [conversationId]: { ...existing, title: loaded.title, messages: loaded.messages } };

  // Mid-turn: the file has every finished turn but not this one. Keep the live messages
  // the file does not know about yet, on top of the history it does.
  const persisted = new Set(loaded.messages.map((m) => m.id));
  const live = existing.messages.filter((m) => !persisted.has(m.id));
  return { ...cache, [conversationId]: { ...existing, title: loaded.title, messages: [...loaded.messages, ...live] } };
};

// The user's own message, echoed on Enter rather than when the turn starts.
export const appendUserToCache = (cache: ChatCache, conversationId: string, messageId: string, text: string, createdAt: string): ChatCache => ({
  ...cache,
  [conversationId]: appendUserMessage(cache[conversationId] ?? emptyChat(conversationId), messageId, text, createdAt),
});

export const markFailed = (cache: ChatCache, conversationId: string, message: string): ChatCache =>
  patch(cache, conversationId, (view) => ({ ...view, isStreaming: false, error: message }));

// A conversation that could not be read. Unlike markFailed this creates the entry: the
// user opened this conversation, so there is a screen waiting to be told why it is
// empty.
export const markLoadFailed = (cache: ChatCache, conversationId: string, message: string): ChatCache => ({
  ...cache,
  [conversationId]: { ...(cache[conversationId] ?? emptyChat(conversationId)), isStreaming: false, error: message },
});

// Stopping is a user action, not a failure, so it clears the spinner and says nothing.
export const markStopped = (cache: ChatCache, conversationId: string): ChatCache => patch(cache, conversationId, (view) => ({ ...view, isStreaming: false }));

export const evictFromCache = (cache: ChatCache, conversationId: string): ChatCache => {
  if (!(conversationId in cache)) return cache;
  const { [conversationId]: _removed, ...rest } = cache;
  return rest;
};
