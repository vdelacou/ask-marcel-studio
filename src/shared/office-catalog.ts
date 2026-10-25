/*
 * The Microsoft 365 CLI's own list of what it can do, grouped for the settings screen
 * and indexed for the guard.
 *
 * The CLI ships a commands.json describing every command and its category. Reading it
 * rather than hardcoding a list means the settings screen and the guard stay correct
 * across CLI upgrades, and a category added upstream appears on its own.
 *
 * The file is untrusted input like any other: it is JSON on disk that a bad upgrade
 * could half-write, so a malformed entry is skipped rather than crashing the launch.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type OfficeCommandInfo = { readonly name: string; readonly summary: string };
export type OfficeCategory = { readonly name: string; readonly commands: readonly OfficeCommandInfo[] };
export type OfficeCatalogError = { readonly kind: 'unreadable'; readonly message: string };

// The order the settings screen shows them in: what an office employee thinks about
// first, not what the CLI happens to list first. Anything not named here follows,
// alphabetically, so a new category from a CLI upgrade still appears.
const DISPLAY_ORDER = ['mail', 'calendar', 'drive', 'sharepoint', 'excel', 'user', 'chats', 'teams', 'tasks', 'notes', 'meta'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const rank = (name: string): number => {
  const at = DISPLAY_ORDER.indexOf(name);
  return at === -1 ? DISPLAY_ORDER.length : at;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

// A command with no name or no category cannot be shown or checked against a policy, so it
// is skipped rather than half-listed.
const readCommand = (entry: unknown): { readonly category: string; readonly info: OfficeCommandInfo } | undefined => {
  if (!isRecord(entry)) return undefined;
  const { name, category, summary } = entry;
  if (!isNonEmptyString(name) || !isNonEmptyString(category)) return undefined;
  return { category, info: { name, summary: typeof summary === 'string' ? summary : '' } };
};

export const parseOfficeCatalog = (raw: unknown): Result<readonly OfficeCategory[], OfficeCatalogError> => {
  if (!isRecord(raw) || !Array.isArray(raw['commands'])) return err({ kind: 'unreadable', message: 'the Microsoft 365 command list is not in the expected shape' });

  const grouped = new Map<string, OfficeCommandInfo[]>();
  for (const entry of raw['commands']) {
    const command = readCommand(entry);
    if (command === undefined) continue;
    const commands = grouped.get(command.category) ?? [];
    commands.push(command.info);
    grouped.set(command.category, commands);
  }

  const categories = [...grouped.entries()].map(([name, commands]) => ({ name, commands }));
  return ok([...categories].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)));
};

// command name to category, which is all the guard needs to decide whether a command
// the agent typed belongs to a category the user switched off.
export const commandCategoryIndex = (categories: readonly OfficeCategory[]): ReadonlyMap<string, string> => {
  const index = new Map<string, string>();
  for (const category of categories) {
    for (const command of category.commands) index.set(command.name, category.name);
  }
  return index;
};
