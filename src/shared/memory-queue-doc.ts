/*
 * Things the app noticed and wants the user to confirm before it remembers them.
 *
 * A queue rather than a write: guessing that "QW" means "quick win" and acting on it
 * forever is worse than asking once. Each candidate carries where it came from, so the
 * question can show the sentence that prompted it.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import { normaliseTerm } from './memory-doc.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import { memoryFileName } from './memory-file-name.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type MemoryCandidate = {
  readonly id: string;
  // Which of the three notes it belongs in.
  readonly kind: MemoryFileName;
  readonly term: string;
  readonly suggestedDetail: string;
  // Other phrasings the user can pick instead of typing their own.
  readonly alternatives: readonly string[];
  readonly conversationId: string;
  // The sentence it came from, so the question is answerable without opening the
  // conversation.
  readonly quote: string;
  // What a directory lookup added, if anything.
  readonly enrichment?: string;
  readonly createdAt: string;
};

export type MemoryQueueDoc = { readonly items: readonly MemoryCandidate[] };

export const EMPTY_MEMORY_QUEUE: MemoryQueueDoc = { items: [] };

export type MemoryQueueError = { readonly kind: 'unreadable'; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const parseCandidate = (raw: unknown): MemoryCandidate | undefined => {
  if (!isRecord(raw)) return undefined;
  const kind = memoryFileName(raw['kind']);
  const id = text(raw['id']);
  const term = text(raw['term']);
  if (!kind.ok || id.length === 0 || term.length === 0) return undefined;

  const enrichment = typeof raw['enrichment'] === 'string' ? raw['enrichment'] : undefined;
  return {
    id,
    kind: kind.value,
    term,
    suggestedDetail: text(raw['suggestedDetail']),
    alternatives: Array.isArray(raw['alternatives']) ? raw['alternatives'].filter((entry): entry is string => typeof entry === 'string') : [],
    conversationId: text(raw['conversationId']),
    quote: text(raw['quote']),
    ...(enrichment === undefined ? {} : { enrichment }),
    createdAt: text(raw['createdAt']),
  };
};

export const parseMemoryQueue = (raw: unknown): Result<MemoryQueueDoc, MemoryQueueError> => {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) return err({ kind: 'unreadable', message: 'the pending notes file is not in the expected shape' });
  // A candidate this cannot read is dropped rather than failing the file: it is a
  // question the app wanted to ask, not something the user would miss.
  return ok({ items: raw['items'].flatMap((entry) => parseCandidate(entry) ?? []) });
};

export const serialiseMemoryQueue = (doc: MemoryQueueDoc): string => JSON.stringify(doc, null, 2);

// Adding a candidate the user has already answered, or already been asked, would be
// asking the same question twice.
export const addCandidates = (doc: MemoryQueueDoc, additions: readonly MemoryCandidate[], knownTerms: ReadonlySet<string>): MemoryQueueDoc => {
  const seen = new Set([...doc.items.map((item) => normaliseTerm(item.term)), ...[...knownTerms].map(normaliseTerm)]);
  const fresh: MemoryCandidate[] = [];
  for (const addition of additions) {
    const key = normaliseTerm(addition.term);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    fresh.push(addition);
  }
  return { items: [...doc.items, ...fresh] };
};

export const removeCandidate = (doc: MemoryQueueDoc, id: string): MemoryQueueDoc => ({ items: doc.items.filter((item) => item.id !== id) });

export const findCandidate = (doc: MemoryQueueDoc, id: string): MemoryCandidate | undefined => doc.items.find((item) => item.id === id);
