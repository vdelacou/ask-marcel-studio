import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentsStore } from './agents-store.ts';
import type { AgentsStore } from './agents-store.ts';
import type { SubAgent } from '../../../shared/agents-doc.ts';

const BUILTIN: SubAgent = {
  name: 'm365-reader',
  description: 'Reads one oversized document and hands back a summary.',
  prompt: 'Read the artifact named in the request.',
  tools: ['Bash', 'Read'],
};

let userData = '';
let store: AgentsStore;

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-agents-'));
  store = createAgentsStore({ userData, builtins: [BUILTIN] });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('listing the helpers the agent can delegate to', () => {
  test('a fresh install lists the built-in as it ships', async () => {
    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([{ ...BUILTIN, isBuiltIn: true, isModified: false }]);
  });

  test('a helper the user wrote is listed after the built-ins', async () => {
    await store.save({ name: 'summariser', description: 'Summarises.', prompt: 'Do it.', tools: [] });

    const listed = await store.list();

    expect(listed.ok && listed.value.map((a) => a.name)).toEqual(['m365-reader', 'summariser']);
  });

  test('a corrupt helpers file is reported rather than silently replaced', async () => {
    writeFileSync(join(userData, 'agents.json'), '{ not json');

    const listed = await store.list();

    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.kind).toBe('unreadable');
  });
});

describe('changing a helper', () => {
  test('changing a built-in keeps it a built-in and marks it changed', async () => {
    const saved = await store.save({ ...BUILTIN, description: 'My own wording.' });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value).toMatchObject({ isBuiltIn: true, isModified: true, description: 'My own wording.' });
  });

  test('a changed built-in survives being read back', async () => {
    await store.save({ ...BUILTIN, description: 'My own wording.' });

    const listed = await store.list();

    expect(listed.ok && listed.value[0]?.description).toBe('My own wording.');
  });

  test('saving the same helper twice replaces it rather than listing it twice', async () => {
    await store.save({ name: 'summariser', description: 'One.', prompt: 'Do it.', tools: [] });
    await store.save({ name: 'summariser', description: 'Two.', prompt: 'Do it.', tools: [] });

    const listed = await store.list();

    expect(listed.ok && listed.value.filter((a) => a.name === 'summariser')).toHaveLength(1);
    expect(listed.ok && listed.value[1]?.description).toBe('Two.');
  });

  test('a helper the app cannot use is refused as something the form can fix', async () => {
    const saved = await store.save({ name: 'Bad Name', description: 'x', prompt: 'y', tools: [] });

    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.kind).toBe('invalid');
  });
});

describe('putting a built-in back', () => {
  test('restoring drops the change', async () => {
    await store.save({ ...BUILTIN, description: 'My own wording.' });

    const restored = await store.restore('m365-reader');

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value).toEqual({ ...BUILTIN, isBuiltIn: true, isModified: false });
  });

  test('restoring one that was never changed is harmless', async () => {
    expect((await store.restore('m365-reader')).ok).toBe(true);
  });

  test('there is nothing to restore for a helper the user wrote', async () => {
    await store.save({ name: 'summariser', description: 'x', prompt: 'y', tools: [] });

    const restored = await store.restore('summariser');

    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.error.kind).toBe('not-found');
  });
});

describe('removing a helper', () => {
  test('a helper the user wrote can be removed', async () => {
    await store.save({ name: 'summariser', description: 'x', prompt: 'y', tools: [] });

    expect((await store.remove('summariser')).ok).toBe(true);
    const listed = await store.list();
    expect(listed.ok && listed.value.map((a) => a.name)).toEqual(['m365-reader']);
  });

  test('a built-in cannot be removed: it would come back with the app anyway', async () => {
    const removed = await store.remove('m365-reader');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.message).toContain('put the original back');
  });

  test('removing one that is not there says so', async () => {
    const removed = await store.remove('nothing');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('not-found');
  });

  test('a name that is not a string is refused', async () => {
    expect((await store.remove(42)).ok).toBe(false);
    expect((await store.restore(42)).ok).toBe(false);
  });
});
