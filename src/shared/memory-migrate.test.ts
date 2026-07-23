import { describe, expect, test } from 'bun:test';
import { notesToFacts } from './memory-migrate.ts';

describe('carrying the old notes into the searchable memory', () => {
  test('a jargon entry becomes a term-and-meaning sentence', () => {
    const facts = notesToFacts({ jargon: '- **UCR**: Unique Customer Reference', team: '', people: '' });

    expect(facts).toEqual([{ text: 'UCR: Unique Customer Reference' }]);
  });

  test('entries from all three notes come across', () => {
    const facts = notesToFacts({ jargon: '- **B27**: the 2027 budget', team: '- **Weilai**: my CTO', people: '- **Rong Hu**: e-commerce lead' });

    expect(facts.map((f) => f.text)).toEqual(['B27: the 2027 budget', 'Weilai: my CTO', 'Rong Hu: e-commerce lead']);
  });

  test('a free-form line the parser could not read migrates verbatim, not dropped', () => {
    const facts = notesToFacts({ jargon: 'Some prose the user typed by hand.', team: '', people: '' });

    expect(facts).toEqual([{ text: 'Some prose the user typed by hand.' }]);
  });

  test('a heading is not a fact', () => {
    expect(notesToFacts({ jargon: '# Words we use\n- **X**: a thing', team: '', people: '' })).toEqual([{ text: 'X: a thing' }]);
  });

  test('the same fact in two notes is carried once, so a relaunch after a partial run does not double it', () => {
    const facts = notesToFacts({ jargon: '- **X**: a thing', team: '- **X**: a thing', people: '' });

    expect(facts).toEqual([{ text: 'X: a thing' }]);
  });

  test('an entry with a term but no meaning yet keeps the term', () => {
    expect(notesToFacts({ jargon: '- **Half typed**:', team: '', people: '' })).toEqual([{ text: 'Half typed' }]);
  });

  test('three empty notes are nothing to migrate', () => {
    expect(notesToFacts({ jargon: '', team: '', people: '' })).toEqual([]);
  });

  test('a blank line among entries is not carried as a fact', () => {
    expect(notesToFacts({ jargon: '- **X**: a\n\n   \n- **Y**: b', team: '', people: '' })).toEqual([{ text: 'X: a' }, { text: 'Y: b' }]);
  });

  test('the team and people notes are read too, not just jargon', () => {
    expect(notesToFacts({ jargon: '', team: '- **A**: one', people: '- **B**: two' }).map((f) => f.text)).toEqual(['A: one', 'B: two']);
  });
});
