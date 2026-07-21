/*
 * How far the app has read each conversation.
 *
 * Extraction is incremental and has to be idempotent: it runs when a conversation goes
 * quiet, and again at the next launch if the app closed first. Remembering how many
 * messages were read last time is what stops the same conversation being re-read (and
 * re-billed) forever.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type MemoryConversationState = { readonly extractedMessageCount: number; readonly extractedAt: string };
export type MemoryStateDoc = { readonly conversations: Readonly<Record<string, MemoryConversationState>> };

export const EMPTY_MEMORY_STATE: MemoryStateDoc = { conversations: {} };

export type MemoryStateError = { readonly kind: 'unreadable'; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseMemoryState = (raw: unknown): Result<MemoryStateDoc, MemoryStateError> => {
  if (!isRecord(raw) || !isRecord(raw['conversations'])) return err({ kind: 'unreadable', message: 'the reading-progress file is not in the expected shape' });

  const conversations: Record<string, MemoryConversationState> = {};
  for (const [id, value] of Object.entries(raw['conversations'])) {
    if (!isRecord(value) || typeof value['extractedMessageCount'] !== 'number') continue;
    conversations[id] = {
      extractedMessageCount: value['extractedMessageCount'],
      extractedAt: typeof value['extractedAt'] === 'string' ? value['extractedAt'] : '',
    };
  }
  return ok({ conversations });
};

export const serialiseMemoryState = (doc: MemoryStateDoc): string => JSON.stringify(doc, null, 2);

export const markExtracted = (doc: MemoryStateDoc, conversationId: string, messageCount: number, at: string): MemoryStateDoc => ({
  conversations: { ...doc.conversations, [conversationId]: { extractedMessageCount: messageCount, extractedAt: at } },
});

// Only when something has been said since last time. A conversation nobody has added
// to has nothing new to learn from.
export const needsExtraction = (doc: MemoryStateDoc, conversationId: string, messageCount: number): boolean =>
  messageCount > (doc.conversations[conversationId]?.extractedMessageCount ?? 0);

export const readSoFar = (doc: MemoryStateDoc, conversationId: string): number => doc.conversations[conversationId]?.extractedMessageCount ?? 0;
