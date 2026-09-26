/*
 * What the lists on the memory page show.
 *
 * Two lists over three notes: the words the user's organisation uses (one note), and the
 * people they work with, which is two notes shown as one, each person marked as on the team
 * or not. A row keeps the entry exactly as its note holds it, because a change names the
 * entry it read and main refuses one that no longer matches.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { normaliseTerm, parseMemoryDoc } from '../../../shared/memory-doc.ts';
import type { MemoryEntry } from '../../../shared/memory-doc.ts';
import { wantedEntry } from '../../../shared/memory-entry-edit.ts';
import type { MemoryNotes } from '../../../shared/memory-entry-edit.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type MemoryListKind = 'words' | 'people';

export type MemoryListRow = {
  // Unique within the list, and unchanged by edits to other entries, so a row open for
  // writing stays that row while its neighbours come and go. Two lines may hold the same entry.
  readonly key: string;
  readonly note: MemoryFileName;
  // The line the entry sits on, which is where an undone removal puts it back.
  readonly line: number;
  readonly entry: MemoryEntry;
  readonly isTeam: boolean;
};

export type MemoryTeamFilter = 'all' | 'team' | 'others';

export type MemoryListFilter = { readonly query: string; readonly team: MemoryTeamFilter; readonly duplicatesOnly: boolean };

// The notes behind each list, in the order "Edit as text" offers them.
export const NOTES_OF: Readonly<Record<MemoryListKind, readonly MemoryFileName[]>> = { words: ['jargon'], people: ['team', 'people'] };

const rowsIn = (notes: MemoryNotes, note: MemoryFileName): readonly MemoryListRow[] => {
  const seen = new Map<string, number>();
  return parseMemoryDoc(notes[note]).lines.flatMap((line, index) => {
    if (line.kind !== 'entry') return [];
    const content = `${line.entry.term}\u0000${line.entry.detail}`;
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return [{ key: `${note}\u0000${String(occurrence)}\u0000${content}`, note, line: index, entry: line.entry, isTeam: note === 'team' }];
  });
};

export const rowsOf = (notes: MemoryNotes, list: MemoryListKind): readonly MemoryListRow[] =>
  NOTES_OF[list].flatMap((note) => rowsIn(notes, note)).sort((a, b) => a.entry.term.localeCompare(b.entry.term, undefined, { sensitivity: 'base' }));

// Lines the list cannot show, which Marcel still reads: the one reason to open a note as text.
export const unreadLines = (notes: MemoryNotes, list: MemoryListKind): number =>
  NOTES_OF[list].reduce((count, note) => count + parseMemoryDoc(notes[note]).lines.filter((line) => line.kind === 'raw').length, 0);

// For the filter: "jose" should find José.
const folded = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// For spotting the same entry twice: accents, case, spaces and punctuation all ignored, so
// "Tin Yi" and "TinYi" meet. Looser than the notes' own rule on purpose, because a duplicate
// is only pointed out, never refused.
const looseKey = (text: string): string => folded(text).replace(/[^\p{L}\p{N}]/gu, '');

const twinKeys = (rows: readonly MemoryListRow[]): ReadonlySet<string> => {
  const counts = new Map<string, number>();
  for (const key of rows.map((row) => looseKey(row.entry.term)).filter((key) => key.length > 0)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
};

// One name per duplicated entry, the first as the list orders them.
export const duplicateTerms = (rows: readonly MemoryListRow[]): readonly string[] => {
  const twins = twinKeys(rows);
  const named = new Map<string, string>();
  for (const row of rows) {
    const key = looseKey(row.entry.term);
    if (twins.has(key) && !named.has(key)) named.set(key, row.entry.term);
  }
  return [...named.values()];
};

const matches = (row: MemoryListRow, query: string): boolean => {
  const wanted = folded(query.trim());
  return folded(row.entry.term).includes(wanted) || folded(row.entry.detail).includes(wanted);
};

const inTeamFilter = (row: MemoryListRow, team: MemoryTeamFilter): boolean => team === 'all' || row.isTeam === (team === 'team');

export const visibleRows = (rows: readonly MemoryListRow[], filter: MemoryListFilter): readonly MemoryListRow[] => {
  const twins = twinKeys(rows);
  return rows.filter((row) => matches(row, filter.query) && inTeamFilter(row, filter.team) && (!filter.duplicatesOnly || twins.has(looseKey(row.entry.term))));
};

// Why a draft cannot be saved yet, or nothing. The same rules main applies, checked here so
// the answer arrives as the user presses Enter; main still decides. An edit keeping its word
// never collides, not even with a twin already in the list.
export const draftProblem = (rows: readonly MemoryListRow[], draft: MemoryEntry, editing?: MemoryListRow): string | undefined => {
  const wanted = wantedEntry(draft.term, draft.detail);
  if (!wanted.ok) return wanted.error.message;
  const term = wanted.value.term;
  if (editing !== undefined && normaliseTerm(editing.entry.term) === normaliseTerm(term)) return undefined;
  return rows.some((row) => normaliseTerm(row.entry.term) === normaliseTerm(term)) ? `“${term}” is already in this list.` : undefined;
};

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

// What the list costs on every message, roughly: a token is about four characters.
export const approximateTokens = (notes: MemoryNotes, list: MemoryListKind): number => Math.round(NOTES_OF[list].reduce((count, note) => count + notes[note].length, 0) / 40) * 10;
