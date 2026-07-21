import { describe, expect, test } from 'bun:test';
import { applyActivityEvent, clearActivity, emptyActivity } from './conversation-activity.ts';
import type { UIEvent } from '../../../shared/ipc-contract.ts';

const A = 'conversation-a';
const B = 'conversation-b';

const turnStart = (conversationId: string): UIEvent => ({ type: 'turn-start', conversationId, messageId: 'm1' });
const turnDone = (conversationId: string): UIEvent => ({ type: 'turn-done', conversationId, usage: { inputTokens: 1, outputTokens: 1 } });
const failed = (conversationId: string): UIEvent => ({ type: 'error', conversationId, message: 'boom' });

describe('showing which conversations are still working', () => {
  test('a turn that starts marks its conversation as working', () => {
    expect(applyActivityEvent(emptyActivity, turnStart(A), A)[A]).toBe('running');
  });

  test('a turn that ends while the user is watching it leaves no mark', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), A);

    expect(applyActivityEvent(working, turnDone(A), A)).toEqual({});
  });

  test('a turn that ends in a conversation the user left is marked as a new reply', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), B);

    expect(applyActivityEvent(working, turnDone(A), B)[A]).toBe('unseen');
  });

  test('a turn that failed while the user was away is worth coming back to too', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), B);

    expect(applyActivityEvent(working, failed(A), B)[A]).toBe('unseen');
  });

  test('a turn that fails while the user is watching leaves no mark, because they saw it', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), A);

    expect(applyActivityEvent(working, failed(A), A)).toEqual({});
  });

  test('a turn ending with nothing on screen is still marked, so the answer is not lost', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), undefined);

    expect(applyActivityEvent(working, turnDone(A), undefined)[A]).toBe('unseen');
  });

  test('two conversations working at once are both marked', () => {
    const both = applyActivityEvent(applyActivityEvent(emptyActivity, turnStart(A), A), turnStart(B), A);

    expect(both).toEqual({ [A]: 'running', [B]: 'running' });
  });

  test('every other event leaves the marks alone', () => {
    const working = applyActivityEvent(emptyActivity, turnStart(A), A);

    expect(applyActivityEvent(working, { type: 'text-delta', conversationId: A, messageId: 'm1', delta: 'hi' }, A)).toBe(working);
    expect(applyActivityEvent(working, { type: 'turn-saved', conversationId: A }, A)).toBe(working);
  });

  test('opening a conversation clears its mark', () => {
    const unseen = applyActivityEvent(applyActivityEvent(emptyActivity, turnStart(A), B), turnDone(A), B);

    expect(clearActivity(unseen, A)).toEqual({});
  });

  test('clearing a conversation that has no mark changes nothing', () => {
    expect(clearActivity(emptyActivity, A)).toBe(emptyActivity);
  });

  test('opening one conversation leaves the others marked', () => {
    let map = applyActivityEvent(emptyActivity, turnStart(A), undefined);
    map = applyActivityEvent(map, turnStart(B), undefined);

    expect(clearActivity(map, A)).toEqual({ [B]: 'running' });
  });
});
