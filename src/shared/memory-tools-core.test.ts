import { describe, expect, test } from 'bun:test';
import { addConfirmation, clampSearchLimit, DEFAULT_SEARCH_LIMIT, emptySearchRefusal, forgetConfirmation, forgetNotFound, renderSearchResult } from './memory-tools-core.ts';
import type { MemoryItem } from './memory-store.ts';

const item = (id: string, text: string): MemoryItem => ({ id, text, source: 'user', createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' });

describe('what a memory search hands the model', () => {
  test('hits come back numbered, with their ids, so one can be quoted or forgotten', () => {
    const rendered = renderSearchResult([item('a1', 'UCR means Unique Customer Reference'), item('b2', 'Weilai is my CTO')]);

    expect(rendered).toBe(['Relevant memories:', '1. [a1] UCR means Unique Customer Reference', '2. [b2] Weilai is my CTO'].join('\n'));
  });

  test('nothing found tells the model to say so, not to guess', () => {
    expect(renderSearchResult([])).toContain('Say so plainly rather than guessing');
  });

  test('an empty search is refused with what it needs', () => {
    expect(emptySearchRefusal()).toContain('a term, a person, or a topic');
  });
});

describe('adding and forgetting, on the user’s say-so', () => {
  test('an addition is confirmed and points at the Memory page', () => {
    expect(addConfirmation('I prefer short answers')).toContain('Memory page');
  });

  test('forgetting a memory that is not there says to search first', () => {
    expect(forgetNotFound('x9')).toContain('Search first');
  });

  test('a forget is confirmed with what was forgotten', () => {
    expect(forgetConfirmation('an old fact')).toContain('an old fact');
  });
});

describe('how many hits to return', () => {
  test('no count given falls to the default', () => {
    expect(clampSearchLimit(undefined)).toBe(DEFAULT_SEARCH_LIMIT);
  });

  test('a huge count is capped, a tiny one floored', () => {
    expect(clampSearchLimit(1000)).toBe(20);
    expect(clampSearchLimit(0)).toBe(1);
  });

  test('a fractional count is floored to a whole number of hits', () => {
    expect(clampSearchLimit(3.9)).toBe(3);
  });

  test('a nonsense count falls to the default rather than breaking the search', () => {
    expect(clampSearchLimit(Number.NaN)).toBe(DEFAULT_SEARCH_LIMIT);
    expect(clampSearchLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SEARCH_LIMIT);
  });

  test('a real number is used, not silently replaced by the default', () => {
    expect(clampSearchLimit(7)).toBe(7);
  });
});
