/*
 * The Microsoft 365 half of the guard: which commands the agent may run against the
 * user's own account, and the one command it may never run at all.
 *
 * Split from bash-guard.test.ts, which covers the shell shapes, so each file stays
 * short enough to read in one sitting.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateBashCommand } from './bash-guard.ts';
import type { BashGuardPolicy } from './bash-guard.ts';

const WORKSPACE = '/Users/x/Library/Application Support/studio/workspaces/conv-1';

const CATALOG = new Map([
  ['list-mail-messages', 'mail'],
  ['list-events', 'calendar'],
  ['scopes-check', 'meta'],
]);

const policy = (disabled: readonly string[] = []): BashGuardPolicy => ({
  workspaceDir: WORKSPACE,
  disabledOfficeCategories: disabled,
  officeCommandCategories: CATALOG,
});

const allows = (command: string, disabled?: readonly string[]): boolean => evaluateBashCommand(command, policy(disabled)).allow;
const reasonFor = (command: string, disabled?: readonly string[]): string => {
  const verdict = evaluateBashCommand(command, policy(disabled));
  return verdict.allow ? '' : verdict.reason;
};

describe('signing in, which is the user’s job', () => {
  test('the agent may never run the Microsoft 365 login', () => {
    expect(allows('ask-marcel-office login')).toBe(false);
  });

  test('nor with a flag on it', () => {
    expect(allows('ask-marcel-office login --force')).toBe(false);
  });

  test('nor sign out', () => {
    expect(allows('ask-marcel-office logout')).toBe(false);
  });

  test('the reason sends the user to Settings rather than leaving the agent to retry', () => {
    expect(reasonFor('ask-marcel-office login')).toContain('Settings');
  });

  test('the shim being called by its full path changes nothing', () => {
    expect(allows('/Users/x/Library/Application Support/studio/bin/ask-marcel-office login')).toBe(false);
  });
});

describe('respecting what the user switched off in Settings', () => {
  test('a command in a category that is on is allowed', () => {
    expect(allows('ask-marcel-office list-mail-messages --top 5', ['calendar'])).toBe(true);
  });

  test('a command in a category that is off is refused', () => {
    expect(allows('ask-marcel-office list-events', ['calendar'])).toBe(false);
  });

  test('the reason says who switched it off and where', () => {
    expect(reasonFor('ask-marcel-office list-events', ['calendar'])).toContain('Settings');
  });

  test('a command the catalog does not know is allowed: help and version must keep working', () => {
    expect(allows('ask-marcel-office help-json', ['mail'])).toBe(true);
  });

  test('the self-check stays available even when everything else is off', () => {
    expect(allows('ask-marcel-office scopes-check --output json', ['mail', 'calendar', 'meta'])).toBe(true);
  });

  test('a switched-off command inside a chain is caught', () => {
    expect(allows('cd sub && ask-marcel-office list-events', ['calendar'])).toBe(false);
  });

  test('the CLI with no subcommand at all is allowed', () => {
    expect(allows('ask-marcel-office --version')).toBe(true);
  });
});

describe('not mistaking an ordinary command for the Microsoft 365 one', () => {
  test('a command that happens to be called login is not the Microsoft 365 sign-in', () => {
    expect(allows('login')).toBe(true);
  });

  test('a command that happens to mention a Microsoft 365 command name is not one', () => {
    expect(allows('cat list-events.txt', ['calendar'])).toBe(true);
  });
});
