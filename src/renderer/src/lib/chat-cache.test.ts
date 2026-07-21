import { describe, expect, test } from 'bun:test';
import { appendUserToCache, applyEventToCache, emptyChatCache, evictFromCache, hydrateFromDisk, markFailed, markLoadFailed, markStopped } from './chat-cache.ts';
import type { ChatCache } from './chat-cache.ts';
import type { UIEvent } from '../../../shared/ipc-contract.ts';
import type { Message } from '../../../shared/types.ts';

const A = 'conversation-a';
const B = 'conversation-b';

const turnStart = (conversationId: string, messageId: string): UIEvent => ({ type: 'turn-start', conversationId, messageId });
const delta = (conversationId: string, messageId: string, text: string): UIEvent => ({ type: 'text-delta', conversationId, messageId, delta: text });
const turnDone = (conversationId: string): UIEvent => ({ type: 'turn-done', conversationId, usage: { inputTokens: 1, outputTokens: 1 } });

const message = (id: string, role: 'user' | 'assistant', text: string): Message => ({ id, role, parts: [{ type: 'text', text }], createdAt: '2026-07-21T10:00:00.000Z' });

const textOf = (cache: ChatCache, conversationId: string): readonly string[] =>
  (cache[conversationId]?.messages ?? []).map((m) => m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''));

describe('folding the event stream for every conversation at once', () => {
  test('a turn that starts for a conversation nobody has opened creates its entry', () => {
    const cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));

    expect(cache[A]?.isStreaming).toBe(true);
  });

  test('an event for a conversation with no entry and no turn-start is dropped', () => {
    // Without this, a stray result could invent a transcript for a conversation the
    // user has never opened.
    expect(applyEventToCache(emptyChatCache, delta(A, 'm1', 'hi'))).toEqual(emptyChatCache);
  });

  test('two conversations stream side by side without touching each other', () => {
    let cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));
    cache = applyEventToCache(cache, turnStart(B, 'm2'));
    cache = applyEventToCache(cache, delta(A, 'm1', 'for A'));
    cache = applyEventToCache(cache, delta(B, 'm2', 'for B'));

    expect(textOf(cache, A)).toEqual(['for A']);
    expect(textOf(cache, B)).toEqual(['for B']);
  });

  test('a turn the user switched away from keeps streaming into its own entry', () => {
    // The whole point of holding transcripts above the screen.
    let cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));
    cache = applyEventToCache(cache, delta(A, 'm1', 'first '));
    cache = applyEventToCache(cache, delta(A, 'm1', 'second'));
    cache = applyEventToCache(cache, turnDone(A));

    expect(textOf(cache, A)).toEqual(['first second']);
    expect(cache[A]?.isStreaming).toBe(false);
  });

  test('an event the fold ignores leaves the cache identical, so nothing re-renders', () => {
    const cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));

    expect(applyEventToCache(cache, { type: 'turn-saved', conversationId: A })).toBe(cache);
  });
});

describe('reconciling a transcript with what is on disk', () => {
  const loaded = { title: 'Inbox triage', messages: [message('u1', 'user', 'What is in my inbox?'), message('a1', 'assistant', 'Three unread.')] };

  test('a conversation opened for the first time is filled from the file', () => {
    const cache = hydrateFromDisk(emptyChatCache, A, loaded);

    expect(cache[A]?.title).toBe('Inbox triage');
    expect(textOf(cache, A)).toEqual(['What is in my inbox?', 'Three unread.']);
    expect(cache[A]?.conversationId).toBe(A);
  });

  test('an idle transcript is replaced by the file, which is what reconciles the optimistic echo', () => {
    // The echo carries a throwaway id; the persisted message carries the real one.
    let cache = appendUserToCache(emptyChatCache, A, 'throwaway', 'What is in my inbox?', 'now');
    cache = hydrateFromDisk(cache, A, loaded);

    expect(cache[A]?.messages.map((m) => m.id)).toEqual(['u1', 'a1']);
  });

  test('a transcript still streaming keeps the in-flight turn on top of the saved history', () => {
    let cache = appendUserToCache(emptyChatCache, A, 'live-user', 'And my calendar?', 'now');
    cache = applyEventToCache(cache, turnStart(A, 'live-assistant'));
    cache = applyEventToCache(cache, delta(A, 'live-assistant', 'Two meetings.'));

    cache = hydrateFromDisk(cache, A, loaded);

    expect(cache[A]?.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'live-user', 'live-assistant']);
    expect(cache[A]?.isStreaming).toBe(true);
  });

  test('a message the file already knows about is not duplicated by a mid-turn reload', () => {
    let cache = hydrateFromDisk(emptyChatCache, A, loaded);
    cache = applyEventToCache(cache, turnStart(A, 'live'));

    cache = hydrateFromDisk(cache, A, loaded);

    expect(cache[A]?.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'live']);
  });

  test('hydrating one conversation leaves the others alone', () => {
    let cache = applyEventToCache(emptyChatCache, turnStart(B, 'm2'));
    cache = hydrateFromDisk(cache, A, loaded);

    expect(cache[B]?.isStreaming).toBe(true);
  });
});

