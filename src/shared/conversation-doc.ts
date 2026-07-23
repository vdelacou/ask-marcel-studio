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
import type { Conversation, ConversationMeta, Message, MessagePart, TurnStats } from './types.ts';
import { humanizeSkillFolder } from './skill-md.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type ConversationDocError = { readonly kind: 'unreadable'; readonly message: string };

const unreadable = (message: string): Result<never, ConversationDocError> => err({ kind: 'unreadable', message });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// What a conversation is called before its first turn names it. Exported because
// appendTurn tests against it: a title that is still this one may be replaced by the
// derived one, and a title the user typed may not.
export const DEFAULT_TITLE = 'New conversation';

// What the sidebar shows until the title job answers: the first message, trimmed to fit,
// with any leading skill invocation taken off. `/draft-outlook-email FG E-Commerce` is a
// command plus a subject, and only the subject says what the conversation is about.
const TITLE_LIMIT = 60;
// The lookahead is what stops a pasted path (`/Users/vincent/report.xlsx`) being read as
// a command: an invocation is a single word, ended by a space or by the message.
const SLASH_PREFIX = /^\/([A-Za-z0-9-]+)(?=\s|$)\s*/;

export const titleFromFirstMessage = (text: string): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const invocation = SLASH_PREFIX.exec(oneLine);
  // A message that was ONLY an invocation still has to be called something, so the skill
  // it asked for is read as words rather than left as a command.
  const withoutCommand = invocation === null ? oneLine : oneLine.slice(invocation[0].length) || humanizeSkillFolder(invocation[1] ?? '');
  if (withoutCommand.length === 0) return DEFAULT_TITLE;
  if (withoutCommand.length <= TITLE_LIMIT) return withoutCommand;
  return `${withoutCommand.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
};

// A title the user typed themselves is theirs: nothing derived and nothing generated may
// replace it. Anything else is the app's guess, and a better guess may still arrive.
export const applyGeneratedTitle = (conversation: Conversation, title: string): { readonly conversation: Conversation; readonly changed: boolean } => {
  const wanted = title.trim();
  if (wanted.length === 0 || conversation.userRenamed === true || wanted === conversation.title) return { conversation, changed: false };
  return { conversation: { ...conversation, title: wanted }, changed: true };
};

export const newConversation = (id: ConversationId, model: string, now: string): Conversation => ({
  id,
  title: DEFAULT_TITLE,
  model,
  createdAt: now,
  updatedAt: now,
  messages: [],
});

// One finished turn, ready to be folded onto whatever is on disk NOW.
export type TurnOutcome = {
  // What the user typed. Persisted verbatim, even when the prompt the agent saw was
  // rewritten (a /skill invocation), because the transcript is the user's record.
  readonly text: string;
  readonly parts: readonly MessagePart[];
  readonly sdkSessionId?: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly at: string;
  // How long the turn took. Absent when the runtime did not time it (an older caller, or
  // a turn that never started).
  readonly durationMs?: number;
};

// Appending is a fold onto a freshly read base rather than a write of the snapshot the
// turn started from: a rename that lands mid-turn is a real edit and must survive the
// save that follows it.
export const appendTurn = (base: Conversation, turn: TurnOutcome): { readonly conversation: Conversation; readonly titleChanged: boolean } => {
  // The derived title only replaces the placeholder. If the user renamed the
  // conversation while the first turn was running, their name wins.
  const title = base.messages.length === 0 && base.title === DEFAULT_TITLE ? titleFromFirstMessage(turn.text) : base.title;
  const userMessage: Message = { id: turn.userMessageId, role: 'user', parts: [{ type: 'text', text: turn.text }], createdAt: turn.at };
  // Counted from the parts rather than tracked alongside them, so a delegated reader's
  // own steps count too: they are what the turn actually did.
  const toolParts = turn.parts.filter((part) => part.type === 'tool');
  const stats =
    turn.durationMs === undefined
      ? undefined
      : { durationMs: turn.durationMs, toolCalls: toolParts.length, toolErrors: toolParts.filter((part) => part.type === 'tool' && part.status === 'error').length };
  const assistantMessage: Message = { id: turn.assistantMessageId, role: 'assistant', parts: turn.parts, createdAt: turn.at, ...(stats === undefined ? {} : { stats }) };

  return {
    conversation: {
      ...base,
      title,
      updatedAt: turn.at,
      // A turn that produced no session id (it failed before the SDK reported one)
      // must not erase the one already stored, or the next turn cannot resume.
      ...(turn.sdkSessionId === undefined ? {} : { sdkSessionId: turn.sdkSessionId }),
      // An assistant message with no parts is a turn that produced nothing: an empty
      // bubble in the transcript would be worse than no bubble.
      messages: [...base.messages, userMessage, ...(turn.parts.length === 0 ? [] : [assistantMessage])],
    },
    titleChanged: title !== base.title,
  };
};

const parsePart = (raw: unknown): Result<MessagePart, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('message part must be an object');
  if (raw['type'] === 'text') {
    if (typeof raw['text'] !== 'string') return unreadable('a text part must have text');
    return ok({ type: 'text', text: raw['text'] });
  }
  if (raw['type'] === 'tool') {
    const { toolUseId, name, status, result, parentToolUseId } = raw;
    if (typeof toolUseId !== 'string') return unreadable('a tool part must have a toolUseId');
    if (typeof name !== 'string') return unreadable('a tool part must have a name');
    if (status !== 'running' && status !== 'done' && status !== 'error') return unreadable(`a tool part has an unknown status: ${String(status)}`);
    if (result !== undefined && typeof result !== 'string') return unreadable('a tool part result must be a string');
    if (parentToolUseId !== undefined && typeof parentToolUseId !== 'string') return unreadable('a tool part parentToolUseId must be a string');
    return ok({
      type: 'tool',
      toolUseId,
      name,
      input: raw['input'],
      status,
      ...(result === undefined ? {} : { result }),
      ...(parentToolUseId === undefined ? {} : { parentToolUseId }),
    });
  }
  return unreadable(`unknown message part type: ${String(raw['type'])}`);
};

// Absent on every message written before turns were timed, and on anything a hand edit
// mangled: a missing or malformed line under an answer is not worth failing a read for.
const parseStats = (raw: unknown): TurnStats | undefined => {
  if (!isRecord(raw)) return undefined;
  const { durationMs, toolCalls, toolErrors } = raw;
  if (typeof durationMs !== 'number' || typeof toolCalls !== 'number' || typeof toolErrors !== 'number') return undefined;
  return { durationMs, toolCalls, toolErrors };
};

const parseMessage = (raw: unknown): Result<Message, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('message must be an object');
  const { id, role, parts, createdAt, stats } = raw;
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
  return ok({ id, role, parts: parsed, createdAt, ...(parseStats(stats) === undefined ? {} : { stats: parseStats(stats) }) });
};

export const parseConversation = (raw: unknown): Result<Conversation, ConversationDocError> => {
  if (!isRecord(raw)) return unreadable('conversation must be an object');
  const { id, title, model, createdAt, updatedAt, sdkSessionId, userRenamed, messages } = raw;
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
  // Absent in every conversation written before the flag existed, which reads correctly
  // as "the app named this one".
  return ok({
    id: checked.value,
    title,
    model,
    createdAt,
    updatedAt,
    ...(sdkSessionId === undefined ? {} : { sdkSessionId }),
    ...(userRenamed === true ? { userRenamed: true } : {}),
    messages: parsed,
  });
};

export const toMeta = (conversation: Conversation): ConversationMeta => {
  const { messages: _messages, ...meta } = conversation;
  return meta;
};

// Newest first: the sidebar shows what the user touched last.
export const byMostRecentlyUpdated = (a: ConversationMeta, b: ConversationMeta): number => b.updatedAt.localeCompare(a.updatedAt);

export const serialiseConversation = (conversation: Conversation): string => JSON.stringify(conversation, null, 2);
