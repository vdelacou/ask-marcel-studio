import { describe, expect, test } from 'bun:test';
import { MEMORY_OWNER, notConfiguredMemoryStore, validateMemoryText } from './memory-store.ts';
import { createFakeMemoryStore } from '../test-helpers/fake-memory-store.ts';

describe('what counts as a memory worth keeping', () => {
  test('a memory the user types is kept as written, only trimmed', () => {
    expect(validateMemoryText('  Weilai is my CTO  ')).toEqual({ ok: true, value: 'Weilai is my CTO' });
  });

  test('nothing is not a memory', () => {
    expect(validateMemoryText('   ').ok).toBe(false);
  });

  test('an essay is refused with the limit named', () => {
    const result = validateMemoryText('x'.repeat(3000));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.message).toContain('2000');
  });
});

describe('before memory is set up', () => {
  test('every operation answers that memory is not set up, rather than crashing', async () => {
    const store = notConfiguredMemoryStore();

    for (const result of [await store.search('x', 5), await store.list(), await store.add({ text: 'x', source: 'user' })]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected err');
      expect(result.error.kind).toBe('not-configured');
    }
  });
});

describe('the shape a store must honour, proved against the fake', () => {
  test('a memory added comes back in the list, newest first', async () => {
    const store = createFakeMemoryStore();
    await store.add({ text: 'UCR means Unique Customer Reference', source: 'user' });
    await store.add({ text: 'Weilai is my CTO', source: 'chat' });

    const listed = await store.list();

    expect(listed.ok && listed.value.map((item) => item.text)).toEqual(['Weilai is my CTO', 'UCR means Unique Customer Reference']);
  });

  test('editing a memory keeps a trail of what changed', async () => {
    const store = createFakeMemoryStore();
    const added = await store.add({ text: 'B27 is a budget', source: 'user' });
    if (!added.ok) throw new Error('expected ok');
    await store.update(added.value.id, 'B27 is the 2027 budget cycle');

    const trail = await store.history(added.value.id);

    expect(trail.ok && trail.value.map((entry) => entry.action)).toEqual(['added', 'edited']);
  });

  test('editing an id that never existed reports not-found', async () => {
    const store = createFakeMemoryStore();

    const result = await store.update('does-not-exist', 'anything');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.kind).toBe('not-found');
  });

  test('clearing all leaves nothing behind', async () => {
    const store = createFakeMemoryStore();
    await store.add({ text: 'one', source: 'user' });
    await store.removeAll();

    const listed = await store.list();

    expect(listed.ok && listed.value).toEqual([]);
  });

  test('a store failure surfaces as an error the caller can handle, not a throw', async () => {
    const store = createFakeMemoryStore();
    store.failNextWith({ kind: 'store-failed', message: 'disk gone' });

    const result = await store.list();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.kind).toBe('store-failed');
  });
});

describe('the edges of what a memory may be', () => {
  test('a memory of exactly the limit is kept, one character more is refused', () => {
    expect(validateMemoryText('x'.repeat(2000)).ok).toBe(true);
    expect(validateMemoryText('x'.repeat(2001)).ok).toBe(false);
  });

  test('an empty memory is refused with a reason a person understands', () => {
    const result = validateMemoryText('');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.message).toContain('nothing to remember');
  });

  test('the not-set-up answer explains where to set it up', async () => {
    const result = await notConfiguredMemoryStore().list();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.message).toContain('settings');
  });

  test('there is exactly one owner, and it is not the empty string', () => {
    expect(MEMORY_OWNER.length).toBeGreaterThan(0);
  });
});
