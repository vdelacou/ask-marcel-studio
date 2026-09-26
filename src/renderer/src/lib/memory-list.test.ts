/*
 * What the memory page's lists show: which rows, in what order, which of them a filter
 * keeps, which look like the same entry twice, and whether a draft would collide with one
 * already there. All data here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { approximateTokens, draftProblem, duplicateTerms, initialsOf, rowsOf, unreadLines, visibleRows } from './memory-list.ts';
import type { MemoryListFilter, MemoryListRow } from './memory-list.ts';
import type { MemoryNotes } from '../../../shared/memory-entry-edit.ts';

const notes = (over: Partial<MemoryNotes> = {}): MemoryNotes => ({ jargon: '', team: '', people: '', ...over });

const terms = (rows: readonly MemoryListRow[]): readonly string[] => rows.map((row) => row.entry.term);

const EVERYTHING: MemoryListFilter = { query: '', team: 'all', duplicatesOnly: false };

describe('the rows of a list', () => {
  test('the words list is one row per entry, A to Z', () => {
    expect(rowsOf(notes({ jargon: '- **QW**: quick win\n' }), 'words')).toEqual([
      { key: 'jargon\u00000\u0000QW\u0000quick win', note: 'jargon', line: 0, entry: { term: 'QW', detail: 'quick win' }, isTeam: false },
    ]);
    expect(terms(rowsOf(notes({ jargon: '- **QW**: quick win\n- **CAB**: change advisory board\n- **otif**: on time, in full\n' }), 'words'))).toEqual(['CAB', 'otif', 'QW']);
  });

  test('the people list combines My team and the others, and marks who is on the team', () => {
    const both = notes({
      jargon: '- **QW**: quick win\n',
      team: '- **Mei Chen**: finance lead\n',
      people: '- **Hannah Weiss**: audit partner\n- **Aiko Tanaka**: ERP programme\n',
    });

    expect(rowsOf(both, 'people').map((row) => [row.entry.term, row.note, row.isTeam])).toEqual([
      ['Aiko Tanaka', 'people', false],
      ['Hannah Weiss', 'people', false],
      ['Mei Chen', 'team', true],
    ]);
    expect(terms(rowsOf(both, 'words'))).toEqual(['QW']);
  });

  test('two identical entries in one note still get separate row keys, and a row keeps its key when another line goes', () => {
    const rows = rowsOf(notes({ jargon: '- **QW**: quick win\n- **QW**: quick win\n' }), 'words');
    const before = rowsOf(notes({ jargon: '- **CAB**: advisory board\n- **QW**: quick win\n' }), 'words');
    const after = rowsOf(notes({ jargon: '- **QW**: quick win\n' }), 'words');

    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
    expect(after[0]?.key).toBe(before[1]?.key);
  });

  test('lines that are not entries are counted, not shown', () => {
    const written = notes({ jargon: '# Words we use\n\nThings finance says:\n- **QW**: quick win\n', team: 'Ask before adding anyone\n- **Mei Chen**: finance lead\n' });

    expect(terms(rowsOf(written, 'words'))).toEqual(['QW']);
    expect(unreadLines(written, 'words')).toBe(1);
    expect(unreadLines(written, 'people')).toBe(1);
  });
});

describe('finding a row', () => {
  test('the filter ignores case and accents, and a blank one keeps everything', () => {
    const rows = rowsOf(notes({ people: '- **José Álvarez**: WMS vendor\n- **Hannah Weiss**: audit partner\n' }), 'people');

    expect(terms(visibleRows(rows, { ...EVERYTHING, query: 'JOSE' }))).toEqual(['José Álvarez']);
    expect(terms(visibleRows(rows, { ...EVERYTHING, query: '   ' }))).toEqual(['Hannah Weiss', 'José Álvarez']);
  });

  test('the filter also searches the meaning', () => {
    const rows = rowsOf(notes({ jargon: '- **QW**: quick win\n- **OTIF**: on time, in full\n' }), 'words');

    expect(terms(visibleRows(rows, { ...EVERYTHING, query: 'on time' }))).toEqual(['OTIF']);
  });

  test('the My team / Others filter splits the people list', () => {
    const rows = rowsOf(notes({ team: '- **Mei Chen**: finance lead\n', people: '- **Hannah Weiss**: audit partner\n' }), 'people');

    expect(terms(visibleRows(rows, { ...EVERYTHING, team: 'team' }))).toEqual(['Mei Chen']);
    expect(terms(visibleRows(rows, { ...EVERYTHING, team: 'others' }))).toEqual(['Hannah Weiss']);
    expect(terms(visibleRows(rows, EVERYTHING))).toEqual(['Hannah Weiss', 'Mei Chen']);
  });

  test('duplicates only shows just the entries that have a twin', () => {
    const rows = rowsOf(notes({ jargon: '- **CAB**: advisory board\n- **QW**: quick win\n- **cab**: approval board\n' }), 'words');

    expect(terms(visibleRows(rows, { ...EVERYTHING, duplicatesOnly: true }))).toEqual(['CAB', 'cab']);
  });
});

describe('spotting duplicates', () => {
  test('a word written twice is flagged once', () => {
    expect(duplicateTerms(rowsOf(notes({ jargon: '- **CAB**: advisory board\n- **QW**: quick win\n- **cab**: approval board\n' }), 'words'))).toEqual(['CAB']);
  });

  test('names that differ only by an accent, case or a space are the same person, even across My team and Others', () => {
    const rows = rowsOf(
      notes({
        team: '- **José Álvarez**: WMS vendor\n- **Aiko Tanaka**: ERP programme\n- **Tin Yi**: SEA manager\n',
        people: '- **Jose Alvarez**: licences\n- **Aiko TANAKA**: PMO lead\n- **TinYi**: regional peer\n',
      }),
      'people'
    );

    expect(duplicateTerms(rows)).toEqual(['Aiko Tanaka', 'José Álvarez', 'Tin Yi']);
  });

  test('a term made only of punctuation is never paired', () => {
    expect(duplicateTerms(rowsOf(notes({ jargon: '- **—**: a dash\n- **&**: and\n- **QW**: quick win\n' }), 'words'))).toEqual([]);
  });
});

describe('checking a draft', () => {
  test('a new or edited entry whose word is already in the list is flagged; the row being edited does not count against itself', () => {
    const rows = rowsOf(notes({ jargon: '- **QW**: quick win\n- **CAB**: advisory board\n- **CAB**: approval board\n' }), 'words');
    const [firstCab, , quickWin] = rows;

    expect(draftProblem(rows, { term: 'qw', detail: 'quality watch' })).toContain('qw');
    expect(draftProblem(rows, { term: 'OTIF', detail: 'on time, in full' })).toBeUndefined();
    expect(draftProblem(rows, { term: 'QW ', detail: 'a saving inside the quarter' }, quickWin)).toBeUndefined();
    expect(draftProblem(rows, { term: 'CAB', detail: 'the board for releases' }, firstCab)).toBeUndefined();
    expect(draftProblem(rows, { term: 'cab', detail: 'a board' }, quickWin)).toContain('cab');
    expect(draftProblem(rows, { term: ' ', detail: 'a board' })?.length).toBeGreaterThan(0);
  });
});

describe('what a row and a list show besides the entries', () => {
  test('initials are the first letters of the first two words', () => {
    expect(initialsOf('Mei Chen')).toBe('MC');
    expect(initialsOf('Aiko')).toBe('A');
    expect(initialsOf('José Álvarez')).toBe('JÁ');
    expect(initialsOf('mary ann lee')).toBe('MA');
  });

  test('the token estimate is a quarter of the characters, to the nearest ten, and an empty list costs nothing', () => {
    expect(approximateTokens(notes({ jargon: 'x'.repeat(400) }), 'words')).toBe(100);
    expect(approximateTokens(notes({ jargon: 'x'.repeat(61) }), 'words')).toBe(20);
    expect(approximateTokens(notes({ team: 'x'.repeat(200), people: 'x'.repeat(200) }), 'people')).toBe(100);
    expect(approximateTokens(notes(), 'words')).toBe(0);
  });
});
