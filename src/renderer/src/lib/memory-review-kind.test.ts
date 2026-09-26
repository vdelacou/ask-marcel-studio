/*
 * Which list a suggestion is filed under, as the review row holds it: Marcel's guess until the
 * user picks another, and kept while they reword the meaning or correct the word. All data here
 * is invented.
 */
import { describe, expect, test } from 'bun:test';
import { draftFor, emptyDrafts, kindFor, termTextFor, withChoice, withKind, withOwnWords, withTerm } from './memory-review.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';

const candidate = (over: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  id: 'c1',
  kind: 'jargon',
  term: 'Mei Chen',
  suggestedDetail: 'finance lead',
  alternatives: ['head of finance'],
  conversationId: 'conv-1',
  quote: 'Mei Chen approved the budget',
  createdAt: '2026-09-26T10:00:00.000Z',
  ...over,
});

describe('the list a suggestion is filed under', () => {
  test('a row files under the list Marcel suggested until another is picked', () => {
    expect(kindFor(emptyDrafts, candidate())).toBe('jargon');
    expect(kindFor(withKind(emptyDrafts, candidate(), 'team'), candidate())).toBe('team');
  });

  test('rewording the meaning keeps the list picked and the word corrected', () => {
    const drafts = withOwnWords(withTerm(withKind(emptyDrafts, candidate(), 'team'), candidate(), 'Mei CHEN'), candidate(), 'signs off budget changes');

    expect(kindFor(drafts, candidate())).toBe('team');
    expect(termTextFor(drafts, candidate())).toBe('Mei CHEN');
    expect(draftFor(drafts, candidate()).own).toBe('signs off budget changes');
  });

  test('picking a list keeps the wording and the word', () => {
    const drafts = withKind(withTerm(withChoice(emptyDrafts, candidate(), 'head of finance'), candidate(), 'Mei'), candidate(), 'people');

    expect(draftFor(drafts, candidate())).toEqual({ selected: 'head of finance', own: '', term: 'Mei', kind: 'people' });
  });
});
