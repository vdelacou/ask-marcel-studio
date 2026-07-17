/*
 * The conversations store against a real temp userData folder. This file never
 * imports electron (the store does not either), so the bun runner can execute it.
 *
 * The clock is injected, so "updated at" is asserted rather than slept on.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversationsStore } from './conversations-store.ts';
import type { ConversationsStore } from './conversations-store.ts';

let userData = '';
let store: ConversationsStore;
let clock = '2026-07-17T12:00:00.000Z';

const tick = (iso: string): void => {
  clock = iso;
};

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-conv-'));
  clock = '2026-07-17T12:00:00.000Z';
  store = createConversationsStore({ userData, now: () => clock });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('starting and reopening a conversation', () => {
  test('a conversation created on a model can be opened again by its id', async () => {
    const created = await store.create({ model: 'anthropic::claude-opus-4-8' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const reopened = await store.get(created.value.id);

    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.id).toBe(created.value.id);
    expect(reopened.value.model).toBe('anthropic::claude-opus-4-8');
    expect(reopened.value.messages).toEqual([]);
  });

  test('each new conversation gets its own file', async () => {
    await store.create({ model: 'm' });
    await store.create({ model: 'm' });

    expect(readdirSync(join(userData, 'conversations'))).toHaveLength(2);
  });

  test('opening a conversation that was never created reports not-found', async () => {
    const opened = await store.get('3f2504e0-4f89-41d3-9a0c-0305e82c3301');

    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.kind).toBe('not-found');
  });
});

describe('listing what the sidebar shows', () => {
  test('a fresh install lists no conversations rather than failing on a missing folder', async () => {
    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([]);
  });

  test('the most recently updated conversation is listed first', async () => {
    const first = await store.create({ model: 'm' });
    tick('2026-07-17T13:00:00.000Z');
    const second = await store.create({ model: 'm' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((c) => c.id)).toEqual([second.value.id, first.value.id]);
  });

  test('the sidebar list carries no message bodies', async () => {
    await store.create({ model: 'm' });

    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect('messages' in (listed.value[0] ?? {})).toBe(false);
  });

  test('one corrupt conversation file does not take the whole sidebar down', async () => {
    const good = await store.create({ model: 'm' });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    // A crash mid-write, or a hand edit. The sidebar must still render.
    writeFileSync(join(userData, 'conversations', '3f2504e0-4f89-41d3-9a0c-0305e82c3301.json'), '{"id":"3f2504e0-4f89');

    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((c) => c.id)).toEqual([good.value.id]);
  });

  test('a stray non-json file in the folder is ignored', async () => {
    const good = await store.create({ model: 'm' });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    writeFileSync(join(userData, 'conversations', '.DS_Store'), 'junk');

    const listed = await store.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
  });
});

describe('renaming a conversation', () => {
  test('a renamed conversation keeps its new title when reopened', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await store.rename({ id: created.value.id, title: 'Inbox triage' });

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.title).toBe('Inbox triage');
    const reopened = await store.get(created.value.id);
    expect(reopened.ok && reopened.value.title).toBe('Inbox triage');
  });

  test('renaming stamps the conversation as updated, so it moves to the top of the sidebar', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    tick('2026-07-17T18:00:00.000Z');

    const renamed = await store.rename({ id: created.value.id, title: 'Later' });

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.updatedAt).toBe('2026-07-17T18:00:00.000Z');
  });

  test('a title of only spaces is rejected rather than leaving a blank row in the sidebar', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await store.rename({ id: created.value.id, title: '   ' });

    expect(renamed.ok).toBe(false);
    if (renamed.ok) return;
    expect(renamed.error.kind).toBe('invalid');
  });

  test('renaming a conversation that does not exist reports not-found', async () => {
    const renamed = await store.rename({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', title: 'x' });

    expect(renamed.ok).toBe(false);
    if (renamed.ok) return;
    expect(renamed.error.kind).toBe('not-found');
  });
});

describe('deleting a conversation', () => {
  test('a deleted conversation is gone from the sidebar and cannot be reopened', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const removed = await store.remove(created.value.id);

    expect(removed.ok).toBe(true);
    const listed = await store.list();
    expect(listed.ok && listed.value).toEqual([]);
    const reopened = await store.get(created.value.id);
    expect(reopened.ok).toBe(false);
  });

  test('deleting a conversation takes its workspace with it', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const workspace = await store.workspaceFor(created.value.id);
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;
    // Whatever the agent wrote in there goes too; leaving it would grow userData forever.
    writeFileSync(join(workspace.value, 'scratch.txt'), 'agent output');

    await store.remove(created.value.id);

    expect(existsSync(workspace.value)).toBe(false);
  });

  test('deleting a conversation that is already gone reports not-found', async () => {
    const removed = await store.remove('3f2504e0-4f89-41d3-9a0c-0305e82c3301');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('not-found');
  });
});

describe('giving the agent a folder to work in', () => {
  test('a conversation workspace is created on demand and is stable across calls', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await store.workspaceFor(created.value.id);
    const second = await store.workspaceFor(created.value.id);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
    expect(existsSync(first.value)).toBe(true);
  });

  test('a workspace already holding the agent output is reused, not wiped', async () => {
    const created = await store.create({ model: 'm' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await store.workspaceFor(created.value.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    writeFileSync(join(first.value, 'notes.md'), 'from an earlier turn');

    await store.workspaceFor(created.value.id);

    expect(existsSync(join(first.value, 'notes.md'))).toBe(true);
  });
});

describe('refusing an id that could escape the conversations folder', () => {
  // The renderer is not trusted with a path. Each of these would otherwise reach a
  // join() and resolve outside userData. See conversation-id.ts.
  const traversals = ['../../../etc/passwd', '/etc/passwd', 'evil/../../../3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'not-a-uuid', ''];

  for (const id of traversals) {
    test(`opening '${id}' is refused as a malformed id`, async () => {
      const opened = await store.get(id);

      expect(opened.ok).toBe(false);
      if (opened.ok) return;
      expect(opened.error.kind).toBe('malformed-id');
    });

    test(`deleting '${id}' is refused as a malformed id`, async () => {
      const removed = await store.remove(id);

      expect(removed.ok).toBe(false);
      if (removed.ok) return;
      expect(removed.error.kind).toBe('malformed-id');
    });

    test(`asking for a workspace at '${id}' is refused as a malformed id`, async () => {
      const workspace = await store.workspaceFor(id);

      expect(workspace.ok).toBe(false);
      if (workspace.ok) return;
      expect(workspace.error.kind).toBe('malformed-id');
    });
  }

  test('a traversal id never creates anything outside the data folder', async () => {
    const outside = join(userData, '..', 'escaped-marker');
    mkdirSync(join(userData, 'conversations'), { recursive: true });

    await store.workspaceFor('../escaped-marker');
    await store.remove('../escaped-marker');

    expect(existsSync(outside)).toBe(false);
  });
});
