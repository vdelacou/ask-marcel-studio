/*
 * The reader prompts, held against the CLI that is actually installed.
 *
 * A prompt names its commands in prose, and prose is where a wrong name survives: the
 * doc-reader sent every local-file read to `convert-local-file`, a command the CLI does not
 * have, so each one failed and the subagent had to fish the real name out of a 33 KB help
 * listing. The doctrine tests beside each reader check wording; nothing checked the names.
 *
 * It reads the installed commands.json on purpose, not a fixture, and resolves it the way
 * the composition root does: the point is to go red on the CLI upgrade that renames a
 * command a prompt still uses. A command-shaped word is a backticked token that starts with
 * a verb the catalog's own commands start with, so the check learns new verbs from the CLI
 * rather than from a list kept here.
 */
import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { docReader } from './doc-reader.ts';
import { mailReader } from './mail-reader.ts';

type Catalog = { readonly commands: readonly { readonly name: string }[] };

const installedCommands = async (): Promise<ReadonlySet<string>> => {
  const resolveFrom = createRequire(import.meta.url);
  const catalog = (await Bun.file(join(dirname(resolveFrom.resolve('ask-marcel-office-cli/package.json')), 'dist', 'commands.json')).json()) as Catalog;
  return new Set(catalog.commands.map((command) => command.name));
};

const namedCommands = (prompt: string, verbs: ReadonlySet<string>): readonly string[] => {
  const words = [...prompt.matchAll(/`([a-z]+(?:-[a-z]+)+)/g)].map((match) => match[1] ?? '');
  return [...new Set(words.filter((word) => verbs.has(word.split('-')[0] ?? '')))];
};

describe('the reader subagents against the installed CLI', () => {
  test('the reader subagents name only CLI commands the installed CLI has', async () => {
    const commands = await installedCommands();
    const verbs = new Set([...commands].map((name) => name.split('-')[0] ?? ''));

    const unknown = [docReader, mailReader].flatMap((reader) => namedCommands(reader.prompt, verbs).filter((name) => !commands.has(name)));

    expect(unknown).toEqual([]);
  });
});
