/*
 * How the guard reads a command: quoting, chaining, substitutions, working-directory
 * tracking, and every tool it knows by name.
 *
 * Split from bash-guard.test.ts, which states the plain allow/deny promise, so each
 * file stays short enough to read in one sitting.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateBashCommand } from './bash-guard.ts';
import type { BashGuardPolicy } from './bash-guard.ts';

const WORKSPACE = '/Users/x/Library/Application Support/studio/workspaces/conv-1';

const policy = (): BashGuardPolicy => ({ workspaceDir: WORKSPACE, disabledOfficeCategories: [], officeCommandCategories: new Map() });

const allows = (command: string): boolean => evaluateBashCommand(command, policy()).allow;
const reasonFor = (command: string): string => {
  const verdict = evaluateBashCommand(command, policy());
  return verdict.allow ? '' : verdict.reason;
};

describe('reading commands the way a shell would', () => {
  test('an empty command allows', () => {
    expect(allows('')).toBe(true);
  });

  test('whitespace only allows', () => {
    expect(allows('   \n  ')).toBe(true);
  });

  test('a wrapper word does not hide the command behind it', () => {
    expect(allows('nohup rm -rf ~')).toBe(false);
    expect(allows('env FOO=1 rm -rf ~')).toBe(false);
    expect(allows('nice -n 5 rm -rf ~')).toBe(false);
    expect(allows('command sudo ls')).toBe(false);
  });

  test('a cd back into the workspace makes relative paths provable again', () => {
    expect(allows('cd sub && cd .. && rm notes.txt')).toBe(true);
  });

  test('a delete in any segment of a chain is caught, not just the first', () => {
    expect(allows('echo one; echo two; rm /etc/hosts')).toBe(false);
  });

  test('a subshell is read as its own segment', () => {
    expect(allows('(rm -rf ~)')).toBe(false);
  });

  test('a newline separates commands like a semicolon does', () => {
    expect(allows('echo one\nrm -rf ~')).toBe(false);
  });

  test('an unterminated quote does not hang or crash the check', () => {
    expect(typeof allows('echo "unterminated')).toBe('boolean');
  });

  test('a delete with no target at all is harmless', () => {
    expect(allows('rm -rf')).toBe(true);
  });
});

describe('separating commands the way a shell does', () => {
  const separated: readonly string[] = [
    'echo one & rm -rf ~',
    'echo one | rm -rf ~',
    'echo one; rm -rf ~',
    'echo one\nrm -rf ~',
    '(rm -rf ~)',
    'echo one && (echo two) ; rm -rf ~',
    '{ rm -rf ~; }',
  ];
  for (const command of separated) {
    test(`reads the delete in: ${JSON.stringify(command)}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  test('a closing paren ends a segment, so what follows is read on its own', () => {
    expect(allows('(echo one) rm -rf ~')).toBe(false);
  });

  test('a closing brace ends a segment too', () => {
    expect(allows('{ echo one } rm -rf ~')).toBe(false);
  });

  test('a tab separates arguments like a space does', () => {
    expect(allows('rm\t-rf\t~')).toBe(false);
  });
});

describe('reading quotes and substitutions', () => {
  test('a substitution inside double quotes is a real command and is read as hidden', () => {
    expect(allows('echo "$(rm -rf ~)"')).toBe(false);
  });

  test('the same text inside single quotes is literal and is left alone', () => {
    expect(allows("echo '$(rm -rf ~)'")).toBe(true);
  });

  test('a variable inside double quotes is not a substitution', () => {
    expect(allows('echo "$HOME/rm.txt"')).toBe(true);
  });

  test('an unquoted variable is not a substitution either', () => {
    expect(allows('echo $HOME/rm.txt')).toBe(true);
  });

  test('a substitution hiding a destructive verb is refused even where the head is harmless', () => {
    expect(allows('ls $(which rm)')).toBe(false);
  });

  test('a parenthesis that is not part of a substitution is just a separator', () => {
    expect(allows('ls; (rm -rf ./x)')).toBe(true);
  });

  test('a backtick substitution hiding nothing destructive is allowed', () => {
    expect(allows('echo `pwd`')).toBe(true);
  });

  test('a single-quoted argument keeps its spaces as one word', () => {
    expect(allows("rm 'my notes.txt'")).toBe(true);
  });

  test('a double-quoted path with spaces outside the workspace is still caught', () => {
    expect(allows('rm "/Users/x/my notes.txt"')).toBe(false);
  });
});

describe('deciding what counts as inside the conversation folder', () => {
  test('the workspace itself is inside it', () => {
    expect(allows(`rm -rf "${WORKSPACE}"`)).toBe(true);
  });

  test('a sibling folder with a similar name is not inside it', () => {
    expect(allows(`rm -rf "${WORKSPACE}-other"`)).toBe(false);
  });

  test('a path that climbs out and back in is inside it', () => {
    expect(allows('rm -rf ./sub/../build')).toBe(true);
  });

  test('a path that climbs out and stays out is not', () => {
    expect(allows('rm -rf ./sub/../../elsewhere')).toBe(false);
  });

  test('a flag is never read as a path', () => {
    expect(allows('rm -rf --verbose ./build')).toBe(true);
  });

  test('a flag carrying a path is not read as a target', () => {
    // Only the operands are targets; a flag's own text is the tool's business.
    expect(allows('rm --exclude=~/keep ./build')).toBe(true);
  });
});

describe('reading a find that deletes', () => {
  test('find without a destructive action is left alone wherever it looks', () => {
    expect(allows('find ~ -name "*.log"')).toBe(true);
  });

  test('find with -delete inside the workspace is allowed', () => {
    expect(allows('find ./build -name "*.log" -delete')).toBe(true);
  });

  test('find with -exec running something harmless is left alone', () => {
    expect(allows('find ~ -name x -exec cat {} ;')).toBe(true);
  });

  test('find with no root at all searches here, which is inside', () => {
    expect(allows('find -name "*.log" -delete')).toBe(true);
  });

  test('find deleting under several roots is refused if any is outside', () => {
    expect(allows('find ./build ~/Documents -name x -delete')).toBe(false);
  });
});

describe('reading a dd that writes', () => {
  test('dd with no output file is left alone', () => {
    expect(allows('dd if=in.bin')).toBe(true);
  });

  test('dd writing inside the workspace is allowed', () => {
    expect(allows('dd if=in.bin of=./out/copy.bin')).toBe(true);
  });
});

describe('reading paths that come from somewhere else', () => {
  test('xargs running something harmless is left alone', () => {
    expect(allows('cat list.txt | xargs cat')).toBe(true);
  });

  test('xargs with only flags after it is left alone', () => {
    expect(allows('cat list.txt | xargs -n1')).toBe(true);
  });

  test('the reason for an xargs delete explains what to do instead', () => {
    expect(reasonFor('cat list.txt | xargs rm')).toContain('List the files first');
  });
});
