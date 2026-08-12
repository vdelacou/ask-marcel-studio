import { describe, expect, test } from 'bun:test';
import { answerFor, choicesFor, draftFor, emptyDrafts, forgetDraft, termFor, termTextFor, withChoice, withOwnWords, withTerm } from './memory-review.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';

const candidate = (over: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  id: 'c1',
  kind: 'jargon',
  term: 'SFoA',
  suggestedDetail: 'the Salesforce org that runs after-sales',
  alternatives: ['Salesforce for Aftersales'],
  conversationId: 'conv-1',
  quote: 'It is built on Salesforce technology and goes by the name SFoA.',
  createdAt: '2026-07-21T10:00:00.000Z',
  ...over,
});

describe('the wordings offered for one thing noticed', () => {
  test('the suggestion comes first, then the other phrasings', () => {
    expect(choicesFor(candidate())).toEqual(['the Salesforce org that runs after-sales', 'Salesforce for Aftersales']);
  });

  test('a phrasing repeating the suggestion is offered once', () => {
    expect(choicesFor(candidate({ alternatives: ['the Salesforce org that runs after-sales'] }))).toEqual(['the Salesforce org that runs after-sales']);
  });

  test('empty wordings are not offered at all', () => {
    expect(choicesFor(candidate({ suggestedDetail: '', alternatives: ['', 'Salesforce for Aftersales'] }))).toEqual(['Salesforce for Aftersales']);
  });
});

describe('what a row starts out saying', () => {
  test('a row nobody has touched offers the suggestion, already picked', () => {
    expect(draftFor(emptyDrafts, candidate())).toEqual({ selected: 'the Salesforce org that runs after-sales', own: '' });
  });

  test('a row with nothing to suggest starts on the user’s own words', () => {
    expect(draftFor(emptyDrafts, candidate({ suggestedDetail: '', alternatives: [] }))).toEqual({ own: '' });
  });

  test('each row keeps its own answer, and one row does not disturb another', () => {
    const drafts = withOwnWords(emptyDrafts, candidate(), 'Salesforce for Aftersales, the after-sales org');

    expect(draftFor(drafts, candidate())).toEqual({ own: 'Salesforce for Aftersales, the after-sales org' });
    expect(draftFor(drafts, candidate({ id: 'c2' }))).toEqual({ selected: 'the Salesforce org that runs after-sales', own: '' });
  });
});

describe('choosing between a wording and your own', () => {
  test('picking a wording answers with it', () => {
    const drafts = withChoice(emptyDrafts, candidate(), 'Salesforce for Aftersales');

    expect(answerFor(draftFor(drafts, candidate()))).toBe('Salesforce for Aftersales');
  });

  test('writing your own answers with that instead, whatever was picked before', () => {
    const drafts = withOwnWords(withChoice(emptyDrafts, candidate(), 'Salesforce for Aftersales'), candidate(), 'the after-sales org');

    expect(answerFor(draftFor(drafts, candidate()))).toBe('the after-sales org');
  });

  test('going back to a wording leaves what was typed alone, ready to return to', () => {
    const drafts = withChoice(withOwnWords(emptyDrafts, candidate(), 'the after-sales org'), candidate(), 'Salesforce for Aftersales');

    expect(draftFor(drafts, candidate())).toEqual({ selected: 'Salesforce for Aftersales', own: 'the after-sales org' });
  });
});

describe('what counts as an answer', () => {
  test('an answer is trimmed before it is remembered', () => {
    expect(answerFor({ own: '  the after-sales org  ' })).toBe('the after-sales org');
  });

  test('nothing typed is no answer at all, so the row cannot be remembered', () => {
    expect(answerFor({ own: '' })).toBeUndefined();
  });

  test('whitespace is not an answer either', () => {
    expect(answerFor({ own: '   ' })).toBeUndefined();
  });
});

describe('correcting the word itself', () => {
  test('a row nobody has touched shows the word Marcel heard', () => {
    expect(termTextFor(emptyDrafts, candidate())).toBe('SFoA');
    expect(termFor(emptyDrafts, candidate())).toBe('SFoA');
  });

  test('a word typed over shows what was typed', () => {
    const drafts = withTerm(emptyDrafts, candidate(), 'SFOA');

    expect(termTextFor(drafts, candidate())).toBe('SFOA');
    expect(termFor(drafts, candidate())).toBe('SFOA');
  });

  test('a word cleared to type a new one stays cleared while they type', () => {
    const drafts = withTerm(emptyDrafts, candidate(), '');

    expect(termTextFor(drafts, candidate())).toBe('');
  });

  test('correcting the word leaves the wording picked for it alone', () => {
    const drafts = withTerm(withChoice(emptyDrafts, candidate(), 'Salesforce for Aftersales'), candidate(), 'SFOA');

    expect(answerFor(draftFor(drafts, candidate()))).toBe('Salesforce for Aftersales');
    expect(termFor(drafts, candidate())).toBe('SFOA');
  });

  test('the word is trimmed, so a stray space does not become part of it', () => {
    const drafts = withTerm(emptyDrafts, candidate(), '  SFOA  ');

    expect(termFor(drafts, candidate())).toBe('SFOA');
  });

  test('a word rubbed out entirely is no word, so the row cannot be remembered', () => {
    const drafts = withTerm(emptyDrafts, candidate(), '   ');

    expect(termFor(drafts, candidate())).toBeUndefined();
  });
});

describe('a row that has been dealt with', () => {
  test('its half-written answer goes with it', () => {
    const drafts = withOwnWords(emptyDrafts, candidate(), 'the after-sales org');

    expect(forgetDraft(drafts, 'c1')).toEqual(emptyDrafts);
  });

  test('forgetting a row nobody touched changes nothing', () => {
    expect(forgetDraft(emptyDrafts, 'c1')).toEqual(emptyDrafts);
  });
});
