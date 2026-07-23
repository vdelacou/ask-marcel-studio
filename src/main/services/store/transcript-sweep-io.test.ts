import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdkProjectDirName } from '../../../shared/transcript-sweep.ts';
import { sweepTranscripts } from './transcript-sweep-io.ts';

let root = '';
const projectsDir = (): string => join(root, 'projects');
const bgPath = (): string => join(root, 'background-workspace');
const wsPath = (id: string): string => join(root, 'workspaces', id);

const makeFolder = (name: string): string => {
  const dir = join(projectsDir(), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.jsonl'), '{}\n');
  return dir;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'studio-sweep-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('sweeping transcript folders at launch', () => {
  test('a folder whose conversation is gone is removed', async () => {
    makeFolder(sdkProjectDirName(wsPath('alive')));
    const orphan = makeFolder(sdkProjectDirName(wsPath('deleted')));

    const summary = await sweepTranscripts({
      projectsDir: projectsDir(),
      keepWorkspacePaths: [wsPath('alive')],
      backgroundWorkspacePath: bgPath(),
      now: () => 1_000_000,
      maxBackgroundAgeMs: 100,
    });

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(join(projectsDir(), sdkProjectDirName(wsPath('alive'))))).toBe(true);
    expect(summary.removedFolders).toBe(1);
  });

  test('the background workspace folder itself is never removed', async () => {
    const background = makeFolder(sdkProjectDirName(bgPath()));

    await sweepTranscripts({
      projectsDir: projectsDir(),
      keepWorkspacePaths: [],
      backgroundWorkspacePath: bgPath(),
      now: () => 1_000_000,
      maxBackgroundAgeMs: 100,
    });

    expect(existsSync(background)).toBe(true);
  });

  test('stale jsonl inside the background folder is trimmed by age', async () => {
    const background = join(projectsDir(), sdkProjectDirName(bgPath()));
    mkdirSync(background, { recursive: true });
    const old = join(background, 'old.jsonl');
    const fresh = join(background, 'fresh.jsonl');
    writeFileSync(old, '{}\n');
    writeFileSync(fresh, '{}\n');
    utimesSync(old, new Date(0), new Date(0));
    utimesSync(fresh, new Date(5_000), new Date(5_000));

    const summary = await sweepTranscripts({
      projectsDir: projectsDir(),
      keepWorkspacePaths: [],
      backgroundWorkspacePath: bgPath(),
      now: () => 5_000,
      maxBackgroundAgeMs: 1_000,
    });

    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(summary.trimmedFiles).toBe(1);
  });

  test('a missing projects folder is a no-op, not a crash', async () => {
    const summary = await sweepTranscripts({
      projectsDir: join(root, 'nope'),
      keepWorkspacePaths: [],
      backgroundWorkspacePath: bgPath(),
      now: () => 1,
      maxBackgroundAgeMs: 1,
    });

    expect(summary).toEqual({ removedFolders: 0, trimmedFiles: 0 });
  });
});
