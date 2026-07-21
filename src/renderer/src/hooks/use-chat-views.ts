/*
 * Holds every conversation's transcript above the screen and feeds it the one event
 * stream.
 *
 * Wiring only: the fold and the disk-versus-live reconciliation are the pure, tested
 * chat-cache module. This hook owns the subscription, the IPC and the React state,
 * which is why it lives in hooks/ (the skipped tier) rather than lib/.
 *
 * One subscription for the life of the app, not one per screen: a turn the user
 * switched away from must keep arriving somewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { appendUserToCache, applyEventToCache, emptyChatCache, evictFromCache, hydrateFromDisk, markFailed, markLoadFailed, markStopped } from '../lib/chat-cache.ts';
import type { ChatCache } from '../lib/chat-cache.ts';
import { emptyChat } from '../lib/ui-event-fold.ts';
import type { ChatView } from '../lib/ui-event-fold.ts';

export type ChatViewsController = {
  readonly viewFor: (conversationId: string) => ChatView;
  // Called when a conversation is opened. Reads the file only the first time; after
  // that the held transcript is at least as current as the disk.
  readonly hydrate: (conversationId: string) => void;
  readonly send: (conversationId: string, text: string) => void;
  readonly cancel: (conversationId: string) => void;
  readonly evict: (conversationId: string) => void;
};

export const useChatViews = (): ChatViewsController => {
  const [cache, setCache] = useState<ChatCache>(emptyChatCache);
  // Which conversations have been read from disk at least once. A ref, not state:
  // it must not be stale inside the event listener, and it renders nothing.
  const loaded = useRef(new Set<string>());

  const load = useCallback((conversationId: string): void => {
    void (async (): Promise<void> => {
      const read = await studio.conversations.get(conversationId);
      if (!read.ok) {
        setCache((c) => markLoadFailed(c, conversationId, read.error.message));
        return;
      }
      setCache((c) => hydrateFromDisk(c, conversationId, { title: read.value.title, messages: read.value.messages }));
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = studio.chat.onEvent((event) => {
      setCache((c) => applyEventToCache(c, event));
      // The file only becomes current when the turn's write lands, so this is the one
      // moment re-reading is worth it: it swaps the optimistic echo for the persisted
      // message and picks up anything the fold could not know.
      if (event.type === 'turn-saved') {
        loaded.current.add(event.conversationId);
        load(event.conversationId);
      }
    });
    return unsubscribe;
  }, [load]);

  const hydrate = useCallback(
    (conversationId: string): void => {
      // StrictMode double-invokes the mount effect; the guard makes the second call a
      // no-op instead of a second read.
      if (loaded.current.has(conversationId)) return;
      loaded.current.add(conversationId);
      load(conversationId);
    },
    [load]
  );

  const send = useCallback((conversationId: string, text: string): void => {
    // Echoed immediately so the message appears on Enter, not when the turn starts.
    setCache((c) => appendUserToCache(c, conversationId, crypto.randomUUID(), text, new Date().toISOString()));
    void (async (): Promise<void> => {
      const sent = await studio.chat.send({ conversationId, text });
      if (!sent.ok) setCache((c) => markFailed(c, conversationId, sent.error.message));
    })();
  }, []);

  const cancel = useCallback((conversationId: string): void => {
    void studio.chat.cancel(conversationId);
    setCache((c) => markStopped(c, conversationId));
  }, []);

  const evict = useCallback((conversationId: string): void => {
    loaded.current.delete(conversationId);
    setCache((c) => evictFromCache(c, conversationId));
  }, []);

  const viewFor = useCallback((conversationId: string): ChatView => cache[conversationId] ?? emptyChat(conversationId), [cache]);

  return { viewFor, hydrate, send, cancel, evict };
};
