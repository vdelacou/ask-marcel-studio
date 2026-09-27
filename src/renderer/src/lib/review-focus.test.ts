/*
 * Where the keyboard focus goes on the review list: to the neighbouring card on Up or Down, and
 * to the card that takes the answered one's place.
 */
import { describe, expect, test } from 'bun:test';
import { cardToFocus } from './review-focus.ts';

describe('which review card holds the focus', () => {
  test('moving down or up lands on the neighbouring card, and stops at either end', () => {
    expect(cardToFocus(0, 1, 3)).toBe(1);
    expect(cardToFocus(1, -1, 3)).toBe(0);
    expect(cardToFocus(2, 1, 3)).toBe(2);
    expect(cardToFocus(0, -1, 3)).toBe(0);
  });

  test('after a card is answered, the card that takes its place is next, or the new last one', () => {
    expect(cardToFocus(1, 0, 2)).toBe(1);
    expect(cardToFocus(2, 0, 2)).toBe(1);
  });

  test('with no card left, nothing is focused', () => {
    expect(cardToFocus(0, 0, 0)).toBeUndefined();
  });
});
