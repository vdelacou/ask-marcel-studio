import { describe, expect, test } from 'bun:test';
import { listEntries, mergeMemoryEntries, normaliseTerm, parseMemoryDoc, serialiseMemoryDoc } from './memory-doc.ts';

const parse = (markdown: string): ReturnType<typeof parseMemoryDoc> => parseMemoryDoc(markdown, 'Glossary');

describe('reading the notes the app keeps', () => {
  test('an entry is read as a term and what it means', () => {
    expect(listEntries(parse('# Glossary\n\n- **TLA**: three-letter acronym\n'))).toEqual([{ term: 'TLA', detail: 'three-letter acronym' }]);
  });

  test('an entry written by hand without the bold is read too', () => {
    // Somebody editing this file will not reach for asterisks.
    expect(listEntries(parse('# Glossary\n\n- TLA: three-letter acronym\n'))).toEqual([{ term: 'TLA', detail: 'three-letter acronym' }]);
  });

  test('a detail containing a colon keeps all of it', () => {
    expect(listEntries(parse('- **Sync**: the 9:30 standup'))[0]?.detail).toBe('the 9:30 standup');
  });

  test('the heading is kept', () => {
    expect(parse('# Who is who\n\n- **Anna**: product').heading).toBe('Who is who');
  });

  test('a file with no heading yet gets the default one', () => {
    expect(parse('- **TLA**: acronym').heading).toBe('Glossary');
  });

  test('an empty file reads as an empty set of notes', () => {
    expect(listEntries(parse(''))).toEqual([]);
  });

  test('a line this cannot read is kept exactly as it was found', () => {
    // Silently eating a hand edit is worse than keeping a line we do not understand.
    const doc = parse('# Glossary\n\nSome note the user typed.\n- **TLA**: acronym\n');

    expect(serialiseMemoryDoc(doc)).toContain('Some note the user typed.');
  });

  test('an entry with no term is left alone rather than half read', () => {
    expect(listEntries(parse('- : nothing'))).toEqual([]);
  });
});

describe('writing the notes back out', () => {
  test('a file round trips', () => {
    const markdown = '# Glossary\n\n- **TLA**: three-letter acronym\n- **Sync**: the standup\n';

    expect(serialiseMemoryDoc(parse(markdown))).toBe(markdown);
  });

  test('a hand-written entry comes back in the app’s own form', () => {
    expect(serialiseMemoryDoc(parse('- TLA: acronym'))).toBe('# Glossary\n\n- **TLA**: acronym\n');
  });

  test('blank lines do not accumulate on every save', () => {
    const once = serialiseMemoryDoc(parse('# Glossary\n\n\n- **TLA**: acronym\n\n\n'));

    expect(serialiseMemoryDoc(parse(once))).toBe(once);
  });
});

describe('adding to the notes', () => {
  test('a new term is appended', () => {
    const doc = mergeMemoryEntries(parse('- **TLA**: acronym'), [{ term: 'Sync', detail: 'the standup' }]);

    expect(listEntries(doc).map((e) => e.term)).toEqual(['TLA', 'Sync']);
  });

  test('a term already there has its meaning replaced, not duplicated', () => {
    // The user confirmed one meaning, not two.
    const doc = mergeMemoryEntries(parse('- **TLA**: acronym'), [{ term: 'TLA', detail: 'a better description' }]);

    expect(listEntries(doc)).toEqual([{ term: 'TLA', detail: 'a better description' }]);
  });

  test('the same term in different capitals is the same term', () => {
    const doc = mergeMemoryEntries(parse('- **TLA**: acronym'), [{ term: 'tla', detail: 'updated' }]);

    expect(listEntries(doc)).toHaveLength(1);
  });

  test('adding nothing changes nothing', () => {
    const before = parse('- **TLA**: acronym');

    expect(mergeMemoryEntries(before, [])).toEqual(before);
  });

  test('adding two at once keeps both, in the order they arrived', () => {
    const doc = mergeMemoryEntries(parse(''), [
      { term: 'A', detail: 'one' },
      { term: 'B', detail: 'two' },
    ]);

    expect(listEntries(doc).map((e) => e.term)).toEqual(['A', 'B']);
  });
});

describe('deciding when two terms are the same term', () => {
  test('capitals and surrounding space do not make a new term', () => {
    expect(normaliseTerm('  Quick Win ')).toBe('quick win');
  });

  test('repeated spaces inside a term do not either', () => {
    expect(normaliseTerm('quick   win')).toBe('quick win');
  });
});

describe('being careful about what counts as an entry', () => {
  test('an indented line is not an entry: it is someone laying a note out', () => {
    expect(serialiseMemoryDoc(parse('  - **TLA**: acronym'))).toContain('  - **TLA**: acronym');
    expect(listEntries(parse('  - **TLA**: acronym'))).toEqual([]);
  });

  test('an entry written without a space after the colon still reads', () => {
    expect(listEntries(parse('- **TLA**:acronym'))).toEqual([{ term: 'TLA', detail: 'acronym' }]);
  });

  test('space around the meaning is trimmed, so a saved file does not drift', () => {
    expect(listEntries(parse('- **TLA**:    acronym   '))).toEqual([{ term: 'TLA', detail: 'acronym' }]);
  });

  test('a term of only spaces is not a term', () => {
    expect(listEntries(parse('- **   **: something'))).toEqual([]);
  });

  test('an entry with no meaning yet is kept: the user may be part way through typing', () => {
    expect(listEntries(parse('- **TLA**:'))).toEqual([{ term: 'TLA', detail: '' }]);
  });

  test('a bullet that is not an entry at all is kept verbatim', () => {
    expect(serialiseMemoryDoc(parse('- just a bullet'))).toContain('- just a bullet');
  });
});

describe('reading a file however it was saved', () => {
  test('windows line endings do not end up inside the entries', () => {
    expect(listEntries(parse('# Glossary\r\n\r\n- **TLA**: acronym\r\n'))).toEqual([{ term: 'TLA', detail: 'acronym' }]);
  });

  test('a heading that is not the first line is still the heading', () => {
    expect(parse('\n# Who is who\n\n- **Anna**: product').heading).toBe('Who is who');
  });

  test('space around the heading is trimmed, so a saved file does not drift', () => {
    expect(parse('#   Who is who   \n').heading).toBe('Who is who');
  });

  test('a plain entry written without a space after the colon still reads', () => {
    expect(listEntries(parse('- TLA:acronym'))).toEqual([{ term: 'TLA', detail: 'acronym' }]);
  });
});
