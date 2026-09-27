/*
 * Skipping a suggestion is an answer too: the word is never asked about again, and the word is
 * all that is kept of it. All data here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { EMPTY_MEMORY_QUEUE, addCandidates, parseMemoryCandidate, parseMemoryQueue, serialiseMemoryQueue, skipCandidate, unskipCandidate } from './memory-queue-doc.ts';
import type { MemoryCandidate, MemoryQueueDoc } from './memory-queue-doc.ts';
import { unwrap } from './result.ts';

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

const queued = (...items: MemoryCandidate[]): MemoryQueueDoc => addCandidates(EMPTY_MEMORY_QUEUE, items, new Set());

describe('skipping a suggestion', () => {
  test('skipping takes the suggestion out of the queue and keeps its word, in lower case', () => {
    const otif = candidate({ id: 'c2', term: 'OTIF' });

    expect(skipCandidate(queued(candidate(), otif), 'c1')).toEqual({ items: [otif], skipped: ['qw'] });
  });

  test('a skipped word is never queued again, whatever its capitals', () => {
    const skipped = skipCandidate(queued(candidate()), 'c1');

    expect(addCandidates(skipped, [candidate({ id: 'c2', term: 'Qw' })], new Set()).items).toEqual([]);
  });

  test('skipping the same word twice keeps it once', () => {
    const again = skipCandidate({ items: [candidate({ id: 'c2', term: 'qw ' })], skipped: ['qw'] }, 'c2');

    expect(again).toEqual({ items: [], skipped: ['qw'] });
  });

  test('skipping something no longer waiting changes nothing', () => {
    const doc = queued(candidate());

    expect(skipCandidate(doc, 'gone')).toEqual(doc);
  });
});

describe('undoing a skip', () => {
  test('undoing a skip puts the suggestion back and frees its word, and only its word', () => {
    const otif = candidate({ id: 'c2', term: 'OTIF' });

    expect(unskipCandidate(skipCandidate(queued(candidate()), 'c1'), candidate())).toEqual({ items: [candidate()], skipped: [] });
    expect(unskipCandidate({ items: [otif], skipped: ['qw', 'po'] }, candidate())).toEqual({ items: [otif, candidate()], skipped: ['po'] });
  });

  test('undoing a skip for a suggestion still waiting does not queue it twice', () => {
    expect(unskipCandidate(queued(candidate()), candidate()).items).toEqual([candidate()]);
  });
});

describe('what the queue file keeps', () => {
  test('skipped words survive a round trip; an older file without any reads as none skipped, and one that is not text is dropped', () => {
    const skipped = skipCandidate(queued(candidate(), candidate({ id: 'c2', term: 'OTIF' })), 'c1');

    expect(unwrap(parseMemoryQueue(JSON.parse(serialiseMemoryQueue(skipped))))).toEqual(skipped);
    expect(unwrap(parseMemoryQueue({ items: [] })).skipped).toEqual([]);
    expect(unwrap(parseMemoryQueue({ items: [], skipped: ['QW', 3, '  ', null] })).skipped).toEqual(['qw']);
    expect(unwrap(parseMemoryQueue({ items: [], skipped: 'QW' })).skipped).toEqual([]);
  });

  test('a suggestion coming back from the window passes the same checks as one read from disk', () => {
    expect(parseMemoryCandidate(candidate())).toEqual(candidate());
    expect(parseMemoryCandidate(candidate({ kind: 'secrets' as never }))).toBeUndefined();
    expect(parseMemoryCandidate('QW')).toBeUndefined();
  });
});
