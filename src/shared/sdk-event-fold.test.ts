/*
 * The fold is the single source of truth for BOTH the UI stream and what gets
 * persisted, so every test here asserts both: the events the renderer sees, and the
 * parts that end up in the conversation file. A divergence between the two is the
 * bug this module exists to prevent.
 *
 * Fixtures are shaped from the real SDK types in 0.3.185 (sdk.d.ts), not invented.
 */
import { describe, expect, test } from 'bun:test';
import { emptyFold, foldSdkMessage } from './sdk-event-fold.ts';
import type { FoldState } from './sdk-event-fold.ts';
import type { UIEvent } from './ipc-contract.ts';

const CONV = 'c1';
const MSG = 'm1';

// Drives a sequence the way the runtime does, collecting every event.
const run = (messages: readonly unknown[]): { state: FoldState; events: readonly UIEvent[] } => {
  let state = emptyFold(MSG);
  const events: UIEvent[] = [];
  for (const message of messages) {
    const step = foldSdkMessage(state, message, CONV);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
};

const textDelta = (text: string): unknown => ({
  type: 'stream_event',
  session_id: 's1',
  parent_tool_use_id: null,
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
});

const assistantToolUse = (toolUseId: string, name: string, input: unknown): unknown => ({
  type: 'assistant',
  session_id: 's1',
  parent_tool_use_id: null,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name, input }] },
});

const toolResult = (toolUseId: string, content: string, isError = false): unknown => ({
  type: 'user',
  session_id: 's1',
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }] },
});

const result = (over: Record<string, unknown> = {}): unknown => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 's1',
  total_cost_usd: 0.0123,
  usage: { input_tokens: 100, output_tokens: 42 },
  ...over,
});

describe('watching the assistant type a reply', () => {
  test('streamed text arrives as deltas and lands as one text part', () => {
    const { state, events } = run([textDelta('Hello'), textDelta(' there')]);

    expect(events).toEqual([
      { type: 'text-delta', conversationId: CONV, messageId: MSG, delta: 'Hello' },
      { type: 'text-delta', conversationId: CONV, messageId: MSG, delta: ' there' },
    ]);
    // One part, not two: consecutive deltas append rather than accumulate parts.
    expect(state.parts).toEqual([{ type: 'text', text: 'Hello there' }]);
  });

  test('the full assistant message does not duplicate the text already streamed', () => {
    // The assistant message carries the WHOLE text as well. Folding it in would show
    // everything twice.
    const { state } = run([
      textDelta('Hello'),
      { type: 'assistant', session_id: 's1', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } },
    ]);

    expect(state.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  test('thinking is not shown in v1', () => {
    const thinking = {
      type: 'stream_event',
      session_id: 's1',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } },
    };
    const { state, events } = run([thinking, textDelta('Hi')]);

    expect(events).toEqual([{ type: 'text-delta', conversationId: CONV, messageId: MSG, delta: 'Hi' }]);
    expect(state.parts).toEqual([{ type: 'text', text: 'Hi' }]);
  });
});

describe('watching the agent use a tool', () => {
  test('a tool call shows up as running, then resolves with its output', () => {
    const { state, events } = run([assistantToolUse('t1', 'Bash', { command: 'ls' }), toolResult('t1', 'a.txt')]);

    expect(events).toEqual([
      { type: 'tool-start', conversationId: CONV, messageId: MSG, toolUseId: 't1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool-result', conversationId: CONV, messageId: MSG, toolUseId: 't1', result: 'a.txt', isError: false },
    ]);
    expect(state.parts).toEqual([{ type: 'tool', toolUseId: 't1', name: 'Bash', input: { command: 'ls' }, status: 'done', result: 'a.txt' }]);
  });

  test('a failed tool is marked as an error, not as done', () => {
    const { state, events } = run([assistantToolUse('t1', 'Bash', {}), toolResult('t1', 'command not found', true)]);

    expect(events[1]).toEqual({ type: 'tool-result', conversationId: CONV, messageId: MSG, toolUseId: 't1', result: 'command not found', isError: true });
    expect(state.parts[0]).toMatchObject({ status: 'error', result: 'command not found' });
  });

  test('a tool still running when the turn is cut off stays marked running', () => {
    const { state } = run([assistantToolUse('t1', 'Bash', {})]);

    // The conversation file has to be honest about a turn that was interrupted.
    expect(state.parts[0]).toMatchObject({ status: 'running' });
    expect(state.parts[0]).not.toHaveProperty('result');
  });

  test('text before and after a tool call keeps its order', () => {
    const { state } = run([textDelta('Let me look. '), assistantToolUse('t1', 'Bash', {}), toolResult('t1', 'ok'), textDelta('Found it.')]);

    expect(state.parts.map((p) => p.type)).toEqual(['text', 'tool', 'text']);
    expect(state.parts[2]).toEqual({ type: 'text', text: 'Found it.' });
  });

  test('two tools running at once each resolve to their own card', () => {
    const { state } = run([assistantToolUse('t1', 'Read', {}), assistantToolUse('t2', 'Bash', {}), toolResult('t2', 'second'), toolResult('t1', 'first')]);

    expect(state.parts).toEqual([
      { type: 'tool', toolUseId: 't1', name: 'Read', input: {}, status: 'done', result: 'first' },
      { type: 'tool', toolUseId: 't2', name: 'Bash', input: {}, status: 'done', result: 'second' },
    ]);
  });

  test('tool output that arrives as content blocks is flattened to text the card can show', () => {
    const blocks = {
      type: 'user',
      session_id: 's1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [
              { type: 'text', text: 'line one' },
              { type: 'text', text: 'line two' },
            ],
          },
        ],
      },
    };
    const { state } = run([assistantToolUse('t1', 'Bash', {}), blocks]);

    expect(state.parts[0]).toMatchObject({ result: 'line one\nline two' });
  });

  test('a result for a tool we never saw start is ignored rather than crashing the turn', () => {
    const { state, events } = run([toolResult('ghost', 'output')]);

    expect(events).toEqual([]);
    expect(state.parts).toEqual([]);
  });
});

