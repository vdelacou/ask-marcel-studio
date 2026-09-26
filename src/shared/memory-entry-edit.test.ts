/*
 * The lists on the memory page change a note one entry at a time. These pin what a change
 * may say, what arrives from the window, and what each change does to the notes. All data
 * here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { TERM_LIMIT, listEntries, parseMemoryDoc, serialiseMemoryDoc } from './memory-doc.ts';
import { applyMemoryEntryEdit, parseMemoryEntryEdit, wantedEntry } from './memory-entry-edit.ts';
import type { MemoryDocs, MemoryEditError, MemoryEntryEdit } from './memory-entry-edit.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import { ok, unwrap } from './result.ts';
import type { Result } from './result.ts';

const entry = (term: string, detail: string): { term: string; detail: string } => ({ term, detail });

const docs = (notes: Partial<Record<MemoryFileName, string>> = {}): MemoryDocs => ({
  jargon: parseMemoryDoc(notes.jargon ?? ''),
  team: parseMemoryDoc(notes.team ?? ''),
  people: parseMemoryDoc(notes.people ?? ''),
});

const noteText = (result: Result<MemoryDocs, MemoryEditError>, note: MemoryFileName): string => serialiseMemoryDoc(unwrap(result)[note]);

// A refusal of this kind, with a message to show: never blank, and naming the word when
// there is one. Plain comparisons on purpose: bun 1.4.2's toMatchObject with an asymmetric
// matcher fails on a received object it has already compared once, and these errors are
// shared constants.
const refusedAs = (result: Result<unknown, MemoryEditError>, kind: MemoryEditError['kind'], naming = ''): void => {
  const error = result.ok ? undefined : result.error;
  expect(error?.kind).toBe(kind);
  expect(error?.message).toContain(naming);
  expect(error?.message.length).toBeGreaterThan(0);
};

const CABS = '- **CAB**: change advisory board, meets on Tuesdays\n- **CAB**: change approval board for releases\n';

describe('what a new entry may say', () => {
  test('a word and its meaning are kept, trimmed', () => {
    expect(wantedEntry('  QW ', ' quick win ')).toEqual(ok(entry('QW', 'quick win')));
  });

  test('a blank word is refused', () => {
    refusedAs(wantedEntry('   ', 'quick win'), 'invalid');
  });

  test('a word longer than the limit is refused, and one at the limit is kept', () => {
    refusedAs(wantedEntry('Q'.repeat(TERM_LIMIT + 1), 'quick win'), 'invalid');
    expect(wantedEntry('Q'.repeat(TERM_LIMIT), 'quick win').ok).toBe(true);
  });

  test('a word with an asterisk is refused, since the note’s own bold would swallow it', () => {
    refusedAs(wantedEntry('Q*W', 'quick win'), 'invalid');
  });

  test('a meaning with nothing in it is refused', () => {
    refusedAs(wantedEntry('QW', ' \n '), 'invalid');
  });

  test('a word or meaning pasted over several lines is kept on one line', () => {
    expect(wantedEntry('Quick\nwin', 'a saving \r\n  that lands\n \nthis quarter')).toEqual(ok(entry('Quick win', 'a saving that lands this quarter')));
  });
});

describe('reading a change sent from the window', () => {
  test('an addition names its note and its entry', () => {
    expect(parseMemoryEntryEdit({ action: 'add', note: 'jargon', entry: entry(' QW ', 'quick win') })).toEqual(
      ok({ action: 'add', note: 'jargon', entry: entry('QW', 'quick win') })
    );
  });

  test('an addition is held to the rules for a new entry', () => {
    refusedAs(parseMemoryEntryEdit({ action: 'add', note: 'jargon', entry: entry('', 'quick win') }), 'invalid');
  });

  test('a removal accepts an entry saved with no meaning, so a hand-typed one stays removable', () => {
    expect(parseMemoryEntryEdit({ action: 'remove', note: 'jargon', entry: entry('QW', '') })).toEqual(ok({ action: 'remove', note: 'jargon', entry: entry('QW', '') }));
  });

  test('a change carries the entry as it was read and the entry as it should be', () => {
    expect(parseMemoryEntryEdit({ action: 'update', note: 'jargon', previous: entry('QW', ''), entry: entry('QW', ' quick win ') })).toEqual(
      ok({ action: 'update', note: 'jargon', previous: entry('QW', ''), entry: entry('QW', 'quick win') })
    );
  });

  test('a change whose new wording is blank is refused', () => {
    refusedAs(parseMemoryEntryEdit({ action: 'update', note: 'jargon', previous: entry('QW', 'quick win'), entry: entry('QW', ' ') }), 'invalid');
  });

  test('a restore needs a whole, non-negative position', () => {
    const restore = (at: unknown): Result<MemoryEntryEdit, MemoryEditError> => parseMemoryEntryEdit({ action: 'restore', note: 'jargon', entry: entry('QW', 'quick win'), at });

    refusedAs(restore(-1), 'invalid');
    refusedAs(restore(1.5), 'invalid');
    refusedAs(restore('2'), 'invalid');
    expect(restore(0)).toEqual(ok({ action: 'restore', note: 'jargon', entry: entry('QW', 'quick win'), at: 0 }));
    expect(restore(2)).toEqual(ok({ action: 'restore', note: 'jargon', entry: entry('QW', 'quick win'), at: 2 }));
  });

  test('a move needs a different note to go to', () => {
    const move = (to: unknown): Result<MemoryEntryEdit, MemoryEditError> => parseMemoryEntryEdit({ action: 'move', note: 'team', to, entry: entry('Mei Chen', 'finance lead') });

    refusedAs(move('team'), 'invalid');
    refusedAs(move('nowhere'), 'invalid');
    expect(move('people')).toEqual(ok({ action: 'move', note: 'team', to: 'people', entry: entry('Mei Chen', 'finance lead') }));
  });

  test('anything that is not one of the five changes is refused', () => {
    const qw = entry('QW', 'quick win');
    const refused = [
      null,
      'remove',
      [],
      {},
      { action: 'rename', note: 'jargon', entry: qw },
      { action: 'toString', note: 'jargon', entry: qw },
      { action: ['remove'], note: 'jargon', entry: qw },
      { action: 'remove', note: '../secrets', entry: qw },
      { action: 'remove', note: 'jargon' },
      { action: 'remove', note: 'jargon', entry: [] },
      { action: 'remove', note: 'jargon', entry: entry('', 'quick win') },
      { action: 'remove', note: 'jargon', entry: { term: 'QW', detail: 3 } },
      { action: 'remove', note: 'jargon', entry: { term: 3, detail: 'quick win' } },
      { action: 'remove', note: 'jargon', entry: { term: ['QW'], detail: 'quick win' } },
      { action: 'add', note: 'jargon', entry: { term: 'QW' } },
      { action: 'add', note: 'jargon', entry: { detail: 'quick win' } },
      { action: 'update', note: 'jargon', entry: qw },
    ];

    for (const raw of refused) refusedAs(parseMemoryEntryEdit(raw), 'invalid');
  });
});

describe('applying a change to the notes', () => {
  test('an addition lands at the end of its note', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**: quick win\n' }), { action: 'add', note: 'jargon', entry: entry('OTIF', 'on time, in full') });

    expect(noteText(next, 'jargon')).toBe('- **QW**: quick win\n- **OTIF**: on time, in full\n');
  });

  test('an addition for a word already there is refused, whatever its case or spacing', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **Quick  Win**: a saving\n' }), { action: 'add', note: 'jargon', entry: entry('quick win', 'something else') });

    refusedAs(next, 'duplicate', 'quick win');
  });

  test('a removal takes out exactly that entry and leaves the lines it cannot read', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: 'Things finance says:\n- **QW**: quick win\n- **OTIF**: on time, in full\n' }), {
      action: 'remove',
      note: 'jargon',
      entry: entry('QW', 'quick win'),
    });

    expect(noteText(next, 'jargon')).toBe('Things finance says:\n- **OTIF**: on time, in full\n');
  });

  test('of two entries for the same word, a removal takes the one whose meaning matches', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: CABS }), { action: 'remove', note: 'jargon', entry: entry('CAB', 'change approval board for releases') });

    expect(noteText(next, 'jargon')).toBe('- **CAB**: change advisory board, meets on Tuesdays\n');
  });

  test('of two entries with no meaning yet, a removal takes the one whose word matches', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**:\n- **PO**:\n' }), { action: 'remove', note: 'jargon', entry: entry('PO', '') });

    expect(noteText(next, 'jargon')).toBe('- **QW**: \n');
  });

  test('a restore puts the entry back on the line it was taken from', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**: quick win\n- **PO**: purchase order\n' }), {
      action: 'restore',
      note: 'jargon',
      entry: entry('OTIF', 'on time, in full'),
      at: 1,
    });

    expect(noteText(next, 'jargon')).toBe('- **QW**: quick win\n- **OTIF**: on time, in full\n- **PO**: purchase order\n');
  });

  test('a restore past the end of a shorter note lands at the end', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**: quick win\n' }), { action: 'restore', note: 'jargon', entry: entry('OTIF', 'on time, in full'), at: 99 });

    expect(noteText(next, 'jargon')).toBe('- **QW**: quick win\n- **OTIF**: on time, in full\n');
  });

  test('a restore brings a word back even while its twin is still there', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **CAB**: change advisory board, meets on Tuesdays\n' }), {
      action: 'restore',
      note: 'jargon',
      entry: entry('CAB', 'change approval board for releases'),
      at: 1,
    });

    expect(noteText(next, 'jargon')).toBe(CABS);
  });

  test('a change rewrites the entry in place', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**: quick win\n- **PO**: purchase order\n' }), {
      action: 'update',
      note: 'jargon',
      previous: entry('QW', 'quick win'),
      entry: entry('QW', 'a saving inside the quarter'),
    });

    expect(noteText(next, 'jargon')).toBe('- **QW**: a saving inside the quarter\n- **PO**: purchase order\n');
  });

  test('a change that keeps its word never collides with its own twin', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: CABS }), {
      action: 'update',
      note: 'jargon',
      previous: entry('CAB', 'change approval board for releases'),
      entry: entry('cab', 'the release board'),
    });

    expect(noteText(next, 'jargon')).toBe('- **CAB**: change advisory board, meets on Tuesdays\n- **cab**: the release board\n');
  });

  test('a change that renames onto another word is refused', () => {
    const next = applyMemoryEntryEdit(docs({ jargon: '- **QW**: quick win\n- **PO**: purchase order\n' }), {
      action: 'update',
      note: 'jargon',
      previous: entry('PO', 'purchase order'),
      entry: entry('qw', 'a purchase order'),
    });

    refusedAs(next, 'duplicate', 'qw');
  });

  test('a move takes the person out of one note and adds them to the other', () => {
    const next = applyMemoryEntryEdit(docs({ team: '- **Mei Chen**: finance lead\n', people: '- **Hannah Weiss**: audit partner\n' }), {
      action: 'move',
      note: 'team',
      to: 'people',
      entry: entry('Mei Chen', 'finance lead'),
    });

    expect(listEntries(unwrap(next).team)).toEqual([]);
    expect(listEntries(unwrap(next).people)).toEqual([entry('Hannah Weiss', 'audit partner'), entry('Mei Chen', 'finance lead')]);
  });

  test('a move onto someone already in the other note is refused', () => {
    const next = applyMemoryEntryEdit(docs({ team: '- **Mei Chen**: finance lead\n', people: '- **mei chen**: finance, Greater China\n' }), {
      action: 'move',
      note: 'team',
      to: 'people',
      entry: entry('Mei Chen', 'finance lead'),
    });

    refusedAs(next, 'duplicate', 'Mei Chen');
  });

  test('an entry that changed since the window read it is refused as changed, not overwritten', () => {
    const now = docs({ jargon: '- **QW**: quick win, as finance says it\n', team: '- **Mei Chen**: finance lead for Greater China\n' });
    const asRead = entry('QW', 'quick win');

    refusedAs(applyMemoryEntryEdit(now, { action: 'remove', note: 'jargon', entry: asRead }), 'not-found');
    refusedAs(applyMemoryEntryEdit(now, { action: 'update', note: 'jargon', previous: asRead, entry: entry('QW', 'a saving') }), 'not-found');
    refusedAs(applyMemoryEntryEdit(now, { action: 'move', note: 'team', to: 'people', entry: entry('Mei Chen', 'finance lead') }), 'not-found');
  });
});
