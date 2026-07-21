import { describe, expect, test } from 'bun:test';
import { createIdleWatcher } from './idle-watcher.ts';
import type { UIEvent } from '../../../shared/ipc-contract.ts';

const turnStart = (conversationId: string): UIEvent => ({ type: 'turn-start', conversationId, messageId: 'm1' });
const turnDone = (conversationId: string): UIEvent => ({ type: 'turn-done', conversationId, usage: { inputTokens: 1, outputTokens: 1 } });
const failed = (conversationId: string): UIEvent => ({ type: 'error', conversationId, message: 'boom' });

// A hand-wound clock: the real one would make every test take five minutes.
const watcher = (): { readonly send: (event: UIEvent) => void; readonly stop: () => void; readonly tick: () => void; readonly idle: string[]; readonly live: () => number } => {
  const idle: string[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const built = createIdleWatcher({
    idleMs: 1000,
    onIdle: (conversationId) => idle.push(conversationId),
    setTimer: (fire) => {
      const handle = next;
      next += 1;
      timers.set(handle, fire);
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
  });
  return {
    send: built.onUiEvent,
    stop: built.stop,
    tick: () => {
      for (const fire of [...timers.values()]) fire();
      timers.clear();
    },
    idle,
    live: () => timers.size,
  };
};

describe('noticing when a conversation has gone quiet', () => {
  test('a conversation is read once its last turn has been quiet a while', () => {
    const { send, tick, idle } = watcher();

    send(turnDone('conv-1'));
    tick();

    expect(idle).toEqual(['conv-1']);
  });

  test('a turn that failed counts as the end of one', () => {
    const { send, tick, idle } = watcher();

    send(failed('conv-1'));
    tick();

    expect(idle).toEqual(['conv-1']);
  });

  test('a conversation that carries on is not read yet', () => {
    // Only the silence after the last turn counts.
    const { send, tick, idle, live } = watcher();

    send(turnDone('conv-1'));
    send(turnStart('conv-1'));
    tick();

    expect(idle).toEqual([]);
    expect(live()).toBe(0);
  });

  test('a second turn ending replaces the first one’s timer rather than adding to it', () => {
    const { send, tick, idle, live } = watcher();

    send(turnDone('conv-1'));
    send(turnDone('conv-1'));

    expect(live()).toBe(1);
    tick();
    expect(idle).toEqual(['conv-1']);
  });

  test('two conversations are watched separately', () => {
    const { send, tick, idle } = watcher();

    send(turnDone('conv-1'));
    send(turnDone('conv-2'));
    tick();

    expect([...idle].sort((a, b) => a.localeCompare(b))).toEqual(['conv-1', 'conv-2']);
  });

  test('a conversation is not read twice for the same silence', () => {
    const { send, tick, idle } = watcher();

    send(turnDone('conv-1'));
    tick();
    tick();

    expect(idle).toEqual(['conv-1']);
  });

  test('everything else on the stream is ignored', () => {
    const { send, tick, idle, live } = watcher();

    send({ type: 'text-delta', conversationId: 'conv-1', messageId: 'm1', delta: 'hi' });
    send({ type: 'turn-saved', conversationId: 'conv-1' });

    expect(live()).toBe(0);
    tick();
    expect(idle).toEqual([]);
  });

  test('quitting cancels what was waiting', () => {
    const { send, stop, tick, idle } = watcher();

    send(turnDone('conv-1'));
    stop();
    tick();

    expect(idle).toEqual([]);
  });
});
