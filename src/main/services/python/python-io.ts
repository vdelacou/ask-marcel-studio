/*
 * The python IO shell: spawn the runtime/venv binaries and manage the venv marker.
 *
 * The policy (which commands, single-flight, rebuild-on-version-change) is the pure
 * python-service; this file only touches child processes and the filesystem, so it carries
 * no unit tests and stays out of the coverage tiers, mirroring office-io.ts. The marker
 * read/write reuses the atomic json-file helpers (which own the try/catch quarantine); the
 * venv removal is force:true so a first run with no venv does not throw.
 *
 * spawn runs without a shell, so the fixed args cannot be reinterpreted; the binaries are
 * app-controlled absolute paths, not user input (rule 12).
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { readTextFile, writeJsonFileAtomic } from '../store/json-file.ts';
import { pipCacheDir } from '../../../shared/paths.ts';
import { provisionMarkerPath, pythonVenvDir } from '../../../shared/python-paths.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { PythonIo, PythonRunOutcome } from './python-service.ts';

const spawnRun =
  (inheritedEnv: Readonly<Record<string, string | undefined>>, userData: string) =>
  (binary: string, args: readonly string[], timeoutMs: number): Promise<PythonRunOutcome> =>
    new Promise<PythonRunOutcome>((resolve) => {
      const child = spawn(binary, [...args], {
        // Keep the user site-packages out and the pip cache inside the data folder, so
        // provisioning is isolated and self-contained (matches the shim env).
        env: { ...inheritedEnv, PYTHONNOUSERSITE: '1', PIP_CACHE_DIR: pipCacheDir(userData) },
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

export const createPythonIo = (userData: string, inheritedEnv: Readonly<Record<string, string | undefined>>): PythonIo => {
  const venvDir = pythonVenvDir(userData);
  const markerPath = provisionMarkerPath(venvDir);
  return {
    run: spawnRun(inheritedEnv, userData),
    readMarker: async (): Promise<string | undefined> => {
      const read = await readTextFile(markerPath);
      return read.ok ? read.value.trim() : undefined;
    },
    // Best effort: a failed stamp just means the next launch re-provisions, which is safe.
    writeMarker: async (content: string): Promise<void> => {
      await writeJsonFileAtomic(markerPath, content);
    },
    // force:true so removing a venv that was never created is a no-op, not a throw.
    removeVenv: (): Promise<void> => rm(venvDir, { recursive: true, force: true }),
  };
};
