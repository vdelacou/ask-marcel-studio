import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentFilesStore } from './agent-files-store.ts';
import type { AgentFilesStore } from './agent-files-store.ts';

let userData = '';
let store: AgentFilesStore;

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-agent-files-'));
  store = createAgentFilesStore({ userData });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('storing what the user wrote about themselves', () => {
  test('a signature comes back exactly as it was saved', async () => {
    await store.save('signature', '<p>Kind regards,<br>Vincent</p>');

    expect(await store.get('signature')).toEqual({ ok: true, value: '<p>Kind regards,<br>Vincent</p>' });
  });

  test('it lands where the agent looks for it, so the drafting skill can just open it', async () => {
    await store.save('signature', '<p>hello</p>');

    expect(readFileSync(join(userData, 'claude-config', 'signature.html'), 'utf8')).toBe('<p>hello</p>');
  });

  test('the voice profile is a separate document', async () => {
    await store.save('signature', '<p>hello</p>');
    await store.save('voice-profile', '# Voice\n\nShort sentences.');

    expect(await store.get('voice-profile')).toEqual({ ok: true, value: '# Voice\n\nShort sentences.' });
    expect(await store.get('signature')).toEqual({ ok: true, value: '<p>hello</p>' });
  });

  test('a document that was never written reads as empty rather than missing', async () => {
    // The panel shows an empty editor either way; "not found" would be a distinction
    // with nothing behind it.
    expect(await store.get('voice-profile')).toEqual({ ok: true, value: '' });
  });

  test('clearing a signature is a real thing to do', async () => {
    await store.save('signature', '<p>hello</p>');
    await store.save('signature', '');

    expect(await store.get('signature')).toEqual({ ok: true, value: '' });
  });

  test('saving twice keeps the second version', async () => {
    await store.save('voice-profile', 'first');
    await store.save('voice-profile', 'second');

    expect(await store.get('voice-profile')).toEqual({ ok: true, value: 'second' });
  });

  test('a document name that could reach a path is refused before it does', async () => {
    const saved = await store.save('../../escape', 'x');

    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.kind).toBe('invalid');
  });

  test('reading under a name that is not a document is refused too', async () => {
    expect((await store.get('anything-else')).ok).toBe(false);
  });

  test('something that is not text is refused rather than stringified onto disk', async () => {
    expect((await store.save('signature', { html: 'x' })).ok).toBe(false);
  });

  test('a document too big to store is refused', async () => {
    expect((await store.save('signature', 'a'.repeat(300_000))).ok).toBe(false);
  });

  test('a file that cannot be read reports that rather than pretending it is empty', async () => {
    // A directory where the file should be: readable path, unreadable contents.
    mkdirSync(join(userData, 'claude-config', 'signature.html'), { recursive: true });

    const read = await store.get('signature');

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.kind).toBe('unreadable');
  });

  test('a write that cannot land reports the failure', async () => {
    mkdirSync(join(userData, 'claude-config'), { recursive: true });
    mkdirSync(join(userData, 'claude-config', 'voice-profile.md'), { recursive: true });
    writeFileSync(join(userData, 'claude-config', 'voice-profile.md', 'in-the-way.txt'), 'x');

    const saved = await store.save('voice-profile', 'text');

    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.kind).toBe('write-failed');
  });
});
