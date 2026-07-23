import { describe, expect, test } from 'bun:test';
import { CHEATSHEET_COMMANDS, generateCliCheatsheet } from './cli-cheatsheet.ts';

// A fixture shaped like the CLI's real commands.json, with the field mix that matters:
// required and optional flags, an argument hint, a multi-sentence description, an example.
const catalog = {
  version: '2.2.0',
  commands: [
    {
      name: 'list-mail-messages',
      category: 'mail',
      summary: 'List the most recent messages from the whole mailbox. Newest first.',
      options: [
        { name: 'top', required: false, description: 'OData $top: how many to return. Defaults to 25.' },
        { name: 'select', required: false, description: 'Comma-separated fields to include.' },
      ],
      example: 'ask-marcel-office list-mail-messages',
    },
    {
      name: 'search-mail-messages',
      category: 'mail',
      summary: 'Search the mailbox.',
      options: [{ name: 'query', required: true, argumentHint: '<value>', description: 'The KQL or free-text query to run.' }],
    },
    { name: 'unused-command', category: 'mail', summary: 'Not on the sheet.', options: [] },
  ],
};

describe('generating the flag cheat-sheet from the CLI', () => {
  test('a command on the sheet lists exactly the flags the CLI documents for it', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('## list-mail-messages');
    expect(sheet.ok && sheet.value).toContain('`--top` (optional)');
    expect(sheet.ok && sheet.value).toContain('`--select` (optional)');
  });

  test('a required flag says so, and carries its argument hint', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('`--query <value>` (required)');
  });

  test('a flag description is cut to its first sentence, so the sheet stays scannable', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('OData $top: how many to return.');
    expect(sheet.ok && sheet.value).not.toContain('Defaults to 25.');
  });

  test('an example the CLI gives is carried through', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('Example: `ask-marcel-office list-mail-messages`');
  });

  test('the sheet tells the agent to consult it before guessing', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('never guess a flag');
  });

  test('the CLI version is recorded, so a stale sheet is obvious', () => {
    expect(generateCliCheatsheet(catalog).ok && generateCliCheatsheet(catalog)).toMatchObject({ value: expect.stringContaining('CLI 2.2.0') });
  });

  test('a command the CLI no longer has is named as missing, not dropped in silence', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).toContain('get-mail-message');
    expect(sheet.ok && sheet.value).toContain('not in this CLI version');
  });

  test('a command not on the sheet is left off it, however present in the catalog', () => {
    const sheet = generateCliCheatsheet(catalog);

    expect(sheet.ok && sheet.value).not.toContain('unused-command');
  });

  test('a catalog that is not the shape expected is an error, not a half sheet', () => {
    expect(generateCliCheatsheet({ nonsense: true }).ok).toBe(false);
    expect(generateCliCheatsheet('not even an object').ok).toBe(false);
  });

  test('a command with a malformed option among good ones keeps the good ones', () => {
    const withJunk = {
      version: '2.2.0',
      commands: [{ name: 'list-mail-messages', summary: 'List mail.', options: [{ notAName: true }, { name: 'top', required: false, description: 'How many.' }] }],
    };

    const sheet = generateCliCheatsheet(withJunk);

    expect(sheet.ok && sheet.value).toContain('`--top` (optional)');
  });
});

describe('the set of commands the sheet covers', () => {
  // Pin the whole list: any name silently changed or dropped shows up here, and these
  // are the commands the agent is being taught the flags for.
  test('exactly the commands people reach for are on the sheet', () => {
    expect(CHEATSHEET_COMMANDS).toEqual([
      'my-quick-context',
      'list-mail-messages',
      'search-mail-messages',
      'get-mail-message',
      'convert-mail-to-markdown',
      'list-mail-attachments',
      'convert-mail-attachment-to-markdown',
      'search-all-files',
      'get-drive-item',
      'download-drive-item-as-markdown',
      'download-drive-item-content',
      'get-user',
      'get-user-manager',
      'list-relevant-people',
      'list-calendar-events',
      'list-calendar-view',
      'create-reply-draft',
      'create-forward-draft',
      'create-mail-draft',
      'find-mail-drafts',
      'update-mail-draft',
    ]);
  });

  test('every command on the list gets its own section when the catalog has it', () => {
    const full = { version: '2.2.0', commands: CHEATSHEET_COMMANDS.map((name) => ({ name, summary: `Does ${name}.`, options: [] })) };
    const sheet = generateCliCheatsheet(full);

    for (const name of CHEATSHEET_COMMANDS) expect(sheet.ok && sheet.value).toContain(`## ${name}`);
    expect(sheet.ok && sheet.value).not.toContain('not in this CLI version');
  });
});

