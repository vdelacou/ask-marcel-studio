/*
 * The searchable memory, backed by better-sqlite3 and an OpenAI-compatible embedder.
 *
 * The ONLY importer of better-sqlite3 in the app. The bun runner cannot load a native
 * module built for Electron's ABI, so nothing here is unit-tested directly: the ranking
 * (vector-math), the request/response shape (embedding), the validation and the port
 * contract (memory-store) are all pure and tested, and this file is the thin IO shell that
 * wires them to the disk and the network. It is in the coverage "skipped" tier for the
 * same reason the other native/electron shells are.
 *
 * Every method translates a throw into a Result err (rule 17, try/catch quarantined to
 * infra). The embedder is the AI dependency behind the same port (rule 32): a caller never
 * sees a vector, only text in and memories out.
 *
 * better-sqlite3 is synchronous, which is why the queries are not awaited; the async
 * signatures are the port's, and the one genuinely async step is the embedding fetch.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { topBySimilarity } from '../../../shared/vector-math.ts';
import { MEMORY_OWNER, validateMemoryText } from '../../../shared/memory-store.ts';
import type { MemoryAddInput, MemoryHistoryEntry, MemoryItem, MemorySource, MemoryStore, MemoryStoreError } from '../../../shared/memory-store.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import { ok, err } from '../../../shared/result.ts';
import type { Result } from '../../../shared/result.ts';

// The embedder's shape, injected so a test could pass a fake, and so the fetch deadline
// lives at the composition root like every other outbound call.
export type Embedder = (text: string) => Promise<Result<readonly number[], string>>;

export type SqliteMemoryStoreDeps = {
  readonly dbPath: string;
  readonly embed: Embedder;
  readonly now: () => string;
  readonly newId: () => string;
};

type Row = {
  readonly id: string;
  readonly text: string;
  readonly source: string;
  readonly conversation_id: string | null;
  readonly embedding: Buffer;
  readonly created_at: string;
  readonly updated_at: string;
};

const SOURCES: ReadonlySet<string> = new Set<MemorySource>(['user', 'chat', 'extracted', 'migrated']);

const toItem = (row: Omit<Row, 'embedding'>): MemoryItem => ({
  id: row.id,
  text: row.text,
  source: SOURCES.has(row.source) ? (row.source as MemorySource) : 'user',
  ...(row.conversation_id === null ? {} : { conversationId: row.conversation_id }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toBlob = (vector: readonly number[]): Buffer => Buffer.from(Float32Array.from(vector).buffer);
const fromBlob = (blob: Buffer): readonly number[] => Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT));

export const createSqliteMemoryStore = (deps: SqliteMemoryStoreDeps): MemoryStore => {
  // Opened lazily and once. A failure to open (a native ABI mismatch, a corrupt file)
  // becomes 'unavailable' at the first call rather than crashing the launch.
  let db: Database.Database | undefined;
  let openError: string | undefined;

  const open = (): Database.Database | undefined => {
    if (db !== undefined) return db;
    if (openError !== undefined) return undefined;
    try {
      mkdirSync(dirname(deps.dbPath), { recursive: true });
      const opened = new Database(deps.dbPath);
      opened.pragma('journal_mode = WAL');
      opened.exec(
        `CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL,
          conversation_id TEXT, embedding BLOB NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memory_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, text TEXT NOT NULL
        );`
      );
      db = opened;
      return opened;
    } catch (caught) {
      openError = formatError(caught);
      return undefined;
    }
  };

  const unavailable = <T>(message: string): Result<T, MemoryStoreError> => err({ kind: 'unavailable', message });

  const record = (handle: Database.Database, memoryId: string, action: MemoryHistoryEntry['action'], text: string, at: string): void => {
    handle.prepare('INSERT INTO memory_history (memory_id, at, action, text) VALUES (?, ?, ?, ?)').run(memoryId, at, action, text);
  };

  const add = async (input: MemoryAddInput): Promise<Result<MemoryItem, MemoryStoreError>> => {
    const validated = validateMemoryText(input.text);
    if (!validated.ok) return validated;
    const handle = open();
    if (handle === undefined) return unavailable(openError ?? 'the memory store could not be opened');
    const embedding = await deps.embed(validated.value);
    if (!embedding.ok) return unavailable(`could not embed the memory: ${embedding.error}`);
    try {
      const at = deps.now();
      const item: MemoryItem = {
        id: deps.newId(),
        text: validated.value,
        source: input.source,
        ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
        createdAt: at,
        updatedAt: at,
      };
      handle
        .prepare('INSERT INTO memories (id, owner, text, source, conversation_id, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(item.id, MEMORY_OWNER, item.text, item.source, input.conversationId ?? null, toBlob(embedding.value), at, at);
      record(handle, item.id, 'added', item.text, at);
      return ok(item);
    } catch (caught) {
      return err({ kind: 'store-failed', message: formatError(caught) });
    }
  };

  const allRows = (handle: Database.Database): readonly Row[] =>
    handle.prepare('SELECT id, text, source, conversation_id, embedding, created_at, updated_at FROM memories WHERE owner = ?').all(MEMORY_OWNER) as Row[];

  const search = async (query: string, limit: number): Promise<Result<readonly MemoryItem[], MemoryStoreError>> => {
    const handle = open();
    if (handle === undefined) return unavailable(openError ?? 'the memory store could not be opened');
    const queryEmbedding = await deps.embed(query);
    if (!queryEmbedding.ok) return unavailable(`could not embed the search: ${queryEmbedding.error}`);
    try {
      const candidates = allRows(handle).map((row) => ({ item: toItem(row), embedding: fromBlob(row.embedding) }));
      // A modest floor so a search is an answer, not the whole store ranked.
      const scored = topBySimilarity(queryEmbedding.value, candidates, limit, 0.2);
      return ok(scored.map((entry) => entry.item));
    } catch (caught) {
      return err({ kind: 'store-failed', message: formatError(caught) });
    }
  };

  const list = (): Promise<Result<readonly MemoryItem[], MemoryStoreError>> => {
    const handle = open();
    if (handle === undefined) return Promise.resolve(unavailable(openError ?? 'the memory store could not be opened'));
    try {
      const rows = handle
        .prepare('SELECT id, text, source, conversation_id, created_at, updated_at FROM memories WHERE owner = ? ORDER BY created_at DESC')
        .all(MEMORY_OWNER) as Omit<Row, 'embedding'>[];
      return Promise.resolve(ok(rows.map(toItem)));
    } catch (caught) {
      return Promise.resolve(err({ kind: 'store-failed', message: formatError(caught) }));
    }
  };

  const update = async (id: string, text: string): Promise<Result<MemoryItem, MemoryStoreError>> => {
    const validated = validateMemoryText(text);
    if (!validated.ok) return validated;
    const handle = open();
    if (handle === undefined) return unavailable(openError ?? 'the memory store could not be opened');
    const existing = handle.prepare('SELECT id, text, source, conversation_id, created_at, updated_at FROM memories WHERE id = ? AND owner = ?').get(id, MEMORY_OWNER) as
      Omit<Row, 'embedding'> | undefined;
    if (existing === undefined) return err({ kind: 'not-found', message: `no memory with id ${id}` });
    const embedding = await deps.embed(validated.value);
    if (!embedding.ok) return unavailable(`could not embed the memory: ${embedding.error}`);
    try {
      const at = deps.now();
      handle.prepare('UPDATE memories SET text = ?, embedding = ?, updated_at = ? WHERE id = ? AND owner = ?').run(validated.value, toBlob(embedding.value), at, id, MEMORY_OWNER);
      record(handle, id, 'edited', validated.value, at);
      return ok(toItem({ ...existing, text: validated.value, updated_at: at }));
    } catch (caught) {
      return err({ kind: 'store-failed', message: formatError(caught) });
    }
  };

  const remove = (id: string): Promise<Result<null, MemoryStoreError>> => {
    const handle = open();
    if (handle === undefined) return Promise.resolve(unavailable(openError ?? 'the memory store could not be opened'));
    try {
      const existing = handle.prepare('SELECT text FROM memories WHERE id = ? AND owner = ?').get(id, MEMORY_OWNER) as { text: string } | undefined;
      if (existing === undefined) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
      handle.prepare('DELETE FROM memories WHERE id = ? AND owner = ?').run(id, MEMORY_OWNER);
      record(handle, id, 'removed', existing.text, deps.now());
      return Promise.resolve(ok(null));
    } catch (caught) {
      return Promise.resolve(err({ kind: 'store-failed', message: formatError(caught) }));
    }
  };

  const removeAll = (): Promise<Result<null, MemoryStoreError>> => {
    const handle = open();
    if (handle === undefined) return Promise.resolve(unavailable(openError ?? 'the memory store could not be opened'));
    try {
      handle.prepare('DELETE FROM memories WHERE owner = ?').run(MEMORY_OWNER);
      return Promise.resolve(ok(null));
    } catch (caught) {
      return Promise.resolve(err({ kind: 'store-failed', message: formatError(caught) }));
    }
  };

  const history = (id: string): Promise<Result<readonly MemoryHistoryEntry[], MemoryStoreError>> => {
    const handle = open();
    if (handle === undefined) return Promise.resolve(unavailable(openError ?? 'the memory store could not be opened'));
    try {
      const rows = handle.prepare('SELECT at, action, text FROM memory_history WHERE memory_id = ? ORDER BY id ASC').all(id) as { at: string; action: string; text: string }[];
      if (rows.length === 0) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
      return Promise.resolve(ok(rows.map((row) => ({ at: row.at, action: row.action as MemoryHistoryEntry['action'], text: row.text }))));
    } catch (caught) {
      return Promise.resolve(err({ kind: 'store-failed', message: formatError(caught) }));
    }
  };

  return { add, search, list, update, remove, removeAll, history };
};
