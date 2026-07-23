/*
 * The office IO shell: write the PATH shim, and the production `run` that actually
 * launches the CLI. The policy (which command, single-flight, deadlines, parsing) is
 * the pure office-service; this file only touches the filesystem and child processes,
 * so it carries no unit tests and stays out of the coverage tiers.
 *
 * The CLI is launched as `execPath cliPath ...args` with ELECTRON_RUN_AS_NODE=1, i.e.
 * the app's own Electron binary run as Node, so it works on a machine with no Node.
 * spawn runs without a shell, so the fixed args cannot be reinterpreted; execPath and
 * cliPath are app-controlled, not user input (rule 12).
 *
 * node:fs is used rather than Bun.write because the main process runs in Electron's
 * Node runtime where the Bun global does not exist, and because the executable bit
 * needs chmod, which Bun.write cannot set. See .claude/LESSONS.md (hard rule 20 in the
 * main process).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { officeShimScripts } from '../../../shared/office-shim.ts';
import { binDir, claudeConfigDir, cliCheatsheetPath } from '../../../shared/paths.ts';
import { generateCliCheatsheet } from '../../../shared/cli-cheatsheet.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { OfficeRun, OfficeRunOutcome } from './office-service.ts';

export type OfficeCliLocation = {
  readonly execPath: string;
  readonly cliPath: string;
};

export const writeOfficeShim = async (userData: string, location: OfficeCliLocation): Promise<void> => {
  const dir = binDir(userData);
  // Directory boundary: Bun has no mkdir, so node:fs is the sanctioned tool (rule 20).
  await mkdir(dir, { recursive: true });
  const scripts = officeShimScripts(location);
  const unixPath = join(dir, 'ask-marcel-office');
  await writeFile(unixPath, scripts.unix, 'utf8');
  // Executable, so `ask-marcel-office` resolves and runs off the agent's PATH.
  await chmod(unixPath, 0o755);
  await writeFile(join(dir, 'ask-marcel-office.cmd'), scripts.windows, 'utf8');
};

// Generated fresh every launch from the CLI's own catalog, so a CLI upgrade that renames
// a flag rewrites the sheet. Silent on failure like the shim: a missing sheet means the
// agent falls back to `--help`, not a broken launch.
export const writeCliCheatsheet = async (userData: string, catalogPath: string): Promise<void> => {
  try {
    const sheet = generateCliCheatsheet(JSON.parse(readFileSync(catalogPath, 'utf8')));
    if (!sheet.ok) return;
    await mkdir(claudeConfigDir(userData), { recursive: true });
    await writeFile(cliCheatsheetPath(userData), sheet.value, 'utf8');
  } catch {
    // A catalog that will not read or a folder that will not write: the agent manages
    // with --help, and this is retried next launch.
  }
};

export const createOfficeRun =
  (location: OfficeCliLocation, inheritedEnv: Readonly<Record<string, string | undefined>>): OfficeRun =>
  (args, timeoutMs) =>
    new Promise<OfficeRunOutcome>((resolve) => {
      const child = spawn(location.execPath, [location.cliPath, ...args], {
        env: { ...inheritedEnv, ELECTRON_RUN_AS_NODE: '1', NO_UPDATE_NOTIFIER: '1' },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ ran: false, message: formatError(error) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ran: true, stdout, stderr, code: code ?? -1, timedOut });
      });
    });
