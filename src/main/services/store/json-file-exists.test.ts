/*
 * Whether a document is there at all, which is what the launch jobs ask before filling one in.
 * An empty file is there: emptying a document is a choice the jobs must not undo. Real files in
 * a scratch folder; all text here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileExists } from './json-file.ts';

let folder = '';

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'studio-file-exists-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('whether a document is there', () => {
  test('a document emptied on purpose still exists, so the launch jobs leave it alone', async () => {
    writeFileSync(join(folder, 'voice-profile.md'), '');

    expect(await fileExists(join(folder, 'voice-profile.md'))).toBe(true);
  });

  test('a document never written does not exist, so the launch jobs may fill it in', async () => {
    expect(await fileExists(join(folder, 'signature.html'))).toBe(false);
  });
});