describe('reading the CLI’s own descriptions carefully', () => {
  test('a description ending in a question mark stops at the question mark', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'Who are you? The rest.', options: [] }] });

    expect(sheet.ok && sheet.value).toContain('Who are you?');
    expect(sheet.ok && sheet.value).not.toContain('The rest.');
  });

  test('a description with no sentence end is kept whole', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'no full stop here', options: [] }] });

    expect(sheet.ok && sheet.value).toContain('no full stop here');
  });

  test('a summary that is not a string does not crash the sheet', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 42, options: [] }] });

    expect(sheet.ok).toBe(true);
  });

  test('a version the catalog omits reads as unknown, not as a crash', () => {
    const sheet = generateCliCheatsheet({ commands: [{ name: 'my-quick-context', summary: 'x.', options: [] }] });

    expect(sheet.ok && sheet.value).toContain('CLI unknown');
  });

  test('an option list that is not an array is treated as no options', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'x.', options: 'nope' }] });

    expect(sheet.ok && sheet.value).toContain('## my-quick-context');
  });
});

describe('the exact shape of the sheet', () => {
  test('the header tells the agent, in these words, to read it before guessing', () => {
    const sheet = generateCliCheatsheet({ version: '2.2.0', commands: [{ name: 'my-quick-context', summary: 'x.', options: [] }] });

    expect(sheet.ok && sheet.value.startsWith('# ask-marcel-office cheat-sheet (CLI 2.2.0)\n')).toBe(true);
    expect(sheet.ok && sheet.value).toContain('Generated from the CLI, do not edit.');
    expect(sheet.ok && sheet.value).toContain('Consult this before the first use of a command');
  });

  test('a required flag and an optional flag are marked differently, in full', () => {
    const sheet = generateCliCheatsheet({
      version: '1',
      commands: [
        {
          name: 'search-mail-messages',
          summary: 'Search.',
          options: [
            { name: 'query', required: true, argumentHint: '<value>', description: 'The query.' },
            { name: 'top', required: false, description: 'How many.' },
          ],
        },
      ],
    });

    expect(sheet.ok && sheet.value).toContain('- `--query <value>` (required) — The query.');
    expect(sheet.ok && sheet.value).toContain('- `--top` (optional) — How many.');
  });

  test('a flag with an empty description shows no dash, so a bare flag is not a broken line', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'x.', options: [{ name: 'json', required: false, description: '' }] }] });

    expect(sheet.ok && sheet.value).toContain('- `--json` (optional)\n');
  });

  test('the missing-commands note lists every absent command, comma-separated', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [] });

    expect(sheet.ok && sheet.value).toContain('<!-- not in this CLI version:');
    expect(sheet.ok && sheet.value).toContain('my-quick-context, list-mail-messages');
  });

  test('a sentence-ending mark mid-description still cuts at the first one', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'First! Second! Third!', options: [] }] });

    expect(sheet.ok && sheet.value).toContain('First!');
    expect(sheet.ok && sheet.value).not.toContain('Second!');
  });

  test('a command whose name field is not a string is skipped, not rendered as undefined', () => {
    const sheet = generateCliCheatsheet({
      version: '1',
      commands: [
        { name: 42, summary: 'x.', options: [] },
        { name: 'my-quick-context', summary: 'ok.', options: [] },
      ],
    });

    expect(sheet.ok && sheet.value).not.toContain('## 42');
    expect(sheet.ok && sheet.value).not.toContain('undefined');
  });
});

describe('not inventing description text', () => {
  test('a non-string summary leaves the section with no summary line, not a placeholder', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 42, options: [], example: 'run it' }] });

    // Header then straight to the example: no fabricated sentence in between.
    expect(sheet.ok && sheet.value).toContain('## my-quick-context\nExample: `run it`');
  });

  test('a summary padded with spaces is trimmed before its first sentence is taken', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: '   Discovery of the ids.   And more.', options: [] }] });

    expect(sheet.ok && sheet.value).toContain('## my-quick-context\nDiscovery of the ids.');
  });

  test('a flag whose description is not a string still lists the flag, without a gloss', () => {
    const sheet = generateCliCheatsheet({ version: '1', commands: [{ name: 'my-quick-context', summary: 'x.', options: [{ name: 'json', required: false, description: 7 }] }] });

    expect(sheet.ok && sheet.value).toContain('- `--json` (optional)\n');
  });
});
