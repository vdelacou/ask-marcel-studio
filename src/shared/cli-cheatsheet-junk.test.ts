/*
 * The cheat-sheet from a catalog with junk in it (entries that are not objects, a flag with no
 * name), and the exact shape of what it writes around a command's section. All command text
 * here is invented.
 */
import { describe, expect, test } from 'bun:test';
import { generateCliCheatsheet } from './cli-cheatsheet.ts';

// One command's section: its heading down to the blank line that ends it.
const sectionOf = (sheet: string, name: string): string | undefined => sheet.split('\n\n').find((block) => block.startsWith(`## ${name}\n`));

describe('a catalog with junk in it', () => {
  test('an entry that is not an object is skipped, and the commands around it still make the sheet', () => {
    const sheet = generateCliCheatsheet({
      version: '2.8.0',
      commands: [null, 'get-mail-message', ['list-mail-messages'], { name: 'list-mail-messages', summary: 'Lists mail.', options: [] }],
    });

    expect(sheet.ok && sheet.value).toContain('## list-mail-messages');
  });

  test('a flag that is not an object, or has no name, is left off its command', () => {
    const sheet = generateCliCheatsheet({
      version: '2.8.0',
      commands: [
        {
          name: 'list-mail-messages',
          summary: 'Lists mail.',
          options: [null, { required: true, description: 'Has no name.' }, { name: 'top', required: false, description: 'How many.' }],
        },
      ],
    });

    expect(sheet.ok ? sectionOf(sheet.value, 'list-mail-messages') : undefined).toBe('## list-mail-messages\nLists mail.\n- `--top` (optional) — How many.');
  });
});

describe('the shape of the sheet', () => {
  test('the title stands on its own line, and a blank line sets off the first section', () => {
    const sheet = generateCliCheatsheet({ version: '2.8.0', commands: [{ name: 'list-mail-messages', summary: 'Lists mail.', options: [] }] });

    expect(sheet.ok && sheet.value.startsWith('# ask-marcel-office cheat-sheet (CLI 2.8.0)\n\nGenerated from the CLI')).toBe(true);
    expect(sheet.ok && sheet.value).toContain('first.\n\n## list-mail-messages\n');
  });
});
