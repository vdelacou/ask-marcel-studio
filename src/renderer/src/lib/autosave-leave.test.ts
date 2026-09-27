/*
 * What closing a document's editor saves, what the page's draft becomes then, and when the draft
 * is due to be saved at all: never from an editor that changed nothing, never while everything on
 * Memory is being cleared, and never an older draft after the newer text. All text is invented.
 */
import { describe, expect, test } from 'bun:test';
import { draftAfterSave, draftOnLeave, isDueForSave, reportedText, shouldSaveEditorOnClose } from './autosave.ts';

describe('what an editor saves as it closes', () => {
  // The file as the page last read it; the editor shows it with its own bullets.
  const onDisk = { text: '- Short sentences.\n', revision: 2, isLoaded: true, isPaused: false };

  // The editor also settles a moment after it opens, with one more blank line at the end.
  test('an editor closed without a change saves nothing, though it writes the text its own way', () => {
    expect(shouldSaveEditorOnClose({ text: '* Short sentences.\n\n', opened: '* Short sentences.\n', revision: 2 }, onDisk)).toBe(false);
  });

  test('an editor closed with words typed in it saves them', () => {
    expect(shouldSaveEditorOnClose({ text: '* Short sentences. First names.\n', opened: '* Short sentences.\n', revision: 2 }, onDisk)).toBe(true);
  });

  test('nothing is saved as an editor closes while everything on Memory is being cleared', () => {
    expect(shouldSaveEditorOnClose({ text: '* Short sentences. First names.\n', opened: '* Short sentences.\n', revision: 2 }, { ...onDisk, isPaused: true })).toBe(false);
  });

  test('an editor replaced by a newer version is still never saved over it', () => {
    expect(shouldSaveEditorOnClose({ text: '* Long sentences, then more.\n', opened: '* Long sentences.\n', revision: 1 }, onDisk)).toBe(false);
  });
});

describe('the draft an editor leaves behind', () => {
  test('an editor closed before it reported its last words leaves nothing older to be saved after them', () => {
    const draft = draftOnLeave('I run IT', 'I run IT for the region', true);

    expect(draftAfterSave(draft, 'I run IT for the region', 'I run IT for the region\n')).toBe('I run IT for the region\n');
  });

  test('an editor whose words are not saved leaves the page’s draft as it was', () => {
    expect(draftOnLeave('the newer text', 'the older text', false)).toBe('the newer text');
  });
});

describe('saving once the typing pauses', () => {
  const typed = { draft: 'I run IT for the region', stored: 'I run IT', status: 'idle', isLoaded: true, isPaused: false } as const;

  test('words typed and not yet saved are due to be saved', () => {
    expect(isDueForSave(typed)).toBe(true);
    expect(isDueForSave({ ...typed, status: 'saved' })).toBe(true);
  });

  test('nothing is saved while everything on Memory is being cleared', () => {
    expect(isDueForSave({ ...typed, isPaused: true })).toBe(false);
  });

  test('nothing is saved before the file is read, when nothing changed, while a save is on its way, or after one failed', () => {
    expect(isDueForSave({ ...typed, isLoaded: false })).toBe(false);
    expect(isDueForSave({ ...typed, stored: typed.draft })).toBe(false);
    expect(isDueForSave({ ...typed, status: 'saving' })).toBe(false);
    expect(isDueForSave({ ...typed, status: 'error' })).toBe(false);
  });
});

describe('what an editor reports as its text', () => {
  test('a document only looked at is reported as the text it was given, so it is never saved back in the editor’s style', () => {
    expect(reportedText('* Short sentences.\n\n', '* Short sentences.\n', '- Short sentences.\n')).toBe('- Short sentences.\n');
  });

  test('a document typed into is reported as the editor writes it', () => {
    expect(reportedText('* Short sentences. First names.\n', '* Short sentences.\n', '- Short sentences.\n')).toBe('* Short sentences. First names.\n');
  });

  test('nothing is reported before the editor has finished opening', () => {
    expect(reportedText('* Short sentences.\n', undefined, '- Short sentences.\n')).toBeUndefined();
  });
});
