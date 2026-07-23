/*
 * A hand-written in-memory MemoryStore for tests (rule 13).
 *
 * Search is by substring rather than by embedding, which is enough to prove a caller asks
 * the right question and threads the result; the real semantic ranking is the adapter's
 * and is exercised through vector-math's own tests. An error-injection knob forces each
 * failure branch a caller must handle.
 */
import { validateMemoryText } from '../shared/memory-store.ts';
import type { MemoryItem, MemoryStore, MemoryStoreError, MemoryHistoryEntry, MemoryAddInput } from '../shared/memory-store.ts';
import { ok, err } from '../shared/result.ts';
import type { Result } from '../shared/result.ts';

export type FakeMemoryStore = MemoryStore & {
  // Forces the next operation to fail with this error, once.
  readonly failNextWith: (error: MemoryStoreError) => void;
  readonly seed: (items: readonly MemoryItem[]) => void;
};

export const createFakeMemoryStore = (now: () => string = () => '2026-07-24T00:00:00.000Z'): FakeMemoryStore => {
  const items: MemoryItem[] = [];
  const histories = new Map<string, MemoryHistoryEntry[]>();
  let nextId = 1;
  let injected: MemoryStoreError | undefined;

  const takeInjected = <T>(): Result<T, MemoryStoreError> | undefined => {
    if (injected === undefined) return undefined;
    const error = injected;
    injected = undefined;
    return err(error);
  };

  const add = (input: MemoryAddInput): Promise<Result<MemoryItem, MemoryStoreError>> => {
    const failed = takeInjected<MemoryItem>();
    if (failed !== undefined) return Promise.resolve(failed);
    const validated = validateMemoryText(input.text);
    if (!validated.ok) return Promise.resolve(validated);
    const at = now();
    const item: MemoryItem = {
      id: String(nextId++),
      text: validated.value,
      source: input.source,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      createdAt: at,
      updatedAt: at,
    };
    items.push(item);
    histories.set(item.id, [{ at, action: 'added', text: item.text }]);
    return Promise.resolve(ok(item));
  };

  const search = (query: string, limit: number): Promise<Result<readonly MemoryItem[], MemoryStoreError>> => {
    const failed = takeInjected<readonly MemoryItem[]>();
    if (failed !== undefined) return Promise.resolve(failed);
    const needle = query.toLowerCase();
    return Promise.resolve(ok(items.filter((item) => item.text.toLowerCase().includes(needle)).slice(0, limit)));
  };

  const list = (): Promise<Result<readonly MemoryItem[], MemoryStoreError>> => {
    const failed = takeInjected<readonly MemoryItem[]>();
    if (failed !== undefined) return Promise.resolve(failed);
    return Promise.resolve(ok([...items].reverse()));
  };

  const update = (id: string, text: string): Promise<Result<MemoryItem, MemoryStoreError>> => {
    const failed = takeInjected<MemoryItem>();
    if (failed !== undefined) return Promise.resolve(failed);
    const validated = validateMemoryText(text);
    if (!validated.ok) return Promise.resolve(validated);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
    const existing = items[index];
    if (existing === undefined) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
    const at = now();
    const updated: MemoryItem = { ...existing, text: validated.value, updatedAt: at };
    items[index] = updated;
    histories.get(id)?.push({ at, action: 'edited', text: updated.text });
    return Promise.resolve(ok(updated));
  };

  const remove = (id: string): Promise<Result<null, MemoryStoreError>> => {
    const failed = takeInjected<null>();
    if (failed !== undefined) return Promise.resolve(failed);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
    histories.get(id)?.push({ at: now(), action: 'removed', text: items[index]?.text ?? '' });
    items.splice(index, 1);
    return Promise.resolve(ok(null));
  };

  const removeAll = (): Promise<Result<null, MemoryStoreError>> => {
    const failed = takeInjected<null>();
    if (failed !== undefined) return Promise.resolve(failed);
    items.length = 0;
    return Promise.resolve(ok(null));
  };

  const history = (id: string): Promise<Result<readonly MemoryHistoryEntry[], MemoryStoreError>> => {
    const failed = takeInjected<readonly MemoryHistoryEntry[]>();
    if (failed !== undefined) return Promise.resolve(failed);
    const trail = histories.get(id);
    if (trail === undefined) return Promise.resolve(err({ kind: 'not-found', message: `no memory with id ${id}` }));
    return Promise.resolve(ok([...trail]));
  };

  return {
    add,
    search,
    list,
    update,
    remove,
    removeAll,
    history,
    failNextWith: (error) => {
      injected = error;
    },
    seed: (seeded) => {
      for (const item of seeded) {
        items.push(item);
        histories.set(item.id, [{ at: item.createdAt, action: 'added', text: item.text }]);
      }
    },
  };
};
