import { describe, expect, test } from 'bun:test';
import { unescapeAmpersands } from './markdown-ampersands.ts';

describe('reversing the rich editor serialiser escaping bare ampersands on save', () => {
  test('abbreviations the serialiser escaped come back with a plain ampersand', () => {
    expect(unescapeAmpersands('Confirm the R\\&D and Q\\&A budgets')).toBe('Confirm the R&D and Q&A budgets');
  });

  test('an ampersand before a numeric character reference marker is also unescaped', () => {
    expect(unescapeAmpersands('Price was 5\\&#36;')).toBe('Price was 5&#36;');
  });

  test('an ampersand the serialiser left alone, followed by a space, is untouched', () => {
    expect(unescapeAmpersands('Ben & Jerry')).toBe('Ben & Jerry');
  });

  test('a backslash escaping something other than an ampersand is left alone', () => {
    expect(unescapeAmpersands('\\*not italic\\* but R\\&D is')).toBe('\\*not italic\\* but R&D is');
  });
});
