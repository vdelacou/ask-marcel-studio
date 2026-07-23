/*
 * The launch-time sweep of SDK transcript folders.
 *
 * The pure transcript-sweep decides which folders are orphans and which background files
 * are stale; this is the readdir and the rm. It runs once at startup, not awaited: a slow
 * disk must not hold the window shut, and if it fails the only cost is disk left unfreed.
 *
 * Never throws. A maintenance chore that took the app down would be worse than the mess it
 * cleans, so every IO error is swallowed and the run simply stops where it broke.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { planTranscriptSweep, sdkProjectDirName, staleJsonl } from '../../../shared/transcript-sweep.ts';

export type SweepDeps = {
  // claude-config/projects for the account being swept.
  readonly projectsDir: string;
  // The absolute workspace path of every conversation that still exists.
  readonly keepWorkspacePaths: readonly string[];
  // The background workspace, kept whole but with its own jsonl aged out.
  readonly backgroundWorkspacePath: string;
  readonly now: () => number;
  readonly maxBackgroundAgeMs: number;
};

export type SweepSummary = { readonly removedFolders: number; readonly trimmedFiles: number };

const folderNames = async (projectsDir: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // No projects folder yet (a fresh account) is nothing to sweep.
    return [];
  }
};

const removeFolder = async (path: string): Promise<boolean> => {
  try {
    await rm(path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};

const trimBackground = async (deps: SweepDeps): Promise<number> => {
  const dir = join(deps.projectsDir, sdkProjectDirName(deps.backgroundWorkspacePath));
  const cutoff = deps.now() - deps.maxBackgroundAgeMs;
  try {
    const names = await readdir(dir);
    const withTimes = await Promise.all(names.map(async (name) => ({ name, mtimeMs: (await stat(join(dir, name))).mtimeMs })));
    const stale = staleJsonl(withTimes, cutoff);
    const removed = await Promise.all(stale.map((name) => removeFolder(join(dir, name))));
    return removed.filter(Boolean).length;
  } catch {
    // No background transcript folder is nothing to trim.
    return 0;
  }
};

export const sweepTranscripts = async (deps: SweepDeps): Promise<SweepSummary> => {
  const present = await folderNames(deps.projectsDir);
  const keep = [...deps.keepWorkspacePaths, deps.backgroundWorkspacePath].map(sdkProjectDirName);
  const orphans = planTranscriptSweep({ present, keep });
  const removed = await Promise.all(orphans.map((name) => removeFolder(join(deps.projectsDir, name))));
  const trimmedFiles = await trimBackground(deps);
  return { removedFolders: removed.filter(Boolean).length, trimmedFiles };
};
