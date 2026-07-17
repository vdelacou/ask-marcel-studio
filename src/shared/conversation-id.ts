/*
 * A conversation id, proven safe to interpolate into a filesystem path.
 *
 * This is a trust-boundary checkpoint (hard rule 12), not ceremony. The value
 * arrives from the renderer over IPC and reaches two sinks in the main process:
 *
 *   <userData>/conversations/<id>.json     the conversation file
 *   <userData>/workspaces/<id>/            the agent's cwd, under bypassPermissions
 *
 * An id like '../../../evil' would escape userData in both. The factory is the
 * gate: once a value has type ConversationId, a join() downstream can trust it.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

// Exactly the shape crypto.randomUUID() emits: 8-4-4-4-12 lowercase hex.
// Anchored at both ends, so no prefix or suffix can ride along.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ConversationId = string & { readonly __brand: 'ConversationId' };

export type ConversationIdError = {
  readonly kind: 'malformed-id';
  readonly id: string;
  readonly message: string;
};

export const newConversationId = (): ConversationId => crypto.randomUUID() as ConversationId;

export const conversationId = (value: string): Result<ConversationId, ConversationIdError> => {
  if (!UUID_SHAPE.test(value)) return err({ kind: 'malformed-id', id: value, message: 'conversation id must be a uuid' });
  return ok(value as ConversationId);
};
