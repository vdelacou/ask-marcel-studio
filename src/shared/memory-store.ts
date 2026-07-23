/*
 * The port for the searchable memory.
 *
 * What the agent remembers about the user's world lives behind this: durable facts, each
 * a short sentence, searched by meaning when a term or a person might be known rather than
 * pasted into every prompt. The adapter is a native better-sqlite3 store the bun runner
 * cannot load, so the contract is defined here, pure, with a hand-written fake for tests.
 *
 * Everything returns a Result at the IO boundary (rule 16). The AI dependency (the
 * embedder) is the adapter's concern, behind this same port (rule 32): a caller never
 * sees an embedding, only text in and memories out.
 */
import type { Result } from './result.ts';
import { err } from './result.ts';

// Where a memory came from, so the UI can show it and a cleanup can leave the user's own
// entries alone.
//   user       the user typed it themselves on the Memory page
//   chat       they asked for it in a conversation
//   extracted  the confirm-queue proposed it and they accepted
//   migrated   carried over from the old jargon/team/people notes
export type MemorySource = 'user' | 'chat' | 'extracted' | 'migrated';

export type MemoryItem = {
  readonly id: string;
  readonly text: string;
  readonly source: MemorySource;
  readonly conversationId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// One change to a memory, for the "why does it remember this" view.
export type MemoryHistoryEntry = {
  readonly at: string;
  readonly action: 'added' | 'edited' | 'removed';
  readonly text: string;
};

export type MemoryStoreError =
  //   not-configured  no embedding provider is set up yet
  //   unavailable     the native store or the embedder could not be reached
  //   not-found       no memory with that id
  //   invalid         the text was empty or too long
  //   store-failed    the store threw while reading or writing
  | { readonly kind: 'not-configured'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'store-failed'; readonly message: string };

export type MemoryAddInput = {
  readonly text: string;
  readonly source: MemorySource;
  readonly conversationId?: string;
};

export type MemoryStore = {
  // Adds a memory verbatim (the text is stored as written, not re-worded), returning it
  // with its new id and timestamps.
  readonly add: (input: MemoryAddInput) => Promise<Result<MemoryItem, MemoryStoreError>>;
  // The memories most relevant to a query, most relevant first.
  readonly search: (query: string, limit: number) => Promise<Result<readonly MemoryItem[], MemoryStoreError>>;
  // Everything, newest first, for the Memory page.
  readonly list: () => Promise<Result<readonly MemoryItem[], MemoryStoreError>>;
  readonly update: (id: string, text: string) => Promise<Result<MemoryItem, MemoryStoreError>>;
  readonly remove: (id: string) => Promise<Result<null, MemoryStoreError>>;
  readonly removeAll: () => Promise<Result<null, MemoryStoreError>>;
  readonly history: (id: string) => Promise<Result<readonly MemoryHistoryEntry[], MemoryStoreError>>;
};

// The owner id every memory is scoped to. The app is single-user per account (the account
// folder is the partition), so there is one owner; it exists so the store's rows carry a
// scope from the start rather than being retrofitted.
export const MEMORY_OWNER = 'me';

const MAX_TEXT = 2000;

// The one validation both the adapter and the CRUD service share, so "too long" means the
// same thing at every entry point.
export const validateMemoryText = (text: string): Result<string, MemoryStoreError> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return err({ kind: 'invalid', message: 'there is nothing to remember' });
  if (trimmed.length > MAX_TEXT) return err({ kind: 'invalid', message: `a memory can be at most ${MAX_TEXT} characters` });
  return { ok: true, value: trimmed };
};

// The store the app uses before an embedding provider is configured: every call answers
// that memory is not set up, so the tools and the page degrade honestly rather than crash.
export const notConfiguredMemoryStore = (): MemoryStore => {
  const notConfigured = <T>(): Promise<Result<T, MemoryStoreError>> =>
    Promise.resolve(err({ kind: 'not-configured', message: 'memory is not set up: choose an embedding provider in settings' }));
  return {
    add: notConfigured,
    search: notConfigured,
    list: notConfigured,
    update: notConfigured,
    remove: notConfigured,
    removeAll: notConfigured,
    history: notConfigured,
  };
};
