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
import type { MemoryEntry } from '../../../shared/memory-doc.ts';
import { applyMemoryEntryEdit, parseMemoryEntryEdit, wantedEntry } from '../../../shared/memory-entry-edit.ts';
import type { MemoryEditError, MemoryEntryEdit, MemoryNotes } from '../../../shared/memory-entry-edit.ts';
import { MEMORY_FILES, memoryFileName } from '../../../shared/memory-file-name.ts';
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
  stillUnknown,
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
  // The three notes emptied, and the queue with its skipped words; the reading progress stays.
  readonly clearAll: () => Promise<Result<null, StoreError>>;
  // What rides along with every turn. Degrades to nothing rather than failing a turn.
  readonly glossaryBlocks: () => Promise<readonly string[]>;
  readonly addCandidates: (items: readonly RawCandidate[], conversationId: string) => Promise<Result<number, StoreError>>;
  readonly extractionDue: (conversationId: string, messageCount: number) => Promise<boolean>;
  readonly readSoFar: (conversationId: string) => Promise<number>;
  readonly markExtracted: (conversationId: string, messageCount: number) => Promise<void>;
};

// Said when a note is there but cannot be read: writing it as if it were empty would throw away
// whatever it holds, so nothing that would write it goes ahead.
const UNREADABLE = 'That list could not be read from disk, so nothing was changed.';

// The entry a suggestion becomes, as the user left it on the card. Marcel hears a word inside a
// sentence and sometimes hears it slightly wrong, so the review list lets them correct it; rubbing
// it out entirely means they had nothing to add, not that the note wants a blank heading. A word
// long enough to be a paragraph is cut to a word. Otherwise held to the rules of any entry: one
// line each, which a meaning typed into a box can break, and no asterisk in the word.
const entryFrom = (candidate: MemoryCandidate, draft: Extract<MemoryResolveInput, { action: 'accept' }>): Result<MemoryEntry, MemoryEditError> => {
  const corrected = typeof draft.term === 'string' ? draft.term.trim().slice(0, TERM_LIMIT) : '';
  return wantedEntry(corrected.length === 0 ? candidate.term : corrected, typeof draft.detail === 'string' ? draft.detail : '');
};

