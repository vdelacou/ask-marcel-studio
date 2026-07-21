import { describe, expect, test } from 'bun:test';
import { appendUserMessage, applyUIEvent, emptyChat } from './ui-event-fold.ts';
import type { ChatView } from './ui-event-fold.ts';
import type { UIEvent } from '../../../shared/ipc-contract.ts';

const CONV = 'c1';
const OTHER = 'c2';

const run = (events: readonly UIEvent[], from: ChatView = emptyChat(CONV)): ChatView => events.reduce(applyUIEvent, from);

const start = (conversationId = CONV, messageId = 'm1'): UIEvent => ({ type: 'turn-start', conversationId, messageId });
const delta = (text: string, conversationId = CONV, messageId = 'm1'): UIEvent => ({ type: 'text-delta', conversationId, messageId, delta: text });

describe('watching a reply arrive', () => {
  test('a turn starting adds an empty assistant message and marks the conversation busy', () => {
    const view = run([start()]);

    expect(view.isStreaming).toBe(true);
    expect(view.messages).toHaveLength(1);
    expect(view.messages[0]).toMatchObject({ id: 'm1', role: 'assistant', parts: [] });
  });

  test('deltas accumulate into one growing text part', () => {
    const view = run([start(), delta('Hel'), delta('lo')]);

    expect(view.messages[0]?.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  test('a finished turn stops the spinner and records what it cost', () => {
    const view = run([start(), delta('Hi'), { type: 'turn-done', conversationId: CONV, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 } }]);

    expect(view.isStreaming).toBe(false);
    expect(view.lastUsage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: 0.001 });
  });

  test('a tool call appears while running and fills in when it resolves', () => {
    const view = run([
      start(),
      { type: 'tool-start', conversationId: CONV, messageId: 'm1', toolUseId: 't1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool-result', conversationId: CONV, messageId: 'm1', toolUseId: 't1', result: 'a.txt', isError: false },
    ]);

    expect(view.messages[0]?.parts[0]).toEqual({ type: 'tool', toolUseId: 't1', name: 'Bash', input: { command: 'ls' }, status: 'done', result: 'a.txt' });
  });

  test('a failed tool shows as an error rather than done', () => {
    const view = run([
      start(),
      { type: 'tool-start', conversationId: CONV, messageId: 'm1', toolUseId: 't1', name: 'Bash', input: {} },
      { type: 'tool-result', conversationId: CONV, messageId: 'm1', toolUseId: 't1', result: 'boom', isError: true },
    ]);

    expect(view.messages[0]?.parts[0]).toMatchObject({ status: 'error', result: 'boom' });
  });

  test('the sidebar title updates when the first turn names the conversation', () => {
    const view = run([start(), { type: 'title', conversationId: CONV, title: 'What is in my inbox' }]);

    expect(view.title).toBe('What is in my inbox');
  });

  test('an error stops the spinner and is shown to the user', () => {
    const view = run([start(), { type: 'error', conversationId: CONV, message: 'rate limited' }]);

    expect(view.isStreaming).toBe(false);
    expect(view.error).toBe('rate limited');
  });

  test('starting a new turn clears the error left by the last one', () => {
    const view = run([start(), { type: 'error', conversationId: CONV, message: 'rate limited' }, start(CONV, 'm2')]);

    expect(view.error).toBeUndefined();
  });
});

describe('ignoring events meant for a conversation the user is not looking at', () => {
  // Events are broadcast to the window, not to a view. A turn still running in the
  // background must not write into the conversation currently on screen.
  test('a delta for another conversation is dropped', () => {
    const view = run([start(), delta('mine'), delta('theirs', OTHER, 'm9')]);

    expect(view.messages[0]?.parts).toEqual([{ type: 'text', text: 'mine' }]);
  });

  test('another conversation finishing does not stop this spinner', () => {
    const view = run([start(), { type: 'turn-done', conversationId: OTHER, usage: { inputTokens: 1, outputTokens: 1 } }]);

    expect(view.isStreaming).toBe(true);
  });

  test('another conversation failing does not show an error here', () => {
    const view = run([start(), { type: 'error', conversationId: OTHER, message: 'boom' }]);

    expect(view.error).toBeUndefined();
  });

  test('another conversation being titled does not rename this one', () => {
    const view = run([{ type: 'title', conversationId: OTHER, title: 'theirs' }], { ...emptyChat(CONV), title: 'mine' });

    expect(view.title).toBe('mine');
  });

  test('a tool starting in another conversation does not add a card here', () => {
    const view = run([start(), { type: 'tool-start', conversationId: OTHER, messageId: 'm9', toolUseId: 't9', name: 'Bash', input: {} }]);

    expect(view.messages[0]?.parts).toEqual([]);
  });
});

describe('sending a message', () => {
  test('the message the user typed appears immediately, without waiting for the turn to start', () => {
    const view = appendUserMessage(emptyChat(CONV), 'u1', 'what is in my inbox', '2026-07-17T12:00:00.000Z');

    expect(view.messages).toEqual([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is in my inbox' }], createdAt: '2026-07-17T12:00:00.000Z' }]);
  });

  test('sending clears the error from a previous attempt', () => {
    const view = appendUserMessage({ ...emptyChat(CONV), error: 'rate limited' }, 'u1', 'retry', '2026-07-17T12:00:00.000Z');

    expect(view.error).toBeUndefined();
  });

  test('the reply lands under the message that prompted it', () => {
    const sent = appendUserMessage(emptyChat(CONV), 'u1', 'hi', '2026-07-17T12:00:00.000Z');

    const view = run([start(), delta('hello')], sent);

    expect(view.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

describe('keeping the view honest when events go missing', () => {
  test('a delta for a message that never started is dropped rather than inventing a bubble', () => {
    const view = run([delta('orphan')]);

    expect(view.messages).toEqual([]);
  });

  test('a tool result for a tool that never started is dropped', () => {
    const view = run([start(), { type: 'tool-result', conversationId: CONV, messageId: 'm1', toolUseId: 'ghost', result: 'x', isError: false }]);

    expect(view.messages[0]?.parts).toEqual([]);
  });

  test('a delta arriving after the turn finished still lands, so no text is lost', () => {
    const view = run([start(), { type: 'turn-done', conversationId: CONV, usage: { inputTokens: 1, outputTokens: 1 } }, delta('late')]);

    expect(view.messages[0]?.parts).toEqual([{ type: 'text', text: 'late' }]);
  });
});

describe('watching a delegated job progress', () => {
  const spawned = (view: ChatView): ChatView =>
    applyUIEvent(view, {
      type: 'subagent-tool-start',
      conversationId: 'c1',
      messageId: 'm1',
      parentToolUseId: 'task-1',
      toolUseId: 'step-1',
      name: 'Read',
      input: { file_path: '/deck.pptx' },
    });

  const started = applyUIEvent(emptyChat('c1'), { type: 'turn-start', conversationId: 'c1', messageId: 'm1' });

  test('a subagent step appears under the tool call that spawned it, marked running', () => {
    const view = spawned(started);

    expect(view.subagentSteps?.['task-1']).toEqual([{ toolUseId: 'step-1', name: 'Read', input: { file_path: '/deck.pptx' }, status: 'running' }]);
  });

  test('a step that finished is marked done', () => {
    const view = applyUIEvent(spawned(started), {
      type: 'subagent-tool-result',
      conversationId: 'c1',
      messageId: 'm1',
      parentToolUseId: 'task-1',
      toolUseId: 'step-1',
      isError: false,
    });

    expect(view.subagentSteps?.['task-1']?.[0]?.status).toBe('done');
  });

  test('a step that failed is marked as such', () => {
    const view = applyUIEvent(spawned(started), {
      type: 'subagent-tool-result',
      conversationId: 'c1',
      messageId: 'm1',
      parentToolUseId: 'task-1',
      toolUseId: 'step-1',
      isError: true,
    });

    expect(view.subagentSteps?.['task-1']?.[0]?.status).toBe('error');
  });

  test('steps accumulate in the order the subagent took them', () => {
    let view = spawned(started);
    view = applyUIEvent(view, { type: 'subagent-tool-start', conversationId: 'c1', messageId: 'm1', parentToolUseId: 'task-1', toolUseId: 'step-2', name: 'Grep', input: {} });

    expect(view.subagentSteps?.['task-1']?.map((s) => s.name)).toEqual(['Read', 'Grep']);
  });

  test('two delegated jobs keep their own step lists', () => {
    let view = spawned(started);
    view = applyUIEvent(view, { type: 'subagent-tool-start', conversationId: 'c1', messageId: 'm1', parentToolUseId: 'task-2', toolUseId: 'step-9', name: 'Glob', input: {} });

    expect(view.subagentSteps?.['task-1']).toHaveLength(1);
    expect(view.subagentSteps?.['task-2']).toHaveLength(1);
  });

  test('a result for a step we never saw start is dropped rather than inventing a row', () => {
    const view = applyUIEvent(started, { type: 'subagent-tool-result', conversationId: 'c1', messageId: 'm1', parentToolUseId: 'ghost', toolUseId: 'step-1', isError: false });

    expect(view.subagentSteps).toBeUndefined();
  });

  test('the steps survive the end of the turn, so a finished job can still be inspected', () => {
    const view = applyUIEvent(spawned(started), { type: 'turn-done', conversationId: 'c1', usage: { inputTokens: 1, outputTokens: 1 } });

    expect(view.subagentSteps?.['task-1']).toHaveLength(1);
  });

  test('a subagent step belonging to another conversation is ignored', () => {
    const view = applyUIEvent(started, {
      type: 'subagent-tool-start',
      conversationId: 'other',
      messageId: 'm1',
      parentToolUseId: 'task-1',
      toolUseId: 'step-1',
      name: 'Read',
      input: {},
    });

    expect(view.subagentSteps).toBeUndefined();
  });
});
