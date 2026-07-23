/*
 * A cheat-sheet of the office CLI's most-used commands, generated from the CLI's own
 * catalog.
 *
 * The archive is full of the agent guessing flags: `--folder`, `--search`,
 * `--body-content-path`, none of which exist, each one a failed call and a retry. The CLI
 * ships a full description of every command; this pulls the dozen or so that come up most
 * into one short file the agent is told to read before its first use of a command.
 *
 * Generated, not written: when the CLI is upgraded and a flag is renamed, the sheet is
 * rewritten at launch and the new name is what the agent sees. A command the catalog no
 * longer has is named as missing rather than dropped silently, so a rename is visible.
 *
 * Pure: it parses the same untrusted JSON the catalog parser does, and writing the file
 * is the composition root's job.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

// The commands the archive shows the agent reaching for. Resolved by exact name; a
// `download-file`/`convert-drive-item` style family is covered by listing the members
// that exist.
export const CHEATSHEET_COMMANDS: readonly string[] = [
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
];

type CatalogOption = {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
  readonly argumentHint?: string;
};

type CatalogCommand = {
  readonly name: string;
  readonly summary: string;
  readonly options: readonly CatalogOption[];
  readonly example?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOr = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

// The first sentence of a description, so a sheet of twenty commands does not become a
// wall of OData prose.
const firstSentence = (text: string): string => {
  const trimmed = text.trim();
  const stop = trimmed.search(/[.!?](\s|$)/);
  return stop === -1 ? trimmed : trimmed.slice(0, stop + 1);
};

const parseOption = (raw: unknown): CatalogOption | undefined => {
  if (!isRecord(raw) || typeof raw['name'] !== 'string') return undefined;
  return {
    name: raw['name'],
    required: raw['required'] === true,
    description: stringOr(raw['description']),
    ...(typeof raw['argumentHint'] === 'string' ? { argumentHint: raw['argumentHint'] } : {}),
  };
};

const parseCommand = (raw: unknown): CatalogCommand | undefined => {
  if (!isRecord(raw) || typeof raw['name'] !== 'string') return undefined;
  return {
    name: raw['name'],
    summary: stringOr(raw['summary']),
    options: Array.isArray(raw['options']) ? raw['options'].map(parseOption).filter((option): option is CatalogOption => option !== undefined) : [],
    ...(typeof raw['example'] === 'string' ? { example: raw['example'] } : {}),
  };
};

const optionLine = (option: CatalogOption): string => {
  const requirement = option.required ? 'required' : 'optional';
  const value = option.argumentHint === undefined ? '' : ` ${option.argumentHint}`;
  const description = firstSentence(option.description);
  const gloss = description.length > 0 ? ` — ${description}` : '';
  return `- \`--${option.name}${value}\` (${requirement})${gloss}`;
};

const commandBlock = (command: CatalogCommand): string =>
  [`## ${command.name}`, firstSentence(command.summary), ...command.options.map(optionLine), ...(command.example === undefined ? [] : ['', `Example: \`${command.example}\``])]
    .filter((line) => line.length > 0)
    .join('\n');

// Parses the catalog and emits the sheet, or an error if the catalog itself is unreadable
// (a broken file should be visible, not a half sheet).
export const generateCliCheatsheet = (rawCatalog: unknown): Result<string, string> => {
  if (!isRecord(rawCatalog) || !Array.isArray(rawCatalog['commands'])) return err('the CLI catalog is not in the shape this expects');

  const byName = new Map<string, CatalogCommand>();
  for (const raw of rawCatalog['commands']) {
    const command = parseCommand(raw);
    if (command !== undefined) byName.set(command.name, command);
  }

  const version = stringOr(rawCatalog['version'], 'unknown');
  const present = CHEATSHEET_COMMANDS.map((name) => byName.get(name)).filter((command): command is CatalogCommand => command !== undefined);
  const missing = CHEATSHEET_COMMANDS.filter((name) => !byName.has(name));

  const header = [
    `# ask-marcel-office cheat-sheet (CLI ${version})`,
    '',
    'Generated from the CLI, do not edit. These are the exact flags for the commands you use most.',
    'Consult this before the first use of a command; never guess a flag. Anything not here: run',
    '`ask-marcel-office docs <command>` first.',
    '',
    '',
  ].join('\n');

  const body = present.map(commandBlock).join('\n\n');
  // Named at the bottom rather than dropped, so a CLI rename is visible instead of silent.
  const footer = missing.length === 0 ? '' : `\n\n<!-- not in this CLI version: ${missing.join(', ')} -->`;
  return ok(`${header}${body}${footer}\n`);
};
