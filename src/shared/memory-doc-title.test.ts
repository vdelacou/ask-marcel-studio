/*
 * Which heading on a note's top line is an old title and which is the user's. Notes once carried
 * a title the app wrote, and a note still carrying one loses it on the way in; a heading of the
 * user's that reaches the top line, once every entry above it is removed, is theirs and stays.
 * All data here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { mergeMemoryEntries, parseMemoryDoc, serialiseMemoryDoc } from './memory-doc.ts';
import { applyMemoryEntryEdit } from './memory-entry-edit.ts';
import { buildGlossaryBlocks } from './memory-glossary.ts';
import { unwrap } from './result.ts';

const NOTE = '- **QW**: quick win\n# Finance\n- **OTIF**: on time, in full\n';

// The note as the list writes it once the entry above the heading is removed.
const afterRemovingTheTop = (): string => {
  const docs = { jargon: parseMemoryDoc(NOTE), team: parseMemoryDoc(''), people: parseMemoryDoc('') };
  return serialiseMemoryDoc(unwrap(applyMemoryEntryEdit(docs, { action: 'remove', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } })).jargon);
};

describe('a heading of the user’s that reaches the top line', () => {
  test('stays when the entry above it is removed, and through the next change', () => {
    const next = mergeMemoryEntries(parseMemoryDoc(afterRemovingTheTop()), [{ term: 'CAB', detail: 'change advisory board' }]);

    expect(serialiseMemoryDoc(next)).toBe('# Finance\n- **OTIF**: on time, in full\n- **CAB**: change advisory board\n');
  });

  test('reaches Marcel with the entries under it', () => {
    expect(buildGlossaryBlocks({ jargon: afterRemovingTheTop(), team: '', people: '' })).toEqual([
      '## Words this user’s organisation uses\n# Finance\n- **OTIF**: on time, in full',
    ]);
  });

  test('stays when it only looks like an old title', () => {
    expect(serialiseMemoryDoc(parseMemoryDoc('# Words we use at the plant\n- **QW**: quick win\n'))).toBe('# Words we use at the plant\n- **QW**: quick win\n');
  });
});

describe('a title the app wrote before notes stopped carrying one', () => {
  test.each(['Words we use', 'My team', 'People I work with'])('"%s" on the top line is dropped', (title) => {
    expect(serialiseMemoryDoc(parseMemoryDoc(`\n# ${title}\n\n- **QW**: quick win\n`))).toBe('- **QW**: quick win\n');
  });

  test('further down the note is a heading of the user’s, and stays', () => {
    const note = '- **Mei Chen**: finance lead\n# My team\n- **Ben**: design\n';

    expect(serialiseMemoryDoc(parseMemoryDoc(note))).toBe(note);
  });

  test('never reaches Marcel', () => {
    expect(buildGlossaryBlocks({ jargon: '', team: '# My team\n\n- **Mei Chen**: finance lead', people: '' })).toEqual(['## Their team\n- **Mei Chen**: finance lead']);
  });
});
