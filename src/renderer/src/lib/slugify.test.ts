import { describe, expect, test } from 'bun:test';
import { slugify } from './slugify.ts';

describe('turning a name into the id the agent uses', () => {
  test('a two-word name becomes one dashed handle', () => {
    expect(slugify('Weekly Report')).toBe('weekly-report');
  });

  test('punctuation and exclamation are dropped, not turned into dashes each', () => {
    expect(slugify('Weekly Report!!')).toBe('weekly-report');
  });

  test('an underscore reads as a word break, like a space', () => {
    expect(slugify('daily_standup')).toBe('daily-standup');
  });

  test('accents are folded so the handle is plain ascii', () => {
    expect(slugify('Résumé Helper')).toBe('resume-helper');
  });

  test('a run of separators collapses to one dash', () => {
    expect(slugify('a  --  b')).toBe('a-b');
  });

  test('leading and trailing separators leave no stray dash', () => {
    expect(slugify('  Report  ')).toBe('report');
  });

  test('an absurdly long name is cut, and still does not end in a dash', () => {
    const slug = slugify(`${'word '.repeat(40)}end`);

    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });

  test('a name that is only punctuation has no handle at all', () => {
    expect(slugify('!!!')).toBe('');
  });
});
