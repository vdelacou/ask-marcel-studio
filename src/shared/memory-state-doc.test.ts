import { describe, expect, test } from 'bun:test';
import { EMPTY_MEMORY_STATE, markExtracted, needsExtraction, parseMemoryState, readSoFar, serialiseMemoryState } from './memory-state-doc.ts';
import { unwrap } from './result.ts';

describe('remembering how far the app has read', () => {
  test('a conversation nobody has read yet has something to read', () => {
    expect(needsExtraction(EMPTY_MEMORY_STATE, 'conv-1', 4)).toBe(true);
  });

  test('a conversation with nothing new since last time is left alone', () => {
    // Re-reading it would cost the user tokens for nothing.
    const state = markExtracted(EMPTY_MEMORY_STATE, 'conv-1', 4, 'now');

    expect(needsExtraction(state, 'conv-1', 4)).toBe(false);
  });

  test('a conversation that carried on is read again', () => {
    const state = markExtracted(EMPTY_MEMORY_STATE, 'conv-1', 4, 'now');

    expect(needsExtraction(state, 'conv-1', 6)).toBe(true);
  });

  test('reading one conversation says nothing about another', () => {
    const state = markExtracted(EMPTY_MEMORY_STATE, 'conv-1', 4, 'now');

    expect(needsExtraction(state, 'conv-2', 1)).toBe(true);
  });

  test('the app knows where to start reading from', () => {
    const state = markExtracted(EMPTY_MEMORY_STATE, 'conv-1', 4, 'now');

    expect(readSoFar(state, 'conv-1')).toBe(4);
    expect(readSoFar(state, 'conv-2')).toBe(0);
  });
});

describe('reading the progress file back', () => {
  test('it round trips', () => {
    const state = markExtracted(EMPTY_MEMORY_STATE, 'conv-1', 4, '2026-07-21T10:00:00.000Z');

    expect(unwrap(parseMemoryState(JSON.parse(serialiseMemoryState(state))))).toEqual(state);
  });

  test('an entry this cannot read is dropped, which only means that one is read again', () => {
    const parsed = unwrap(parseMemoryState({ conversations: { a: { extractedMessageCount: 'four' }, b: { extractedMessageCount: 2 } } }));

    expect(Object.keys(parsed.conversations)).toEqual(['b']);
  });

  test('a missing timestamp does not lose the count', () => {
    expect(unwrap(parseMemoryState({ conversations: { a: { extractedMessageCount: 2 } } })).conversations['a']).toEqual({ extractedMessageCount: 2, extractedAt: '' });
  });

  test('a file that is not the progress file is refused', () => {
    expect(parseMemoryState({}).ok).toBe(false);
    expect(parseMemoryState('nope').ok).toBe(false);
  });
});
