import { describe, expect, test } from 'bun:test';
import { cosineSimilarity, topBySimilarity } from './vector-math.ts';

describe('measuring how close two embeddings are', () => {
  test('the same direction scores one', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
  });

  test('opposite directions score minus one', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  test('perpendicular vectors are unrelated', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test('a zero vector has no direction, so it scores zero rather than dividing by zero', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  test('vectors of different lengths are not comparable', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('picking the memories closest to a query', () => {
  const items = [
    { item: 'about the budget', embedding: [1, 0, 0] },
    { item: 'about a person', embedding: [0, 1, 0] },
    { item: 'also the budget', embedding: [0.9, 0.1, 0] },
  ];

  test('the closest come back first', () => {
    const found = topBySimilarity([1, 0, 0], items, 2);

    expect(found.map((f) => f.item)).toEqual(['about the budget', 'also the budget']);
  });

  test('only as many as asked for', () => {
    expect(topBySimilarity([1, 0, 0], items, 1)).toHaveLength(1);
  });

  test('a threshold drops the barely-related, so a search is an answer not a dump', () => {
    const found = topBySimilarity([1, 0, 0], items, 10, 0.5);

    expect(found.map((f) => f.item)).toEqual(['about the budget', 'also the budget']);
  });

  test('asking for none, or fewer than none, returns none', () => {
    expect(topBySimilarity([1, 0, 0], items, 0)).toEqual([]);
    expect(topBySimilarity([1, 0, 0], items, -3)).toEqual([]);
  });

  test('nothing to search returns nothing', () => {
    expect(topBySimilarity([1, 0, 0], [], 5)).toEqual([]);
  });

  test('a hit sitting exactly on the threshold is kept, not dropped', () => {
    const item = { item: 'edge', embedding: [1, 1] };
    // Use the score this exact pair produces as the threshold, so the comparison is >= not >.
    const score = cosineSimilarity([1, 0], item.embedding);

    expect(topBySimilarity([1, 0], [item], 5, score).map((f) => f.item)).toEqual(['edge']);
  });
});
