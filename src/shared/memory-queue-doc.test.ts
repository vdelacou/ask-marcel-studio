import { describe, expect, test } from 'bun:test';
import { EMPTY_MEMORY_QUEUE, addCandidates, findCandidate, parseMemoryQueue, removeCandidate, serialiseMemoryQueue } from './memory-queue-doc.ts';
import type { MemoryCandidate } from './memory-queue-doc.ts';
import { unwrap } from './result.ts';

const candidate = (over: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  id: 'c1',
  kind: 'jargon',
  term: 'QW',
  suggestedDetail: 'quick win',
  alternatives: ['quality watch'],
  conversationId: 'conv-1',
  quote: 'another QW for the quarter',
  createdAt: '2026-07-21T10:00:00.000Z',
  ...over,
});

describe('queuing something to ask the user about', () => {
  test('a candidate is added', () => {
    expect(addCandidates(EMPTY_MEMORY_QUEUE, [candidate()], new Set()).items).toHaveLength(1);
  });

  test('a term the user has already been asked about is not asked again', () => {
    const queued = addCandidates(EMPTY_MEMORY_QUEUE, [candidate()], new Set());

    expect(addCandidates(queued, [candidate({ id: 'c2' })], new Set()).items).toHaveLength(1);
  });

  test('a term the app already knows is not asked about at all', () => {
    expect(addCandidates(EMPTY_MEMORY_QUEUE, [candidate()], new Set(['qw'])).items).toEqual([]);
  });

  test('the same term twice in one batch is queued once', () => {
    expect(addCandidates(EMPTY_MEMORY_QUEUE, [candidate(), candidate({ id: 'c2' })], new Set()).items).toHaveLength(1);
  });

  test('capitals do not make it a different term', () => {
    expect(addCandidates(EMPTY_MEMORY_QUEUE, [candidate({ term: 'qw' })], new Set(['QW'])).items).toEqual([]);
  });

  test('a candidate with no term at all is dropped', () => {
    expect(addCandidates(EMPTY_MEMORY_QUEUE, [candidate({ term: '  ' })], new Set()).items).toEqual([]);
  });

  test('answering one removes it', () => {
    const queued = addCandidates(EMPTY_MEMORY_QUEUE, [candidate()], new Set());

    expect(removeCandidate(queued, 'c1').items).toEqual([]);
  });

  test('one can be found by its id, and a missing one is simply not there', () => {
    const queued = addCandidates(EMPTY_MEMORY_QUEUE, [candidate()], new Set());

    expect(findCandidate(queued, 'c1')?.term).toBe('QW');
    expect(findCandidate(queued, 'nope')).toBeUndefined();
  });
});

describe('reading the pending questions back', () => {
  test('a queue round trips', () => {
    const queued = addCandidates(EMPTY_MEMORY_QUEUE, [candidate({ enrichment: 'Anna Meyer, product' })], new Set());

    expect(unwrap(parseMemoryQueue(JSON.parse(serialiseMemoryQueue(queued))))).toEqual(queued);
  });

  test('a candidate this cannot read is dropped, and the rest survive', () => {
    // It is a question the app wanted to ask, not something the user would miss.
    const parsed = unwrap(parseMemoryQueue({ items: [{ id: 'x' }, candidate(), 'junk'] }));

    expect(parsed.items).toHaveLength(1);
  });

  test('a candidate for a note that does not exist is dropped', () => {
    expect(unwrap(parseMemoryQueue({ items: [candidate({ kind: 'nonsense' as never })] })).items).toEqual([]);
  });

  test('a file that is not a queue is refused', () => {
    expect(parseMemoryQueue({ nope: true }).ok).toBe(false);
    expect(parseMemoryQueue('nope').ok).toBe(false);
  });

  test('an empty queue is a valid queue', () => {
    expect(unwrap(parseMemoryQueue({ items: [] }))).toEqual(EMPTY_MEMORY_QUEUE);
  });
});

describe('surviving a file that is not what it should be', () => {
  test('a queue that is not an object is refused, however it is wrong', () => {
    expect(parseMemoryQueue(null).ok).toBe(false);
    expect(parseMemoryQueue([candidate()]).ok).toBe(false);
    expect(parseMemoryQueue(42).ok).toBe(false);
  });

  test('a candidate that is not an object is dropped, however it is wrong', () => {
    expect(unwrap(parseMemoryQueue({ items: [null, [candidate()], 42, candidate()] })).items).toHaveLength(1);
  });

  test('a field of the wrong type becomes empty rather than reaching the screen as a number', () => {
    const parsed = unwrap(parseMemoryQueue({ items: [{ id: 'c1', kind: 'jargon', term: 'QW', suggestedDetail: 42, quote: null, conversationId: [], createdAt: {} }] }));

    expect(parsed.items[0]).toMatchObject({ suggestedDetail: '', quote: '', conversationId: '', createdAt: '' });
  });

  test('alternatives that are not text are dropped, and the rest survive', () => {
    const parsed = unwrap(parseMemoryQueue({ items: [{ ...candidate(), alternatives: ['kept', 42, null] }] }));

    expect(parsed.items[0]?.alternatives).toEqual(['kept']);
  });

  test('alternatives that are not a list at all become none', () => {
    expect(unwrap(parseMemoryQueue({ items: [{ ...candidate(), alternatives: 'nope' }] })).items[0]?.alternatives).toEqual([]);
  });

  test('an enrichment that is not text is left off rather than stringified', () => {
    const parsed = unwrap(parseMemoryQueue({ items: [{ ...candidate(), enrichment: 42 }] }));

    expect(parsed.items[0]).not.toHaveProperty('enrichment');
  });

  test('a candidate with no id is dropped: nothing could answer it', () => {
    expect(unwrap(parseMemoryQueue({ items: [{ ...candidate(), id: '' }] })).items).toEqual([]);
  });
});
