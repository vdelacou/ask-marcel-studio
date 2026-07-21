/*
 * Noticing when a conversation has gone quiet.
 *
 * Reading a conversation costs the user tokens, so it happens once, a few minutes after
 * the last thing was said, rather than after every turn. A conversation that carries on
 * cancels its own timer: only the last turn's silence counts.
 *
 * The timer functions are injected so a test does not wait five minutes.
 */
import type { UIEvent } from '../../../shared/ipc-contract.ts';

export type IdleWatcherDeps = {
  readonly idleMs: number;
  readonly onIdle: (conversationId: string) => void;
  readonly setTimer: (fire: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
};

export type IdleWatcher = {
  readonly onUiEvent: (event: UIEvent) => void;
  readonly stop: () => void;
};

export const createIdleWatcher = (deps: IdleWatcherDeps): IdleWatcher => {
  const timers = new Map<string, unknown>();

  const cancel = (conversationId: string): void => {
    const handle = timers.get(conversationId);
    if (handle === undefined) return;
    deps.clearTimer(handle);
    timers.delete(conversationId);
  };

  const onUiEvent = (event: UIEvent): void => {
    // A turn starting means the conversation is anything but quiet.
    if (event.type === 'turn-start') {
      cancel(event.conversationId);
      return;
    }
    // A turn that failed ended it just as much as one that finished.
    if (event.type !== 'turn-done' && event.type !== 'error') return;

    const conversationId = event.conversationId;
    cancel(conversationId);
    timers.set(
      conversationId,
      deps.setTimer(() => {
        timers.delete(conversationId);
        deps.onIdle(conversationId);
      }, deps.idleMs)
    );
  };

  const stop = (): void => {
    for (const handle of timers.values()) deps.clearTimer(handle);
    timers.clear();
  };

  return { onUiEvent, stop };
};
