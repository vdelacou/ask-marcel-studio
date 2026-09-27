/*
 * What a note keeps however it was hand-edited: a heading typed in the middle hides nothing, and
 * a word written with an asterisk does not grow more of them on every save. All data here is
 * invented.
 */
import { describe, expect, test } from 'bun:test';
import { listEntries, mergeMemoryEntries, parseMemoryDoc, serialiseMemoryDoc } from './memory-doc.ts';
import { buildGlossaryBlocks } from './memory-glossary.ts';

const NOTE = '- **QW**: quick win\n# Later\n- **OTIF**: on time, in full\n';

describe('a heading typed in the middle of a note', () => {
  test('hides nothing, and survives the next change', () => {
    const changed = mergeMemoryEntries(parseMemoryDoc(NOTE), [{ term: 'CAB', detail: 'change advisory board' }]);

    expect(listEntries(changed)).toEqual([
      { term: 'QW', detail: 'quick win' },
      { term: 'OTIF', detail: 'on time, in full' },
      { term: 'CAB', detail: 'change advisory board' },
    ]);
    expect(serialiseMemoryDoc(changed)).toBe(`${NOTE}- **CAB**: change advisory board\n`);
  });

  test('Marcel still reads every entry of the note', () => {
    expect(buildGlossaryBlocks({ jargon: NOTE, team: '', people: '' })).toEqual([`## Words this user’s organisation uses\n${NOTE.trim()}`]);
  });

  test('a title at the top, under blank lines, is still dropped', () => {
    expect(serialiseMemoryDoc(parseMemoryDoc('\n  \n# Words\n- **QW**: quick win'))).toBe('- **QW**: quick win\n');
  });
});

describe('a word written with an asterisk in it', () => {
  test('is kept exactly as it was written, however often the note is saved', () => {
    const note = '- **Q*W**: quick win\n- **OTIF**: on time, in full\n';
    const once = serialiseMemoryDoc(parseMemoryDoc(note));

    expect(once).toBe(note);
    expect(serialiseMemoryDoc(parseMemoryDoc(once))).toBe(note);
  });

  test('is not taken for an entry, while an asterisk in a meaning still is', () => {
    expect(listEntries(parseMemoryDoc('- **Q*W**: quick win\n- QW: a *quick* win'))).toEqual([{ term: 'QW', detail: 'a *quick* win' }]);
  });
});
