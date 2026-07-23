import { describe, expect, test } from 'bun:test';
import { categoryLabel, categoryRows, summaryFirstSentence } from './office-categories.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';

const catalog: readonly OfficeCategory[] = [
  { name: 'mail', commands: [{ name: 'list-mail-messages', summary: 'List messages in a folder. Supports paging and filters.' }] },
  { name: 'calendar', commands: [{ name: 'list-events', summary: 'List events.' }] },
  {
    name: 'meta',
    commands: [
      { name: 'convert-local-file-to-markdown', summary: 'Read a local file.' },
      { name: 'microsoft-search-query', summary: 'Search across everything.' },
      { name: 'my-quick-context', summary: 'Who the user is.' },
      { name: 'scopes-check', summary: 'Decode the cached token.' },
    ],
  },
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

  test('the markdown backticks the CLI writes for the model are dropped', () => {
    expect(summaryFirstSentence('The local sibling of `extract-drive-item-images`.')).toBe('The local sibling of extract-drive-item-images.');
  });

  test('an empty summary stays empty', () => {
    expect(summaryFirstSentence('')).toBe('');
  });

  test('a first sentence longer than the panel can show is cut', () => {
    expect(summaryFirstSentence(`${'a'.repeat(300)}.`)).toHaveLength(180);
  });

  test('the cut lands between words, never inside one', () => {
    const cut = summaryFirstSentence(`${'situation '.repeat(30)}end.`);

    expect(cut.endsWith('situation…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(180);
  });
});

describe('building the rows for the settings toggles', () => {
  test('every category is a row, in the catalog order', () => {
    expect(categoryRows(catalog, undefined).map((r) => r.label)).toEqual(['Email', 'Calendar', 'Local files', 'Search', 'Account']);
  });

  test('with nothing switched off everything is on', () => {
    expect(categoryRows(catalog, undefined).every((r) => r.isEnabled)).toBe(true);
  });

  test('a switched-off category shows as off', () => {
    const rows = categoryRows(catalog, { disabledCategories: ['calendar'] });

    expect(rows.find((r) => r.policyName === 'calendar')?.isEnabled).toBe(false);
    expect(rows.find((r) => r.policyName === 'mail')?.isEnabled).toBe(true);
  });

  test('every meta group is locked on, so the always-on category cannot be switched off even in three pieces', () => {
    const rows = categoryRows(catalog, { disabledCategories: ['meta'] });
    const metaRows = rows.filter((r) => r.policyName === 'meta');

    expect(metaRows.length).toBeGreaterThan(1);
    expect(metaRows.every((r) => r.isLocked && r.isEnabled)).toBe(true);
  });

  test('the meta category shows as groups a person understands, each toggling the one meta policy', () => {
    const rows = categoryRows(catalog, undefined);

    expect(rows.filter((r) => r.policyName === 'meta').map((r) => r.label)).toEqual(['Local files', 'Search', 'Account']);
  });

  test('a meta command the table does not place still shows, under Search and basics', () => {
    const withNew: readonly OfficeCategory[] = [{ name: 'meta', commands: [{ name: 'brand-new-meta-command', summary: 'Something new.' }] }];
    const rows = categoryRows(withNew, undefined);

    expect(rows.find((r) => r.label === 'Search and basics')?.commands.map((c) => c.name)).toEqual(['brand-new-meta-command']);
  });

  test('each row counts its commands and carries them for the expanded list', () => {
    const mail = categoryRows(catalog, undefined).find((r) => r.policyName === 'mail');

    expect(mail?.commandCount).toBe(1);
    expect(mail?.commands).toEqual([{ name: 'list-mail-messages', summary: 'List messages in a folder.' }]);
  });

  test('an empty catalog makes no rows', () => {
    expect(categoryRows([], undefined)).toEqual([]);
  });
});
