/*
 * A question stops being one once the notes hold its word: typed in by hand, say, while the
 * suggestion was still waiting. All data here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { stillUnknown } from './memory-queue-doc.ts';
import type { MemoryCandidate } from './memory-queue-doc.ts';

const candidate = (id: string, term: string): MemoryCandidate => ({
  id,
  kind: 'jargon',
  term,
  suggestedDetail: 'a meaning',
  alternatives: [],
  conversationId: 'conv-1',
  quote: `another ${term}`,
  createdAt: '2026-09-27T10:00:00.000Z',
});

describe('the questions still worth asking', () => {
  test('a question about a word the notes now hold is no longer asked, however the word is written', () => {
    const otif = candidate('c2', 'OTIF');

    expect(stillUnknown([candidate('c1', 'QW'), otif, candidate('c3', 'Green  Lane')], new Set(['qw', ' green lane '.toUpperCase()]))).toEqual([otif]);
  });

  test('with nothing known, every question is still asked', () => {
    const waiting = [candidate('c1', 'QW'), candidate('c2', 'OTIF')];

    expect(stillUnknown(waiting, new Set())).toEqual(waiting);
  });
});
