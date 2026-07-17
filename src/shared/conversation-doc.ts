/*
 * The conversation document: pure parse, build and serialise. No electron, no IO.
 *
 * A conversation file is written once per turn and read back on launch, so it must
 * survive a version bump, a hand edit, and a crash mid-write. Nothing here trusts
 * the file; the id in particular re-crosses its checkpoint on the way in, because a
 * filename is not proof of the contents.
 */
import { conversationId } from './conversation-id.ts';
import type { ConversationId } from './conversation-id.ts';
import type { Conversation, ConversationMeta, Message, MessagePart } from './types.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type ConversationDocError = { readonly kind: 'unreadable'; readonly message: string };

const unreadable = (message: string): Result<never, ConversationDocError> => err({ kind: 'unreadable', message });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The title shown in the sidebar: the first user message, trimmed to fit. LLM
// titling is later polish (docs/PLAN.md), so this is deliberately dumb.
const TITLE_LIMIT = 60;
export const titleFromFirstMessage = (text: string): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return 'New conversation';
  if (oneLine.length <= TITLE_LIMIT) return oneLine;
  return `${oneLine.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
};

export const newConversation = (id: ConversationId, model: string, now: string): Conversation => ({
  id,
  title: 'New conversation',
  model,
  createdAt: now,
  updatedAt: now,
  messages: [],
});

const parsePart = (raw: unknown): Result<MessagePart, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('message part must be an object');
  if (raw['type'] === 'text') {
    if (typeof raw['text'] !== 'string') return unreadable('a text part must have text');
    return ok({ type: 'text', text: raw['text'] });
  }
  if (raw['type'] === 'tool') {
    const { toolUseId, name, status, result } = raw;
    if (typeof toolUseId !== 'string') return unreadable('a tool part must have a toolUseId');
    if (typeof name !== 'string') return unreadable('a tool part must have a name');
    if (status !== 'running' && status !== 'done' && status !== 'error') return unreadable(`a tool part has an unknown status: ${String(status)}`);
    if (result !== undefined && typeof result !== 'string') return unreadable('a tool part result must be a string');
    return ok({ type: 'tool', toolUseId, name, input: raw['input'], status, ...(result === undefined ? {} : { result }) });
  }
  return unreadable(`unknown message part type: ${String(raw['type'])}`);
};

const parseMessage = (raw: unknown): Result<Message, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('message must be an object');
  const { id, role, parts, createdAt } = raw;
  if (typeof id !== 'string' || id.length === 0) return unreadable('message id must be a non-empty string');
  if (role !== 'user' && role !== 'assistant') return unreadable(`message role must be user or assistant, got ${String(role)}`);
  if (typeof createdAt !== 'string') return unreadable('message createdAt must be a string');
  if (!Array.isArray(parts)) return unreadable('message parts must be an array');

  const parsed: MessagePart[] = [];
  for (const part of parts) {
    const one = parsePart(part);
    if (!one.ok) return one;
    parsed.push(one.value);
  }
  return ok({ id, role, parts: parsed, createdAt });
};

export const parseConversation = (raw: unknown): Result<Conversation, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('conversation must be an object');
  const { id, title, model, createdAt, updatedAt, sdkSessionId, messages } = raw;
  if (typeof id !== 'string') return unreadable('conversation id must be a string');

  // Re-cross the checkpoint: the filename is not proof of what is inside, and this
  // id goes on to build the workspace path.
  const checked = conversationId(id);
  if (!checked.ok) return unreadable(checked.error.message);

  if (typeof title !== 'string' || title.length === 0) return unreadable('conversation title must be a non-empty string');
  if (typeof model !== 'string' || model.length === 0) return unreadable('conversation model must be a non-empty string');
  if (typeof createdAt !== 'string') return unreadable('conversation createdAt must be a string');
  if (typeof updatedAt !== 'string') return unreadable('conversation updatedAt must be a string');
  if (sdkSessionId !== undefined && typeof sdkSessionId !== 'string') return unreadable('conversation sdkSessionId must be a string');
  if (!Array.isArray(messages)) return unreadable('conversation messages must be an array');

  const parsed: Message[] = [];
  for (const message of messages) {
    const one = parseMessage(message);
    if (!one.ok) return one;
    parsed.push(one.value);
  }
  return ok({ id: checked.value, title, model, createdAt, updatedAt, ...(sdkSessionId === undefined ? {} : { sdkSessionId }), messages: parsed });
};

export const toMeta = (conversation: Conversation): ConversationMeta => {
  const { messages: _messages, ...meta } = conversation;
  return meta;
};

// Newest first: the sidebar shows what the user touched last.
export const byMostRecentlyUpdated = (a: ConversationMeta, b: ConversationMeta): number => b.updatedAt.localeCompare(a.updatedAt);

export const serialiseConversation = (conversation: Conversation): string => JSON.stringify(conversation, null, 2);
