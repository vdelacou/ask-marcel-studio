/*
 * Every tool the shell guard knows by name, and the wording of every refusal.
 *
 * Split from bash-guard.test.ts and bash-guard-parsing.test.ts so each file stays
 * short enough to read in one sitting.
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

describe('covering every tool the guard knows by name', () => {
  // Each entry in the lists is a separate promise to the user. A list that quietly
  // lost one would still pass a test that only ever exercised its neighbours.
  const deletionOutside: readonly string[] = ['rm ~/x', 'rmdir ~/x', 'unlink ~/x', 'shred ~/x'];
  for (const command of deletionOutside) {
    test(`refuses deleting outside with: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  const systemTools: readonly string[] = [
    'diskutil list',
    'csrutil disable',
    'launchctl list',
    'nvram boot-args=x',
    'bless --mount /',
    'shutdown -h now',
    'reboot',
    'halt',
    'fdisk /dev/disk0',
    'newfs_hfs /dev/disk2',
    'mkfs.ext4 /dev/sda1',
  ];
  for (const command of systemTools) {
    test(`refuses the machine-level tool: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  const privileged: readonly string[] = ['sudo ls', 'doas ls'];
  for (const command of privileged) {
    test(`refuses running as an administrator: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  const permissions: readonly string[] = ['chmod -R 777 ~/x', 'chown -R me ~/x', 'chgrp -R staff ~/x'];
  for (const command of permissions) {
    test(`refuses a recursive permission change outside: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  test('a recursive permission change spelled with a lowercase flag is caught too', () => {
    expect(allows('chmod -r 777 ~/x')).toBe(false);
  });

  test('a permission change spelled out in full is caught too', () => {
    expect(allows('chmod --recursive 777 ~/x')).toBe(false);
  });

  test('a non-recursive permission change outside the workspace is left alone', () => {
    // One file's mode is not the shape this guard exists to stop.
    expect(allows('chmod 644 ~/notes.txt')).toBe(true);
  });

  const shells: readonly string[] = ['sh -c "rm -rf ~"', 'bash -c "rm -rf ~"', 'zsh -c "rm -rf ~"', 'dash -c "rm -rf ~"'];
  for (const command of shells) {
    test(`looks inside: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  test('a shell invoked without -c hides nothing to look into', () => {
    expect(allows('bash script.sh')).toBe(true);
  });

  const wrappers: readonly string[] = ['command rm -rf ~', 'builtin rm -rf ~', 'exec rm -rf ~', 'nohup rm -rf ~', 'time rm -rf ~', 'env rm -rf ~'];
  for (const command of wrappers) {
    test(`sees through the wrapper: ${command}`, () => {
      expect(allows(command)).toBe(false);
    });
  }

  test('a bare nice with no flags still shows the command behind it', () => {
    expect(allows('nice rm -rf ~')).toBe(false);
  });

  test('a joined nice flag still shows the command behind it', () => {
    expect(allows('nice -n5 rm -rf ~')).toBe(false);
  });

  test('an assignment in front of a wrapper does not hide it either', () => {
    expect(allows('FOO=1 BAR=2 rm -rf ~')).toBe(false);
  });
});

describe('saying what was refused, in words the agent can pass on', () => {
  test('writing over a disk device says that is what it would do', () => {
    expect(reasonFor('dd if=/dev/zero of=/dev/disk0')).toContain('overwrite a disk');
  });

  test('writing over a file outside the workspace names the file', () => {
    expect(reasonFor('dd if=in.bin of=/Users/x/Documents/report.docx')).toContain('/Users/x/Documents/report.docx');
  });

  test('a recursive permission change says what it would have changed', () => {
    expect(reasonFor('chmod -R 777 ~/x')).toContain('change permissions');
  });

  test('a machine-level tool is named in its own refusal', () => {
    expect(reasonFor('diskutil list')).toContain('diskutil');
  });

  test('running as an administrator says so plainly', () => {
    expect(reasonFor('sudo ls')).toContain('administrator');
  });

  test('a find that deletes outside says where', () => {
    expect(reasonFor('find ~ -name x -delete')).toContain('~');
  });

  test('every refusal ends by telling the agent to explain and move on', () => {
    // The agent is the only thing that reads these, and a refusal it treats as a
    // transient error becomes a retry loop.
    for (const command of ['sudo ls', 'rm -rf ~', 'diskutil list', 'dd if=x of=/dev/disk0', 'chmod -R 777 ~/x', 'cat list.txt | xargs rm']) {
      expect(reasonFor(command)).toContain('carry on another way');
    }
  });
});
