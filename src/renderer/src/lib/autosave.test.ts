/*
 * What a document saved as it is typed keeps once a save lands: the saved text, unless more
 * was typed while the save was on its way. All text here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { draftAfterSave, shouldSaveOnLeave } from './autosave.ts';

describe('the text a document keeps once a save lands', () => {
  test('a save that lands while nothing new was typed leaves the text as it was saved', () => {
    expect(draftAfterSave('I run IT for the region', 'I run IT for the region', 'I run IT for the region\n')).toBe('I run IT for the region\n');
  });

  test('anything typed while a save was in progress is kept, so it gets saved next', () => {
    expect(draftAfterSave('I run IT for the region, and', 'I run IT for the region', 'I run IT for the region\n')).toBe('I run IT for the region, and');
  });
});

describe('what an editor holds as it closes', () => {
  const current = { text: 'I run IT for the region', revision: 2, isLoaded: true };

  test('an editor closing with words not yet saved has them saved', () => {
    expect(shouldSaveOnLeave({ text: 'I run IT for the region, and', revision: 2 }, current)).toBe(true);
  });

  test('an editor replaced by a newer version, a rebuild or the first read, is never saved over it', () => {
    expect(shouldSaveOnLeave({ text: 'the text before the rebuild', revision: 1 }, current)).toBe(false);
    expect(shouldSaveOnLeave({ text: '', revision: 0 }, { ...current, revision: 1 })).toBe(false);
  });

  test('nothing is saved before the file has been read, or when nothing changed', () => {
    expect(shouldSaveOnLeave({ text: 'typed before the read', revision: 2 }, { ...current, isLoaded: false })).toBe(false);
    expect(shouldSaveOnLeave({ text: 'I run IT for the region', revision: 2 }, current)).toBe(false);
  });
});
