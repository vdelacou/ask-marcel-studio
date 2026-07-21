/*
 * Which memory file is being read or written.
 *
 * A whitelist of three, never a path. It crosses IPC as an untrusted string and ends
 * up in a join(), exactly like a skill folder name does.
 *
 * Pure: zero electron imports, so `bun test` covers the checkpoint.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type MemoryFileName = 'jargon' | 'team' | 'people';

export const MEMORY_FILES: readonly MemoryFileName[] = ['jargon', 'team', 'people'];

export type MemoryFileNameError = { readonly kind: 'bad-name'; readonly message: string };

export const memoryFileName = (raw: unknown): Result<MemoryFileName, MemoryFileNameError> => {
  const matched = MEMORY_FILES.find((name) => name === raw);
  if (matched === undefined) return err({ kind: 'bad-name', message: 'that is not one of the notes this app keeps' });
  return ok(matched);
};
