/*
 * Where the keyboard focus goes on a memory list once a change lands.
 *
 * The entry a change was about keeps the focus wherever it now stands: added, saved, moved to
 * the other people note, put back by Undo, or left as it was by a cancel. A deleted row hands
 * it to the row that slides into its place, or the new last row, as a card answered on the
 * review list does. With no row to focus (the list emptied, the filter hides the entry, a new
 * entry was cancelled) the list's Add button takes it, so the focus never falls off the page.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { cardToFocus } from './review-focus.ts';
import type { MemoryListRow } from './memory-list.ts';
import type { MemoryEntryEdit } from '../../../shared/memory-entry-edit.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type ListFocusTarget =
  | { readonly kind: 'entry'; readonly note: MemoryFileName; readonly term: string }
  // Where the deleted row stood, among the rows on screen.
  | { readonly kind: 'place'; readonly index: number }
  | { readonly kind: 'add' };

// The entry a change leaves on the list: a person moved across, under the note they went to.
export const landingOf = (change: MemoryEntryEdit): ListFocusTarget => ({ kind: 'entry', note: change.action === 'move' ? change.to : change.note, term: change.entry.term });

// Main stores a word as one trimmed line, so a word typed with a space or a line break around
// it is looked for the way it was stored.
const loose = (term: string): string => term.replace(/\s+/g, ' ').trim();

// The row on screen to focus, by its place among the rows shown; nothing for the Add button.
export const rowToFocus = (target: ListFocusTarget, rows: readonly MemoryListRow[]): number | undefined => {
  if (target.kind === 'add') return undefined;
  if (target.kind === 'place') return cardToFocus(target.index, 0, rows.length);
  const index = rows.findIndex((row) => row.note === target.note && loose(row.entry.term) === loose(target.term));
  return index === -1 ? undefined : index;
};
