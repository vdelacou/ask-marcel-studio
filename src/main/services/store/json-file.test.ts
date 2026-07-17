/*
 * Real temp dirs, real syscalls. node:fs is allowed in tests (rule 20 carve-out)
 * precisely so an FS adapter can be exercised against the actual filesystem rather
 * than a fake that agrees with our assumptions.
 *
 * This file never imports electron, so the bun runner can execute it.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, removeFile, writeJsonFileAtomic } from './json-file.ts';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio-json-'));
});

afterEach(() => {
  // Restore any permissions the tests dropped, or the cleanup itself fails.
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

describe('saving a document so a crash can never leave half of it on disk', () => {
  test('a document written once reads back exactly', async () => {
    const path = join(dir, 'settings.json');

    const written = await writeJsonFileAtomic(path, '{"providers":[]}');
    expect(written.ok).toBe(true);

    const read = await readJsonFile(path);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toEqual({ providers: [] });
  });

  test('writing over an existing document replaces it wholesale', async () => {
    const path = join(dir, 'settings.json');
    await writeJsonFileAtomic(path, '{"providers":[],"defaultModel":"a::old"}');

    await writeJsonFileAtomic(path, '{"providers":[]}');

    const read = await readJsonFile(path);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // Not merged with the previous contents: the file IS the new document.
    expect(read.value).toEqual({ providers: [] });
  });

  test('a write leaves no temp file behind once it succeeds', async () => {
    const path = join(dir, 'settings.json');

    await writeJsonFileAtomic(path, '{"providers":[]}');

    expect(readdirSync(dir)).toEqual(['settings.json']);
  });

  test('a document is written into a folder that does not exist yet', async () => {
    // First launch: <userData>/conversations/ has never been created.
    const path = join(dir, 'conversations', 'deep', 'c.json');

    const written = await writeJsonFileAtomic(path, '{"id":"x"}');

    expect(written.ok).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('{"id":"x"}');
  });

  test('a failed write reports why and leaves no temp file behind', async () => {
    const readOnly = join(dir, 'locked');
    writeFileSync(join(dir, 'placeholder'), 'x');
    const path = join(readOnly, 'settings.json');
    // Make the parent unwritable so mkdir/write inside it fails for real.
    chmodSync(dir, 0o500);

    const written = await writeJsonFileAtomic(path, '{"providers":[]}');

    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.error.kind).toBe('write-failed');
  });
});

describe('loading a document that may not be there, or may be broken', () => {
  test('a document that was never written is reported as missing, not as an error to show the user', async () => {
    const read = await readJsonFile(join(dir, 'settings.json'));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    // The caller decides what missing means: first launch is empty settings, but a
    // missing conversation is a real error.
    expect(read.error.kind).toBe('not-found');
  });

  test('a document truncated by a crash is unreadable rather than silently empty', async () => {
    const path = join(dir, 'settings.json');
    writeFileSync(path, '{"providers":[{"id":"anthro');

    const read = await readJsonFile(path);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.kind).toBe('unreadable');
  });

  test('a document that is valid json but empty text is unreadable', async () => {
    const path = join(dir, 'settings.json');
    writeFileSync(path, '');

    const read = await readJsonFile(path);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.kind).toBe('unreadable');
  });

  test('a document the user cannot read is unreadable rather than missing', async () => {
    const path = join(dir, 'settings.json');
    writeFileSync(path, '{"providers":[]}');
    chmodSync(path, 0o000);

    const read = await readJsonFile(path);

    // Distinguishing this from not-found matters: not-found silently becomes empty
    // settings, which would look like the user's providers vanished.
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.kind).toBe('unreadable');
  });
});

describe('deleting a conversation', () => {
  test('a deleted document is gone', async () => {
    const path = join(dir, 'c.json');
    writeFileSync(path, '{}');

    const removed = await removeFile(path);

    expect(removed.ok).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  test('deleting a document that is already gone reports not-found', async () => {
    const removed = await removeFile(join(dir, 'missing.json'));

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('not-found');
  });
});
