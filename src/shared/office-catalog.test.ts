import { describe, expect, test } from 'bun:test';
import { commandCategoryIndex, parseOfficeCatalog } from './office-catalog.ts';
import { unwrap } from './result.ts';

const catalog = (...commands: readonly unknown[]): unknown => ({ version: '2.2.0', commands });

describe('reading what the Microsoft 365 CLI can do', () => {
  test('commands are grouped under their category', () => {
    const parsed = unwrap(
      parseOfficeCatalog(catalog({ name: 'list-mail-messages', category: 'mail', summary: 'List messages.' }, { name: 'search-mail-messages', category: 'mail' }))
    );

    expect(parsed).toEqual([
      {
        name: 'mail',
        commands: [
          { name: 'list-mail-messages', summary: 'List messages.' },
          { name: 'search-mail-messages', summary: '' },
        ],
      },
    ]);
  });

  test('categories come in the order the settings screen wants, not the order the file lists them', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'a', category: 'notes' }, { name: 'b', category: 'mail' }, { name: 'c', category: 'calendar' })));

    expect(parsed.map((c) => c.name)).toEqual(['mail', 'calendar', 'notes']);
  });

  test('a category the CLI added later appears after the known ones', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'a', category: 'bookings' }, { name: 'b', category: 'mail' })));

    expect(parsed.map((c) => c.name)).toEqual(['mail', 'bookings']);
  });

  test('two unknown categories are ordered alphabetically between themselves', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'a', category: 'viva' }, { name: 'b', category: 'bookings' })));

    expect(parsed.map((c) => c.name)).toEqual(['bookings', 'viva']);
  });

  test('a command with no name is skipped rather than half listed', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ category: 'mail' }, { name: 'kept', category: 'mail' })));

    expect(parsed[0]?.commands.map((c) => c.name)).toEqual(['kept']);
  });

  test('a command with no category is skipped: nothing could switch it on or off', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'orphan' }, { name: 'kept', category: 'mail' })));

    expect(parsed).toHaveLength(1);
  });

  test('a command that is not an object at all is skipped', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog('junk', { name: 'kept', category: 'mail' })));

    expect(parsed[0]?.commands).toHaveLength(1);
  });

  test('a file that is not the command list is refused rather than read as empty', () => {
    // Silently reporting no commands would look like a CLI with nothing in it.
    const parsed = parseOfficeCatalog({ nope: true });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('unreadable');
  });

  test('a file that is not an object at all is refused', () => {
    expect(parseOfficeCatalog('nope').ok).toBe(false);
  });

  test('an empty command list parses to no categories', () => {
    expect(unwrap(parseOfficeCatalog(catalog()))).toEqual([]);
  });
});

describe('looking a command up by name', () => {
  test('every command maps back to its category', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'list-mail-messages', category: 'mail' }, { name: 'list-events', category: 'calendar' })));

    const index = commandCategoryIndex(parsed);

    expect(index.get('list-mail-messages')).toBe('mail');
    expect(index.get('list-events')).toBe('calendar');
  });

  test('a command the CLI does not have is not in the index', () => {
    expect(commandCategoryIndex([]).get('anything')).toBeUndefined();
  });
});

describe('the order the settings screen shows categories in', () => {
  test('every known category has its place, and the order is the one a person expects', () => {
    // Each name here is a separate promise about where that row appears. Asserting the
    // whole order at once is what stops one of them going missing unnoticed.
    const everything = catalog(
      { name: 'a', category: 'notes' },
      { name: 'b', category: 'tasks' },
      { name: 'c', category: 'teams' },
      { name: 'd', category: 'chats' },
      { name: 'e', category: 'user' },
      { name: 'f', category: 'excel' },
      { name: 'g', category: 'sharepoint' },
      { name: 'h', category: 'drive' },
      { name: 'i', category: 'calendar' },
      { name: 'j', category: 'mail' },
      { name: 'k', category: 'meta' }
    );

    expect(unwrap(parseOfficeCatalog(everything)).map((c) => c.name)).toEqual([
      'mail',
      'calendar',
      'drive',
      'sharepoint',
      'excel',
      'user',
      'chats',
      'teams',
      'tasks',
      'notes',
      'meta',
    ]);
  });

  test('an unknown category sorts after every known one, not among them', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'a', category: 'bookings' }, { name: 'b', category: 'meta' }, { name: 'c', category: 'mail' })));

    expect(parsed.map((c) => c.name)).toEqual(['mail', 'meta', 'bookings']);
  });

  test('a command with an empty category name is skipped rather than grouped under nothing', () => {
    expect(unwrap(parseOfficeCatalog(catalog({ name: 'a', category: '' }, { name: 'b', category: 'mail' })))).toHaveLength(1);
  });

  test('a command with an empty name is skipped', () => {
    expect(unwrap(parseOfficeCatalog(catalog({ name: '', category: 'mail' }, { name: 'b', category: 'mail' })))[0]?.commands).toHaveLength(1);
  });

  test('a summary that is not a string becomes an empty one rather than leaking a number', () => {
    expect(unwrap(parseOfficeCatalog(catalog({ name: 'a', category: 'mail', summary: 42 })))[0]?.commands[0]?.summary).toBe('');
  });

  test('a file whose commands field is not a list is refused', () => {
    expect(parseOfficeCatalog({ commands: 'nope' }).ok).toBe(false);
  });

  test('the refusal says what was wrong, so a bad upgrade is diagnosable', () => {
    const parsed = parseOfficeCatalog({});

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toContain('Microsoft 365 command list');
  });

  test('commands keep the order the file listed them in within a category', () => {
    const parsed = unwrap(parseOfficeCatalog(catalog({ name: 'second', category: 'mail' }, { name: 'first', category: 'mail' })));

    expect(parsed[0]?.commands.map((c) => c.name)).toEqual(['second', 'first']);
  });
});