describe('what the screen reports back into the cache', () => {
  test('the user message appears before the turn has started', () => {
    const cache = appendUserToCache(emptyChatCache, A, 'u9', 'hello', 'now');

    expect(textOf(cache, A)).toEqual(['hello']);
  });

  test('a send that main refused stops the spinner and says why', () => {
    let cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));
    cache = markFailed(cache, A, 'this conversation is already answering');

    expect(cache[A]?.isStreaming).toBe(false);
    expect(cache[A]?.error).toBe('this conversation is already answering');
  });

  test('stopping clears the spinner without claiming anything went wrong', () => {
    let cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));
    cache = markStopped(cache, A);

    expect(cache[A]?.isStreaming).toBe(false);
    expect(cache[A]?.error).toBeUndefined();
  });

  test('reporting on a conversation with no entry changes nothing', () => {
    expect(markFailed(emptyChatCache, A, 'boom')).toEqual(emptyChatCache);
    expect(markStopped(emptyChatCache, A)).toEqual(emptyChatCache);
  });

  test('a conversation that could not be read shows why, even though it has no entry yet', () => {
    // The user opened it, so there is a screen waiting to be told something.
    const cache = markLoadFailed(emptyChatCache, A, 'conversation file is corrupt');

    expect(cache[A]?.error).toBe('conversation file is corrupt');
  });

  test('a read failure on an open conversation keeps what is already on screen', () => {
    let cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));
    cache = applyEventToCache(cache, delta(A, 'm1', 'half an answer'));
    cache = markLoadFailed(cache, A, 'disk unreadable');

    expect(textOf(cache, A)).toEqual(['half an answer']);
    expect(cache[A]?.isStreaming).toBe(false);
  });

  test('a deleted conversation drops its transcript', () => {
    const cache = applyEventToCache(emptyChatCache, turnStart(A, 'm1'));

    expect(A in evictFromCache(cache, A)).toBe(false);
  });

  test('evicting something that was never held changes nothing', () => {
    expect(evictFromCache(emptyChatCache, A)).toBe(emptyChatCache);
  });
});

describe('the sequence the bug report described', () => {
  test('send, switch away mid-turn, switch back: the exchange is still there', () => {
    const saved = { title: 'Inbox triage', messages: [message('u1', 'user', 'What is in my inbox?')] };

    // Opened, sent, and the turn begins.
    let cache = hydrateFromDisk(emptyChatCache, A, { title: 'New conversation', messages: [] });
    cache = appendUserToCache(cache, A, 'echo', 'What is in my inbox?', 'now');
    cache = applyEventToCache(cache, turnStart(A, 'm1'));
    cache = applyEventToCache(cache, delta(A, 'm1', 'Three unread.'));

    // The user switches to another conversation and back. Nothing is re-fetched,
    // because the transcript was never thrown away.
    cache = applyEventToCache(cache, turnStart(B, 'm2'));
    expect(textOf(cache, A)).toEqual(['What is in my inbox?', 'Three unread.']);

    // The turn ends and the file catches up.
    cache = applyEventToCache(cache, turnDone(A));
    cache = hydrateFromDisk(cache, A, saved);

    expect(textOf(cache, A)).toEqual(['What is in my inbox?']);
    expect(cache[A]?.title).toBe('Inbox triage');
  });
});
