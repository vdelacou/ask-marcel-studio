/*
 * What the saving line says once the user types again after an error. All text is invented.
 */
import { describe, expect, test } from 'bun:test';
import { isClearedByTyping } from './autosave.ts';

describe('an error on a document typed into again', () => {
  test('a failed save stops being shown once the user types, since the next pause tries again', () => {
    expect(isClearedByTyping('error', true)).toBe(true);
  });

  test('a document that could not be read keeps saying so, since nothing typed over it is saved', () => {
    expect(isClearedByTyping('error', false)).toBe(false);
  });

  test('a line that is not an error is left as it is', () => {
    expect(isClearedByTyping('saved', true)).toBe(false);
    expect(isClearedByTyping('saving', true)).toBe(false);
  });
});
