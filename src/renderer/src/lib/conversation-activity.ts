/*
 * Which conversations are working, and which have an answer the user has not seen.
 *
 * A turn keeps running when the user switches away, and until now nothing said so: the
 * sidebar looked identical whether a conversation was thinking, finished, or idle. This
 * is the reducer behind the two dots (working, and a new reply waiting).
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { UIEvent } from '../../../shared/ipc-contract.ts';

export type ConversationActivity = 'running' | 'unseen';
export type ActivityMap = Readonly<Record<string, ConversationActivity>>;

export const emptyActivity: ActivityMap = {};

export const clearActivity = (map: ActivityMap, conversationId: string): ActivityMap => {
  if (!(conversationId in map)) return map;
  const { [conversationId]: _cleared, ...rest } = map;
  return rest;
};

// activeId is the conversation on screen. A turn that ends while the user is watching
// it needs no "new reply" mark: they have already seen it.
export const applyActivityEvent = (map: ActivityMap, event: UIEvent, activeId: string | undefined): ActivityMap => {
  if (event.type === 'turn-start') return { ...map, [event.conversationId]: 'running' };
  // An error ends the turn just as much as turn-done does, and is at least as worth
  // coming back to.
  if (event.type !== 'turn-done' && event.type !== 'error') return map;
  if (event.conversationId === activeId) return clearActivity(map, event.conversationId);
  return { ...map, [event.conversationId]: 'unseen' };
};
