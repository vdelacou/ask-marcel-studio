/*
 * Where the keyboard focus goes on a memory list once a change lands: on the entry the change
 * was about, wherever it now stands, or after a delete on the row that takes its place. All
 * words and names here are invented.
 */
import { describe, expect, test } from 'bun:test';
import { landingOf, rowToFocus } from './list-focus.ts';
import type { MemoryListRow } from './memory-list.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

const row = (note: MemoryFileName, term: string, line: number): MemoryListRow => ({
  key: `${note}\u00000\u0000${term}`,
  note,
  line,
  entry: { term, detail: `about ${term}` },
  isTeam: note === 'team',
});

const words = [row('jargon', 'CAB', 0), row('jargon', 'OTIF', 1), row('jargon', 'QW', 2)];

describe('the focus once a change lands on a list', () => {
  test('an entry added or saved keeps the focus where it now stands in the list', () => {
    expect(rowToFocus(landingOf({ action: 'add', note: 'jargon', entry: { term: 'OTIF', detail: 'on time, in full' } }), words)).toBe(1);
    expect(rowToFocus(landingOf({ action: 'update', note: 'jargon', previous: { term: 'QW', detail: 'quick win' }, entry: { term: 'QW', detail: 'a quick win' } }), words)).toBe(2);
  });

  test('a word typed with spaces around it is found as the note stores it', () => {
    expect(rowToFocus(landingOf({ action: 'add', note: 'jargon', entry: { term: ' OTIF\n', detail: 'on time, in full' } }), words)).toBe(1);
  });

  test('a person moved across keeps the focus under the list they went to', () => {
    const people = [row('team', 'Mei Chen', 0), row('people', 'Mei Chen', 0)];

    expect(rowToFocus(landingOf({ action: 'move', note: 'team', to: 'people', entry: { term: 'Mei Chen', detail: 'finance lead' } }), people)).toBe(1);
  });

  test('an entry put back by Undo takes the focus again', () => {
    expect(rowToFocus(landingOf({ action: 'restore', note: 'jargon', entry: { term: 'CAB', detail: 'change advisory board' }, at: 0 }), words)).toBe(0);
  });

  test('a deleted row hands the focus to the row that slides into its place, or to the new last row', () => {
    expect(rowToFocus({ kind: 'place', index: 1 }, words)).toBe(1);
    expect(rowToFocus({ kind: 'place', index: 3 }, words)).toBe(2);
  });

  test('with no row to focus the Add button takes it: an emptied list, an entry the filter hides, a new entry cancelled', () => {
    expect(rowToFocus({ kind: 'place', index: 0 }, [])).toBeUndefined();
    expect(rowToFocus({ kind: 'entry', note: 'jargon', term: 'ETD' }, words)).toBeUndefined();
    expect(rowToFocus({ kind: 'add' }, words)).toBeUndefined();
  });
});
