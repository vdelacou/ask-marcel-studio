import { describe, expect, test } from 'bun:test';
import { categoryLabel, categoryRows, summaryFirstSentence } from './office-categories.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';

const catalog: readonly OfficeCategory[] = [
  { name: 'mail', commands: [{ name: 'list-mail-messages', summary: 'List messages in a folder. Supports paging and filters.' }] },
  { name: 'calendar', commands: [{ name: 'list-events', summary: 'List events.' }] },
  { name: 'meta', commands: [{ name: 'scopes-check', summary: 'Decode the cached token.' }] },
];

describe('naming a category the way the person switching it off would', () => {
  test("the CLI's internal name is replaced by something readable", () => {
    expect(categoryLabel('drive')).toBe('Files (OneDrive)');
    expect(categoryLabel('user')).toBe('People directory');
  });

  test('a category we have no wording for is shown by its own name rather than hidden', () => {
    expect(categoryLabel('bookings')).toBe('bookings');
  });
});

describe('shortening a command summary to the part a person reads', () => {
  test('only the first sentence is kept', () => {
    expect(summaryFirstSentence('List messages in a folder. Supports paging and filters.')).toBe('List messages in a folder.');
  });

  test('a summary with no full stop is kept whole', () => {
    expect(summaryFirstSentence('List messages')).toBe('List messages');
  });

  test('line breaks inside a summary are flattened', () => {
    expect(summaryFirstSentence('List\n  messages')).toBe('List messages');
  });

  test('an empty summary stays empty', () => {
    expect(summaryFirstSentence('')).toBe('');
  });

  test('a first sentence longer than the row can show is cut', () => {
    expect(summaryFirstSentence(`${'a'.repeat(200)}.`)).toHaveLength(140);
  });
});

describe('building the rows for the settings toggles', () => {
  test('every category is a row, in the catalog order', () => {
    expect(categoryRows(catalog, undefined).map((r) => r.label)).toEqual(['Email', 'Calendar', 'Sign-in checks']);
  });

  test('with nothing switched off everything is on', () => {
    expect(categoryRows(catalog, undefined).every((r) => r.isEnabled)).toBe(true);
  });

  test('a switched-off category shows as off', () => {
    const rows = categoryRows(catalog, { disabledCategories: ['calendar'] });

    expect(rows.find((r) => r.name === 'calendar')?.isEnabled).toBe(false);
    expect(rows.find((r) => r.name === 'mail')?.isEnabled).toBe(true);
  });

  test('the sign-in checks row has no switch, because turning it off would blind the agent', () => {
    const rows = categoryRows(catalog, { disabledCategories: ['meta'] });

    expect(rows.find((r) => r.name === 'meta')).toMatchObject({ isLocked: true, isEnabled: true });
  });

  test('each row counts its commands and carries them for the expanded list', () => {
    const mail = categoryRows(catalog, undefined)[0];

    expect(mail?.commandCount).toBe(1);
    expect(mail?.commands).toEqual([{ name: 'list-mail-messages', summary: 'List messages in a folder.' }]);
  });

  test('an empty catalog makes no rows', () => {
    expect(categoryRows([], undefined)).toEqual([]);
  });
});
