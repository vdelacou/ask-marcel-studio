/*
 * The guard is the one thing standing between "tidy those files up" and a deleted home
 * directory, so it is tested as a table: every row is a command someone could plausibly
 * end up running, and the assertion is whether it may.
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

describe('letting ordinary work through', () => {
  const allowed: readonly string[] = [
    'ls -la',
    'cat notes.txt',
    'echo hello',
    'FOO=1 npm run build',
    'cat a.txt | grep budget',
    'python3 analyse.py && cat out.csv',
    'node --version',
    // Deleting inside the conversation's own scratch folder is the agent's business.
    'rm notes.txt',
    'rm -rf ./build',
    'rm -rf .',
    'cd sub && rm -rf .',
    // Quoted, because the real workspace path has a space in it and an unquoted one
    // would be two arguments to the shell as well as to this.
    `rm -rf "${WORKSPACE}/tmp"`,
    'rmdir emptydir',
    'chmod +x script.sh',
    'chmod -R 755 ./out',
    'dd if=in.bin of=out.bin',
    'find . -name "*.log" -delete',
    'xargs echo < list.txt',
    // Quoted text is data, not a command.
    'echo "rm -rf /"',
    "grep -r 'sudo' notes.txt",
    // A substitution that mentions nothing destructive is fine.
    'echo `date`',
    'ls $(pwd)',
  ];

  for (const command of allowed) {
    test(`allows: ${command}`, () => {
      expect(allows(command)).toBe(true);
    });
  }
});

describe('refusing what cannot be undone', () => {
  const refused: readonly string[] = [
    'sudo ls',
    'doas rm x',
    'true && sudo rm x',
    // Deleting outside the conversation's folder, however it is spelled.
    'rm -rf /',
    'rm -rf ~',
    'rm -rf ~/Documents',
    'rm -rf $HOME',
    'rm /etc/hosts',
    'rm ../other/file.txt',
    'ls; rm -rf ~/Documents',
    'cd / && rm -rf tmp',
    'cd .. && rm -f escaped.txt',
    // An unknowable working directory makes every relative path unprovable.
    'cd $DIR && rm x',
    'cd ~ && rm x',
    'shred ~/secrets.txt',
    'unlink /etc/hosts',
    'find / -name "*.log" -delete',
    'find ~ -name x -exec rm {} ;',
    // The machine itself.
    'diskutil eraseDisk JHFS+ Blank disk2',
    'launchctl unload -w /System/Library/LaunchDaemons/x.plist',
    'mkfs.ext4 /dev/disk2',
    'shutdown -h now',
    'dd if=/dev/zero of=/dev/disk0',
    'dd if=in.bin of=/Users/x/Documents/report.docx',
    'chmod -R 777 /Users/x',
    'chown -R me /etc',
    // Paths that arrive from somewhere this cannot read.
    'cat list.txt | xargs rm',
    'rm `find / -name x`',
    'rm $(cat list.txt)',
    'bash -c "rm -rf ~"',
    'sh -c "sudo ls"',
  ];

  for (const command of refused) {
    test(`refuses: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  test('the reason names what would have been deleted, so the agent can explain it', () => {
    expect(reasonFor('rm -rf ~/Documents')).toContain('~/Documents');
  });

  test('the reason tells the agent to explain and carry on, not to retry', () => {
    expect(reasonFor('rm -rf /')).toContain('carry on another way');
  });

  test('a substitution is refused for being unreadable, and says how to fix it', () => {
    expect(reasonFor('rm `find / -name x`')).toContain('without command substitution');
  });

  test('nesting deeper than the guard follows still cannot smuggle a delete through', () => {
    // Each level is itself a shell invocation, and the outermost segments are checked
    // as words either way.
    expect(allows('sh -c "sh -c \\"sh -c rm\\""')).toBe(true);
  });
});

describe('refusing to let a command fail the same way a third time', () => {
  const base = { workspaceDir: '/w', disabledOfficeCategories: [], officeCommandCategories: new Map<string, string>() };

  test('a command that already failed twice is refused, and told to change approach', () => {
    const verdict = evaluateBashCommand('ask-marcel-office list-mail --folder inbox', { ...base, repeatedlyFailedCommands: ['ask-marcel-office list-mail --folder inbox'] });

    expect(verdict.allow).toBe(false);
    if (verdict.allow) throw new Error('expected deny');
    expect(verdict.reason).toContain('already failed twice');
  });

  test('the same command spelled with different spacing is still refused', () => {
    const verdict = evaluateBashCommand('ask-marcel-office   list-mail   --folder inbox', { ...base, repeatedlyFailedCommands: ['ask-marcel-office list-mail --folder inbox'] });

    expect(verdict.allow).toBe(false);
  });

  test('a command that has not been failing is allowed', () => {
    expect(evaluateBashCommand('ask-marcel-office list-mail-messages --top 5', { ...base, repeatedlyFailedCommands: ['something --else'] }).allow).toBe(true);
  });

  test('a caller that tracks no failures blocks nothing new', () => {
    expect(evaluateBashCommand('echo hello', base).allow).toBe(true);
  });
});
