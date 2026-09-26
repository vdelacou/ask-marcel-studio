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
import { TERM_LIMIT, listEntries, mergeMemoryEntries, parseMemoryDoc, serialiseMemoryDoc } from '../../../shared/memory-doc.ts';
import { applyMemoryEntryEdit, parseMemoryEntryEdit } from '../../../shared/memory-entry-edit.ts';
import type { MemoryEditError, MemoryEntryEdit, MemoryNotes } from '../../../shared/memory-entry-edit.ts';
import { memoryFileName } from '../../../shared/memory-file-name.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';
import {
  EMPTY_MEMORY_QUEUE,
  addCandidates,
  findCandidate,
  parseMemoryCandidate,
  parseMemoryQueue,
  removeCandidate,
  serialiseMemoryQueue,
  skipCandidate,
  unskipCandidate,
} from '../../../shared/memory-queue-doc.ts';
import type { MemoryCandidate, MemoryQueueDoc } from '../../../shared/memory-queue-doc.ts';
import { EMPTY_MEMORY_STATE, markExtracted, needsExtraction, parseMemoryState, readSoFar, serialiseMemoryState } from '../../../shared/memory-state-doc.ts';
import { buildGlossaryBlocks } from '../../../shared/memory-glossary.ts';
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
  // `expected` is the note as the window opened it: when given, a note that has changed since
  // is refused rather than written over.
  readonly write: (name: unknown, contents: unknown, expected?: unknown) => Promise<Result<null, StoreError>>;
  // One entry added, changed, removed, put back or moved; answers with all three notes.
  readonly edit: (input: unknown) => Promise<Result<MemoryNotes, MemoryEditError>>;
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

  // One note change at a time. Each is a read-modify-write of a whole file, and two in
  // flight together would each read the note before the other wrote it, so the second
  // write would bring back what the first took out.
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
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

  const write = async (name: unknown, contents: unknown, expected?: unknown): Promise<Result<null, StoreError>> => {
    const checked = memoryFileName(name);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });
    if (typeof contents !== 'string') return err({ kind: 'invalid', message: 'that is not text' });
    if (expected !== undefined && expected !== (await readNote(checked.value))) {
      return err({ kind: 'conflict', message: 'This note changed after you opened it, so it was not saved. Copy anything you want to keep, then open it again.' });
    }
    const written = await writeTextFileAtomic(memoryFilePath(deps.userData, checked.value), contents);
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(null);
  };

  const saveQueue = async (next: MemoryQueueDoc): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const saved = await writeQueue(next);
    return saved.ok ? ok(next.items) : saved;
  };

  // Into the note the user filed it under (the one Marcel guessed, unless they picked another),
  // merged with what is already written there.
  const remember = async (candidate: MemoryCandidate, draft: Extract<MemoryResolveInput, { action: 'accept' }>): Promise<Result<null, StoreError>> => {
    const detail = typeof draft.detail === 'string' ? draft.detail.trim() : '';
    if (detail.length === 0) return err({ kind: 'invalid', message: 'a note needs something written in it' });
    const note = draft.kind === undefined ? ok(candidate.kind) : memoryFileName(draft.kind);
    if (!note.ok) return err({ kind: 'invalid', message: note.error.message });

    // The term as the user left it. Marcel hears a word inside a sentence and sometimes
    // hears it slightly wrong, so the review list lets them correct it; rubbing it out
    // entirely means they had nothing to add, not that the note wants a blank heading.
    const corrected = typeof draft.term === 'string' ? draft.term.trim().slice(0, TERM_LIMIT) : '';
    const term = corrected.length === 0 ? candidate.term : corrected;

    const current = parseMemoryDoc(await readNote(note.value));
    const written = await writeTextFileAtomic(memoryFilePath(deps.userData, note.value), serialiseMemoryDoc(mergeMemoryEntries(current, [{ term, detail }])));
    return written.ok ? ok(null) : err({ kind: 'write-failed', message: written.error.message });
  };

  // The undo of a skip. The candidate comes back from the window, so it is read again as
  // untrusted before it rejoins the queue.
  const restoreSkipped = async (raw: unknown): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const candidate = parseMemoryCandidate(raw);
    if (candidate === undefined) return err({ kind: 'invalid', message: 'that is not a question this app asked' });
    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });
    return saveQueue(unskipCandidate(queue.value, candidate));
  };

  const resolve = async (input: unknown): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const draft = input as MemoryResolveInput | undefined;
    if (draft?.action === 'restore') return restoreSkipped(draft.candidate);
    if (typeof draft?.id !== 'string') return err({ kind: 'invalid', message: 'that is not a question this app asked' });

    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });

    const candidate = findCandidate(queue.value, draft.id);
    // Already answered, or answered in another window: not an error, just nothing to do.
    if (candidate === undefined) return ok(queue.value.items);
    if (draft.action === 'accept') {
      const remembered = await remember(candidate, draft);
      return remembered.ok ? saveQueue(removeCandidate(queue.value, draft.id)) : remembered;
    }
    // A skip silences the word for good, so only a skip is taken as one: an answer this app
    // does not know is refused, whatever the window's types claimed it was.
    return draft.action === 'reject' ? saveQueue(skipCandidate(queue.value, draft.id)) : err({ kind: 'invalid', message: 'that is not an answer this app knows' });
  };

  const readNotes = async (): Promise<MemoryNotes> => ({ jargon: await readNote('jargon'), team: await readNote('team'), people: await readNote('people') });

  // The note a person moves into is written first: a failure between the two writes then
  // leaves them in both lists rather than in neither.
  const touchedBy = (edit: MemoryEntryEdit): readonly MemoryFileName[] => (edit.action === 'move' ? [edit.to, edit.note] : [edit.note]);

  const edit = async (input: unknown): Promise<Result<MemoryNotes, MemoryEditError>> => {
    const change = parseMemoryEntryEdit(input);
    if (!change.ok) return change;
    const before = await readNotes();
    const applied = applyMemoryEntryEdit({ jargon: parseMemoryDoc(before.jargon), team: parseMemoryDoc(before.team), people: parseMemoryDoc(before.people) }, change.value);
    if (!applied.ok) return applied;
    let after = before;
    for (const name of touchedBy(change.value)) {
      const text = serialiseMemoryDoc(applied.value[name]);
      const written = await writeTextFileAtomic(memoryFilePath(deps.userData, name), text);
      if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
      after = { ...after, [name]: text };
    }
    return ok(after);
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

  return {
    pending,
    resolve: (input) => oneAtATime(() => resolve(input)),
    read,
    write: (name, contents, expected) => oneAtATime(() => write(name, contents, expected)),
    edit: (input) => oneAtATime(() => edit(input)),
    glossaryBlocks,
    addCandidates: addFound,
    extractionDue,
    readSoFar: howFar,
    markExtracted: rememberRead,
  };
};