export const createMemoryService = (deps: MemoryServiceDeps): MemoryService => {
  // A note not written yet is empty. One that is there and cannot be read is refused, never taken
  // for empty, by anything that would write it.
  const noteText = async (name: MemoryFileName): Promise<Result<string, StoreError>> => {
    const text = await readTextFile(memoryFilePath(deps.userData, name));
    if (text.ok) return ok(text.value);
    return text.error.kind === 'not-found' ? ok('') : err({ kind: 'unreadable', message: UNREADABLE });
  };

  // For what only reads: Marcel's view of the notes degrades to nothing rather than failing.
  const readNote = async (name: MemoryFileName): Promise<string> => {
    const text = await noteText(name);
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

  // Every word in the three notes, as written there.
  const knownTerms = async (): Promise<ReadonlySet<string>> =>
    new Set(
      [
        ...listEntries(parseMemoryDoc(await readNote('jargon'))),
        ...listEntries(parseMemoryDoc(await readNote('team'))),
        ...listEntries(parseMemoryDoc(await readNote('people'))),
      ].map((entry) => entry.term)
    );

  // What the review list shows: the questions whose word the notes do not hold yet.
  const open = async (items: readonly MemoryCandidate[]): Promise<readonly MemoryCandidate[]> => stillUnknown(items, await knownTerms());

  const announce = async (items: readonly MemoryCandidate[]): Promise<void> => {
    deps.emit({ type: 'pending-changed', count: (await open(items)).length });
  };

  const writeQueue = async (doc: Parameters<typeof serialiseMemoryQueue>[0]): Promise<Result<null, StoreError>> => {
    const written = await writeTextFileAtomic(memoryQueuePath(deps.userData), serialiseMemoryQueue(doc));
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    await announce(doc.items);
    return ok(null);
  };

  // A note changed by hand may have answered a question still waiting: the review list is told,
  // so it can drop that question.
  const noteChanged = async (): Promise<void> => {
    const queue = await readQueue();
    if (queue.ok) await announce(queue.value.items);
  };

  const readState = async (): Promise<ReturnType<typeof parseMemoryState>> => {
    const raw = await readJsonFile(memoryStatePath(deps.userData));
    if (!raw.ok) return ok(EMPTY_MEMORY_STATE);
    return parseMemoryState(raw.value);
  };

  const pending = async (): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });
    return ok(await open(queue.value.items));
  };

  const read = async (name: unknown): Promise<Result<string, StoreError>> => {
    const checked = memoryFileName(name);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });
    return noteText(checked.value);
  };

  // Against the note as the window opened it: refused when it cannot be read, or has changed since.
  const unchangedSince = async (name: MemoryFileName, expected: unknown): Promise<Result<null, StoreError>> => {
    const now = await noteText(name);
    if (!now.ok) return now;
    return expected === now.value
      ? ok(null)
      : err({ kind: 'conflict', message: 'This note changed after you opened it, so it was not saved. Copy anything you want to keep, then open it again.' });
  };

  const write = async (name: unknown, contents: unknown, expected?: unknown): Promise<Result<null, StoreError>> => {
    const checked = memoryFileName(name);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });
    if (typeof contents !== 'string') return err({ kind: 'invalid', message: 'that is not text' });
    const unchanged = expected === undefined ? ok(null) : await unchangedSince(checked.value, expected);
    if (!unchanged.ok) return unchanged;
    const written = await writeTextFileAtomic(memoryFilePath(deps.userData, checked.value), contents);
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    await noteChanged();
    return ok(null);
  };

  const saveQueue = async (next: MemoryQueueDoc): Promise<Result<readonly MemoryCandidate[], StoreError>> => {
    const saved = await writeQueue(next);
    return saved.ok ? ok(await open(next.items)) : saved;
  };

  // Into the note the user filed it under (the one Marcel guessed, unless they picked another),
  // merged with what is already written there.
  const remember = async (candidate: MemoryCandidate, draft: Extract<MemoryResolveInput, { action: 'accept' }>): Promise<Result<null, StoreError>> => {
    const entry = entryFrom(candidate, draft);
    if (!entry.ok) return err({ kind: 'invalid', message: entry.error.message });
    const note = draft.kind === undefined ? ok(candidate.kind) : memoryFileName(draft.kind);
    if (!note.ok) return err({ kind: 'invalid', message: note.error.message });

    const current = await noteText(note.value);
    if (!current.ok) return current;
    const merged = mergeMemoryEntries(parseMemoryDoc(current.value), [entry.value]);
    const written = await writeTextFileAtomic(memoryFilePath(deps.userData, note.value), serialiseMemoryDoc(merged));
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
    if (candidate === undefined) return ok(await open(queue.value.items));
    if (draft.action === 'accept') {
      const remembered = await remember(candidate, draft);
      return remembered.ok ? saveQueue(removeCandidate(queue.value, draft.id)) : remembered;
    }
    // A skip silences the word for good, so only a skip is taken as one: an answer this app
    // does not know is refused, whatever the window's types claimed it was.
    return draft.action === 'reject' ? saveQueue(skipCandidate(queue.value, draft.id)) : err({ kind: 'invalid', message: 'that is not an answer this app knows' });
  };

  // The note a person moves into is written first: a failure between the two writes then
  // leaves them in both lists rather than in neither.
  const touchedBy = (edit: MemoryEntryEdit): readonly MemoryFileName[] => (edit.action === 'move' ? [edit.to, edit.note] : [edit.note]);

  // The three notes a change starts from. Every note it writes has to have been read; one it
  // leaves alone may show as empty.
  const notesFor = async (edit: MemoryEntryEdit): Promise<Result<MemoryNotes, MemoryEditError>> => {
    const read = { jargon: await noteText('jargon'), team: await noteText('team'), people: await noteText('people') };
    if (touchedBy(edit).some((name) => !read[name].ok)) return err({ kind: 'unreadable', message: UNREADABLE });
    const textOf = (text: Result<string, StoreError>): string => (text.ok ? text.value : '');
    return ok({ jargon: textOf(read.jargon), team: textOf(read.team), people: textOf(read.people) });
  };

  const edit = async (input: unknown): Promise<Result<MemoryNotes, MemoryEditError>> => {
    const change = parseMemoryEntryEdit(input);
    if (!change.ok) return change;
    const notes = await notesFor(change.value);
    if (!notes.ok) return notes;
    const before = notes.value;
    const applied = applyMemoryEntryEdit({ jargon: parseMemoryDoc(before.jargon), team: parseMemoryDoc(before.team), people: parseMemoryDoc(before.people) }, change.value);
    if (!applied.ok) return applied;
    let after = before;
    for (const name of touchedBy(change.value)) {
      const text = serialiseMemoryDoc(applied.value[name]);
      const written = await writeTextFileAtomic(memoryFilePath(deps.userData, name), text);
      if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
      after = { ...after, [name]: text };
    }
    await noteChanged();
    return ok(after);
  };

  const clearAll = async (): Promise<Result<null, StoreError>> => {
    for (const name of MEMORY_FILES) {
      const written = await writeTextFileAtomic(memoryFilePath(deps.userData, name), '');
      if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    }
    return writeQueue(EMPTY_MEMORY_QUEUE);
  };

  const glossaryBlocks = async (): Promise<readonly string[]> =>
    buildGlossaryBlocks({ jargon: await readNote('jargon'), team: await readNote('team'), people: await readNote('people') });

  const addFound = async (items: readonly RawCandidate[], conversationId: string): Promise<Result<number, StoreError>> => {
    const queue = await readQueue();
    if (!queue.ok) return err({ kind: 'unreadable', message: queue.error.message });

    const known = await knownTerms();
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
    clearAll: () => oneAtATime(clearAll),
    glossaryBlocks,
    // Queued with the answers: found in the background at any moment, and a read-modify-write of
    // the same queue, it would otherwise bring back a word skipped while it was on its way.
    addCandidates: (items, conversationId) => oneAtATime(() => addFound(items, conversationId)),
    extractionDue,
    readSoFar: howFar,
    markExtracted: rememberRead,
  };
};
