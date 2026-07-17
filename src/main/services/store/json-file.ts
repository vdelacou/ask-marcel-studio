/*
 * Atomic JSON file IO for the main process. The thin shell around the pure
 * document modules in src/shared/**: this file knows about bytes and syscalls
 * and nothing about what the JSON means.
 *
 * DEVIATION from hard rule 20 (Bun file API in production): this code runs in
 * Electron's Node runtime, where the `Bun` global does not exist. node:fs/promises
 * is the only option here. Rule 20 still binds anything that runs under Bun.
 * See .claude/LESSONS.md.
 *
 * try/catch is in-quarantine here (rule 17): this is the infra adapter whose job
 * is translating thrown library errors into Result.
 */
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type JsonFileError =
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string };

const isMissingFile = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT';

// Returns not-found rather than a default, so the caller decides what "missing"
// means: first launch is empty settings, but a missing conversation is an error.
export const readTextFile = async (path: string): Promise<Result<string, JsonFileError>> => {
  try {
    return ok(await readFile(path, 'utf8'));
  } catch (e) {
    if (isMissingFile(e)) return err({ kind: 'not-found', message: `no file at ${path}` });
    return err({ kind: 'unreadable', message: formatError(e) });
  }
};

export const readJsonFile = async (path: string): Promise<Result<unknown, JsonFileError>> => {
  const text = await readTextFile(path);
  if (!text.ok) return text;
  try {
    return ok(JSON.parse(text.value));
  } catch (e) {
    // The file exists but is not JSON: truncated by a crash, or hand-edited.
    return err({ kind: 'unreadable', message: `${path} is not valid json: ${formatError(e)}` });
  }
};

/*
 * Write via a temp file in the SAME directory, then rename over the target.
 *
 * rename(2) is atomic within a filesystem, so a reader either sees the whole old
 * file or the whole new one, never a half-written one. Writing the temp file
 * elsewhere (e.g. os.tmpdir()) would break that: a cross-device rename falls back
 * to a copy, which is not atomic. This is the mitigation for risk R11 in docs/PLAN.md.
 */
export const writeJsonFileAtomic = async (path: string, contents: string): Promise<Result<null, JsonFileError>> => {
  // randomUUID, not Math.random: an unpredictable name means a concurrent write
  // can never collide with this one, and it keeps sonarjs/pseudo-random quiet
  // without an inline ignore (rule 15).
  const temp = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temp, contents, 'utf8');
    await rename(temp, path);
    return ok(null);
  } catch (e) {
    // Never leave the temp file behind on a failed write; the unlink itself may
    // fail (the temp may not exist yet), and that must not mask the real error.
    await unlink(temp).catch(() => undefined);
    return err({ kind: 'write-failed', message: `could not write ${path}: ${formatError(e)}` });
  }
};

export const removeFile = async (path: string): Promise<Result<null, JsonFileError>> => {
  try {
    await unlink(path);
    return ok(null);
  } catch (e) {
    if (isMissingFile(e)) return err({ kind: 'not-found', message: `no file at ${path}` });
    return err({ kind: 'write-failed', message: `could not delete ${path}: ${formatError(e)}` });
  }
};