describe('keeping subagent chatter out of the transcript', () => {
  // A Task tool spawns a subagent whose messages arrive on the same stream with
  // parent_tool_use_id set. Subagent UI is an explicit non-goal, and folding these
  // in would interleave a second conversation into this one.
  test('a subagent text delta is not shown', () => {
    const nested = {
      type: 'stream_event',
      session_id: 's1',
      parent_tool_use_id: 't1',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'subagent thinking' } },
    };
    const { state, events } = run([nested]);

    expect(events).toEqual([]);
    expect(state.parts).toEqual([]);
  });

  test('a subagent tool call is not shown', () => {
    const nested = {
      type: 'assistant',
      session_id: 's1',
      parent_tool_use_id: 't1',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'inner', name: 'Read', input: {} }] },
    };

    expect(run([nested]).state.parts).toEqual([]);
  });
});

describe('finishing a turn', () => {
  test('the session id is captured from the first system message, so a crash mid-turn can still resume', () => {
    const { state } = run([{ type: 'system', subtype: 'init', session_id: 'sess_abc' }]);

    expect(state.sdkSessionId).toBe('sess_abc');
  });

  test('the session id is captured from the result too, in case the system message was missed', () => {
    const { state } = run([result({ session_id: 'sess_xyz' })]);

    expect(state.sdkSessionId).toBe('sess_xyz');
  });

  test('a finished turn reports what it cost', () => {
    const { state, events } = run([textDelta('Hi'), result()]);

    expect(events.at(-1)).toEqual({ type: 'turn-done', conversationId: CONV, usage: { inputTokens: 100, outputTokens: 42, costUsd: 0.0123 } });
    expect(state.done).toBe(true);
  });

  test('a turn whose usage the sdk did not report still closes, counting zero', () => {
    const { events } = run([result({ usage: undefined, total_cost_usd: undefined })]);

    expect(events.at(-1)).toEqual({ type: 'turn-done', conversationId: CONV, usage: { inputTokens: 0, outputTokens: 0 } });
  });

  test('a turn that failed reports the error instead of a clean finish', () => {
    const { state, events } = run([result({ subtype: 'error_during_execution', is_error: true })]);

    expect(events.at(-1)).toMatchObject({ type: 'error', conversationId: CONV });
    expect(state.done).toBe(true);
  });
});

describe('ignoring what the fold has no use for', () => {
  // The SDKMessage union has 35 variants in 0.3.185 and grows with the SDK. Anything
  // unrecognised must be dropped silently rather than crash a turn.
  const noise: ReadonlyArray<{ readonly why: string; readonly message: unknown }> = [
    { why: 'a status heartbeat', message: { type: 'status', session_id: 's1' } },
    { why: 'an api retry notice', message: { type: 'api_retry', session_id: 's1' } },
    { why: 'a compact boundary', message: { type: 'compact_boundary', session_id: 's1' } },
    { why: 'a variant added by a future sdk', message: { type: 'something_new_in_0_4', session_id: 's1' } },
    { why: 'a message that is not an object', message: 'nonsense' },
    { why: 'a null message', message: null },
    { why: 'a stream event with no delta', message: { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0 } } },
    { why: 'an assistant message with no content', message: { type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant' } } },
  ];

  for (const { why, message } of noise) {
    test(`${why} changes nothing`, () => {
      const { state, events } = run([message]);

      expect(events).toEqual([]);
      expect(state.parts).toEqual([]);
      expect(state.done).toBe(false);
    });
  }
});
