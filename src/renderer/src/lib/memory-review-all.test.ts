/*
 * Remember all: every card taken as it stands, and the ones that cannot be taken yet left
 * waiting. All data here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { answersFor, emptyDrafts, withKind, withOwnWords, withTerm } from './memory-review.ts';
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';

const candidate = (over: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  id: 'c1',
  kind: 'jargon',
  term: 'QW',
  suggestedDetail: 'quick win',
  alternatives: [],
  conversationId: 'conv-1',
  quote: 'another QW for the quarter',
  createdAt: '2026-09-26T10:00:00.000Z',
  ...over,
});

describe('remembering every card at once', () => {
  test('remember all takes each card as it stands: its wording, its corrected word and its list', () => {
    const mei = candidate({ id: 'c2', term: 'Mei', suggestedDetail: 'finance' });
    const drafts = withKind(withTerm(withOwnWords(emptyDrafts, mei, 'finance lead for Greater China'), mei, 'Mei Chen'), mei, 'team');

    expect(answersFor(drafts, [mei])).toEqual([{ id: 'c2', detail: 'finance lead for Greater China', term: 'Mei Chen', kind: 'team' }]);
  });

  test('a card with no meaning, or with its word deleted, stays waiting', () => {
    const blank = candidate({ id: 'c1' });
    const wordless = candidate({ id: 'c2', term: 'OTIF', suggestedDetail: 'on time, in full' });
    const drafts = withTerm(withOwnWords(emptyDrafts, blank, '   '), wordless, ' ');

    expect(answersFor(drafts, [blank, wordless])).toEqual([]);
  });

  test('cards nobody touched are saved as Marcel suggested them', () => {
    const otif = candidate({ id: 'c2', term: 'OTIF', suggestedDetail: 'on time, in full' });

    expect(answersFor(emptyDrafts, [candidate(), otif])).toEqual([
      { id: 'c1', detail: 'quick win', term: 'QW', kind: 'jargon' },
      { id: 'c2', detail: 'on time, in full', term: 'OTIF', kind: 'jargon' },
    ]);
  });
});
