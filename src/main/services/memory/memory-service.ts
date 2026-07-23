/*
 * The notes the app keeps, and the questions it wants to ask about them.
 *
 * The IO shell around the memory documents. Three markdown files the user and the agent
 * both read, plus two bookkeeping files the agent never sees: what is waiting to be
 * asked, and how far each conversation has been read.
 *
 * Nothing is ever written to the notes without the user having said yes to it. That is
 * the whole point of the queue.
 */
import { listEntries, mergeMemoryEntries, parseMemoryDoc, serialiseMemoryDoc } from '../../../shared/memory-doc.ts';
import { memoryFileName } from '../../../shared/memory-file-name.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';
import { EMPTY_MEMORY_QUEUE, addCandidates, findCandidate, parseMemoryQueue, removeCandidate, serialiseMemoryQueue } from '../../../shared/memory-queue-doc.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import { EMPTY_MEMORY_STATE, markExtracted, needsExtraction, parseMemoryState, readSoFar, serialiseMemoryState } from '../../../shared/memory-state-doc.ts';
import { buildGlossaryBlocks, isNoteTooLong, NOTE_LIMIT } from '../../../shared/memory-glossary.ts';
import type { RawCandidate } from '../../../shared/memory-extract.ts';
import { memoryFilePath, memoryQueuePath, memoryStatePath } from '../../../shared/paths.ts';
import { readJsonFile, readTextFile, writeTextFileAtomic } from '../store/json-file.ts';
import type { MemoryEvent, MemoryResolveInput, StoreError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type MemoryServiceDeps = {
  readonly userData: string;
  readonly now: () => string;
  readonly newId: () => string;
  // How the renderer learns there is something to ask. Fire and forget.
  readonly emit: (event: MemoryEvent) => void;
};

export type MemoryService = {
  readonly pending: () => Promise<Result<readonly MemoryCandidate[], StoreError>>;
  readonly resolve: (input: unknown) => Promise<Result<readonly MemoryCandidate[], StoreError>>;
  readonly read: (name: unknown) => Promise<Result<string, StoreError>>;
  readonly write: (name: unknown, contents: unknown) => Promise<Result<null, StoreError>>;
  // What rides along with every turn. Degrades to nothing rather than failing a turn.
  readonly glossaryBlocks: () => Promise<readonly string[]>;
  readonly addCandidates: (items: readonly RawCandidate[], conversationId: string) => Promise<Result<number, StoreError>>;
  readonly extractionDue: (conversationId: string, messageCount: number) => Promise<boolean>;
  readonly readSoFar: (conversationId: string) => Promise<number>;
  readonly markExtracted: (conversationId: string, messageCount: number) => Promise<void>;
};

export const createMemoryService = (deps: MemoryServiceDeps): MemoryService => {
  const readNote = async (name: MemoryFileName): Promise<string> => {
    const text = await readTextFile(memoryFilePath(deps.userData, name));
    return text.ok ? text.value : '';
  };

  const readQueue = async (): Promise<ReturnType<typeof parseMemoryQueue>> => {
    const raw = await readJsonFile(memoryQueuePath(deps.userData));
    // No file yet is an empty queue, not a failure.
    if (!raw.ok) return ok(EMPTY_MEMORY_QUEUE);
    return parseMemoryQueue(raw.value);
  };

  const writeQueue = async (doc: Parameters<typeof serialiseMemoryQueue>[0]): Promise<Result<null, StoreError>> => {
    const written = await writeTextFileAtomic(memoryQueuePath(deps.userData), serialiseMemoryQueue(doc));
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    deps.emit({ type: 'pending-changed', count: doc.items.length });
    return ok(null);
  };

  const readState = async (): Promise<ReturnType<typeof parseMemoryState>> => {
    const raw = await readJsonFile(memoryStatePath(deps.userData));
    if (!raw.ok) return ok(EMPTY_MEMORY_STATE);
    return parseMemoryState(raw.value);
  };

  const pending = async (): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });
    return ok(queue.value.items);
  };

  const read = async (name: unknown): Promise<Result<string, StoreError>> => {
    const checked = memoryFileName(name);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });
    return ok(await readNote(checked.value));
  };

  const write = async (name: unknown, contents: unknown): Promise<Result<null, StoreError>> => {
    const checked = memoryFileName(name);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });
    if (typeof contents !== 'string') return err({ kind: 'invalid', message: 'that is not text' });
    // Refused rather than trimmed: everything in these notes is read before every
    // message, so a note that saved and was quietly cut would be text the user believes
    // the agent has and it does not.
    if (isNoteTooLong(contents)) return err({ kind: 'invalid', message: `A note has to stay under ${String(NOTE_LIMIT)} characters, because it is read before every message.` });

    const written = await writeTextFileAtomic(memoryFilePath(deps.userData, checked.value), contents);
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(null);
  };

  const resolve = async (input: unknown): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const draft = input as MemoryResolveInput | undefined;
    if (typeof draft?.id !== 'string') return err({ kind: 'invalid', message: 'that is not a question this app asked' });

    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });

    const candidate = findCandidate(queue.value, draft.id);
    // Already answered, or answered in another window: not an error, just nothing to do.
    if (candidate === undefined) return ok(queue.value.items);

    if (draft.action === 'accept') {
      const detail = typeof draft.detail === 'string' ? draft.detail.trim() : '';
      if (detail.length === 0) return err({ kind: 'invalid', message: 'a note needs something written in it' });

      const current = parseMemoryDoc(await readNote(candidate.kind));
      const merged = serialiseMemoryDoc(mergeMemoryEntries(current, [{ term: candidate.term, detail }]));
      // The same limit the panel enforces. Accepting is the other door into these
      // notes, and a note filled past the cap through this one would be text nobody
      // asked to hide but nothing would read.
      if (isNoteTooLong(merged)) {
        return err({
          kind: 'invalid',
          message: `That note is full. Shorten it in Settings first: it has to stay under ${String(NOTE_LIMIT)} characters, because it is read before every message.`,
        });
      }
      const written = await writeTextFileAtomic(memoryFilePath(deps.userData, candidate.kind), merged);
      if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    }

    const next = removeCandidate(queue.value, draft.id);
    const saved = await writeQueue(next);
    if (!saved.ok) return saved;
    return ok(next.items);
  };

  const glossaryBlocks = async (): Promise<readonly string[]> =>
    buildGlossaryBlocks({ jargon: await readNote('jargon'), team: await readNote('team'), people: await readNote('people') });

  const addFound = async (items: readonly RawCandidate[], conversationId: string): Promise<Result<number, StoreError>> => {
    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });

    const known = new Set(
      [
        ...listEntries(parseMemoryDoc(await readNote('jargon'))),
        ...listEntries(parseMemoryDoc(await readNote('team'))),
        ...listEntries(parseMemoryDoc(await readNote('people'))),
      ].map((entry) => entry.term)
    );
    const at = deps.now();
    const candidates: MemoryCandidate[] = items.map((item) => ({
      id: deps.newId(),
      kind: item.kind,
      term: item.term,
      suggestedDetail: item.detail,
      alternatives: item.alternatives,
      conversationId,
      quote: item.quote,
      ...(item.enrichment === undefined ? {} : { enrichment: item.enrichment }),
      createdAt: at,
    }));

    const next = addCandidates(queue.value, candidates, known);
    const added = next.items.length - queue.value.items.length;
    // Nothing new means nothing to write and nobody to tell.
    if (added === 0) return ok(0);

    const saved = await writeQueue(next);
    if (!saved.ok) return saved;
    return ok(added);
  };

  const extractionDue = async (conversationId: string, messageCount: number): Promise<boolean> => {
    const state = await readState();
    return state.ok && needsExtraction(state.value, conversationId, messageCount);
  };

  const howFar = async (conversationId: string): Promise<number> => {
    const state = await readState();
    return state.ok ? readSoFar(state.value, conversationId) : 0;
  };

  const rememberRead = async (conversationId: string, messageCount: number): Promise<void> => {
    const state = await readState();
    if (!state.ok) return;
    // A failed write only means the conversation is read again next time, which costs a
    // little and breaks nothing.
    await writeTextFileAtomic(memoryStatePath(deps.userData), serialiseMemoryState(markExtracted(state.value, conversationId, messageCount, deps.now())));
  };

  return { pending, resolve, read, write, glossaryBlocks, addCandidates: addFound, extractionDue, readSoFar: howFar, markExtracted: rememberRead };
};
