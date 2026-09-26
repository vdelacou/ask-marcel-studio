/*
 * One change to one entry of the notes, made from the lists on the memory page.
 *
 * The lists change a note an entry at a time rather than handing the whole file back, so
 * nothing the window did not show (a line in some other shape, an entry an accepted
 * suggestion added a moment ago) can be written over. Each change names the entry exactly
 * as the window read it: when that entry is no longer there, the change is refused as
 * changed instead of landing on whatever now sits in its place.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import { TERM_LIMIT, listEntries, normaliseTerm } from './memory-doc.ts';
import type { MemoryDoc, MemoryEntry } from './memory-doc.ts';
import { memoryFileName } from './memory-file-name.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import { andThen, err, mapResult, ok } from './result.ts';
import type { Result } from './result.ts';

export type MemoryEntryEdit =
  | { readonly action: 'add'; readonly note: MemoryFileName; readonly entry: MemoryEntry }
  // `previous` is the entry as the window showed it; `entry` is what it becomes.
  | { readonly action: 'update'; readonly note: MemoryFileName; readonly previous: MemoryEntry; readonly entry: MemoryEntry }
  | { readonly action: 'remove'; readonly note: MemoryFileName; readonly entry: MemoryEntry }
  // The undo of a removal: back on the line it was taken from.
  | { readonly action: 'restore'; readonly note: MemoryFileName; readonly entry: MemoryEntry; readonly at: number }
  // A person crossing between the two people notes, which the window shows as one list.
  | { readonly action: 'move'; readonly note: MemoryFileName; readonly to: MemoryFileName; readonly entry: MemoryEntry };

export type MemoryEditError = { readonly kind: 'invalid' | 'duplicate' | 'not-found' | 'write-failed'; readonly message: string };

export type MemoryDocs = Readonly<Record<MemoryFileName, MemoryDoc>>;

// The three notes as their files read, handed back after every change.
export type MemoryNotes = Readonly<Record<MemoryFileName, string>>;

const invalid = (message: string): MemoryEditError => ({ kind: 'invalid', message });

const NOT_A_CHANGE = invalid('That is not a change this app knows how to make.');

const CHANGED: MemoryEditError = { kind: 'not-found', message: 'That entry changed in the meantime, so the list now shows it as it is.' };

const alreadyIn = (term: string, where: string): MemoryEditError => ({ kind: 'duplicate', message: `“${term}” is already in ${where}.` });

// An entry is one line of its note, so a line break pasted into it becomes a space: kept,
// it would turn the second half into a line of some other shape.
const oneLine = (text: string): string =>
  text
    .split(/[\r\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

export const wantedEntry = (rawTerm: string, rawDetail: string): Result<MemoryEntry, MemoryEditError> => {
  const term = oneLine(rawTerm);
  const detail = oneLine(rawDetail);
  if (term.length === 0) return err(invalid('Write the word or the name first.'));
  if (term.length > TERM_LIMIT) return err(invalid(`Keep it to ${String(TERM_LIMIT)} characters or fewer.`));
  if (term.includes('*')) return err(invalid('Leave out the asterisk: the note uses it for its own formatting.'));
  if (detail.length === 0) return err(invalid('Say what it means, or who they are.'));
  return ok({ term, detail });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// An entry the user wants stored, held to the rules for a new one.
const wanted = (raw: unknown): Result<MemoryEntry, MemoryEditError> =>
  isRecord(raw) && typeof raw['term'] === 'string' && typeof raw['detail'] === 'string' ? wantedEntry(raw['term'], raw['detail']) : err(NOT_A_CHANGE);

// An entry as the note already holds it, which the new-entry rules do not bind: a hand-typed
// line with no meaning yet still has to be removable.
const existing = (raw: unknown): Result<MemoryEntry, MemoryEditError> =>
  isRecord(raw) && typeof raw['term'] === 'string' && raw['term'].length > 0 && typeof raw['detail'] === 'string'
    ? ok({ term: raw['term'], detail: raw['detail'] })
    : err(NOT_A_CHANGE);

const position = (raw: unknown): Result<number, MemoryEditError> => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? ok(raw) : err(NOT_A_CHANGE));

const otherNote = (raw: unknown, note: MemoryFileName): Result<MemoryFileName, MemoryEditError> => {
  const to = memoryFileName(raw);
  return to.ok && to.value !== note ? ok(to.value) : err(NOT_A_CHANGE);
};

type Reader = (raw: Readonly<Record<string, unknown>>, note: MemoryFileName) => Result<MemoryEntryEdit, MemoryEditError>;

const READERS: Readonly<Record<MemoryEntryEdit['action'], Reader>> = {
  add: (raw, note) => mapResult(wanted(raw['entry']), (entry): MemoryEntryEdit => ({ action: 'add', note, entry })),
  update: (raw, note) =>
    andThen(existing(raw['previous']), (previous) => mapResult(wanted(raw['entry']), (entry): MemoryEntryEdit => ({ action: 'update', note, previous, entry }))),
  remove: (raw, note) => mapResult(existing(raw['entry']), (entry): MemoryEntryEdit => ({ action: 'remove', note, entry })),
  restore: (raw, note) => andThen(existing(raw['entry']), (entry) => mapResult(position(raw['at']), (at): MemoryEntryEdit => ({ action: 'restore', note, entry, at }))),
  move: (raw, note) => andThen(existing(raw['entry']), (entry) => mapResult(otherNote(raw['to'], note), (to): MemoryEntryEdit => ({ action: 'move', note, to, entry }))),
};

const isAction = (value: unknown): value is MemoryEntryEdit['action'] => typeof value === 'string' && Object.hasOwn(READERS, value);

// The checkpoint for a change arriving over IPC, where it is untrusted JSON whatever the
// renderer's types said.
export const parseMemoryEntryEdit = (raw: unknown): Result<MemoryEntryEdit, MemoryEditError> => {
  if (!isRecord(raw) || !isAction(raw['action'])) return err(NOT_A_CHANGE);
  const note = memoryFileName(raw['note']);
  return note.ok ? READERS[raw['action']](raw, note.value) : err(NOT_A_CHANGE);
};

// Where this exact entry sits, word and meaning alike: two lines may share a word, and the
// one the window showed is the one to change.
export const entryLineAt = (doc: MemoryDoc, entry: MemoryEntry): number =>
  doc.lines.findIndex((line) => line.kind === 'entry' && line.entry.term === entry.term && line.entry.detail === entry.detail);

const holds = (doc: MemoryDoc, term: string): boolean => listEntries(doc).some((held) => normaliseTerm(held.term) === normaliseTerm(term));

const insertedAt = (doc: MemoryDoc, at: number, entry: MemoryEntry): MemoryDoc => ({
  ...doc,
  lines: [...doc.lines.slice(0, at), { kind: 'entry', entry }, ...doc.lines.slice(at)],
});

const appended = (doc: MemoryDoc, entry: MemoryEntry): MemoryDoc => insertedAt(doc, doc.lines.length, entry);

const withoutLine = (doc: MemoryDoc, at: number): MemoryDoc => ({ ...doc, lines: doc.lines.filter((_, index) => index !== at) });

type Applied = Result<MemoryDocs, MemoryEditError>;

const add = (docs: MemoryDocs, note: MemoryFileName, entry: MemoryEntry): Applied =>
  holds(docs[note], entry.term) ? err(alreadyIn(entry.term, 'this list')) : ok({ ...docs, [note]: appended(docs[note], entry) });

const update = (docs: MemoryDocs, note: MemoryFileName, previous: MemoryEntry, entry: MemoryEntry): Applied => {
  const at = entryLineAt(docs[note], previous);
  if (at === -1) return err(CHANGED);
  // Only a renamed entry can collide: one keeping its word may share it with a twin already.
  if (normaliseTerm(previous.term) !== normaliseTerm(entry.term) && holds(docs[note], entry.term)) return err(alreadyIn(entry.term, 'this list'));
  return ok({ ...docs, [note]: insertedAt(withoutLine(docs[note], at), at, entry) });
};

const remove = (docs: MemoryDocs, note: MemoryFileName, entry: MemoryEntry): Applied => {
  const at = entryLineAt(docs[note], entry);
  return at === -1 ? err(CHANGED) : ok({ ...docs, [note]: withoutLine(docs[note], at) });
};

// Written target first by the caller, so a failure between the two files duplicates the
// person rather than losing them.
const move = (docs: MemoryDocs, note: MemoryFileName, to: MemoryFileName, entry: MemoryEntry): Applied => {
  const at = entryLineAt(docs[note], entry);
  if (at === -1) return err(CHANGED);
  if (holds(docs[to], entry.term)) return err(alreadyIn(entry.term, 'the other list'));
  return ok({ ...docs, [note]: withoutLine(docs[note], at), [to]: appended(docs[to], entry) });
};

export const applyMemoryEntryEdit = (docs: MemoryDocs, edit: MemoryEntryEdit): Applied => {
  switch (edit.action) {
    case 'add':
      return add(docs, edit.note, edit.entry);
    case 'update':
      return update(docs, edit.note, edit.previous, edit.entry);
    case 'remove':
      return remove(docs, edit.note, edit.entry);
    case 'restore':
      // No clash check: undoing the removal of one of two twins must bring it back.
      return ok({ ...docs, [edit.note]: insertedAt(docs[edit.note], edit.at, edit.entry) });
    case 'move':
      return move(docs, edit.note, edit.to, edit.entry);
  }
};
