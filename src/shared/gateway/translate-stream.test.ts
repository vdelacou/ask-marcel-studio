/*
 * The gateway's hardest surface: ai v7's fullStream -> Anthropic's SSE event order.
 *
 * Fixtures are shaped from the REAL part names in the installed ai@7 (verified against
 * its .d.ts, see .claude/PLAN.md step zero), not from the v4/v5 names docs/PLAN.md
 * assumed. `text-delta` carries `text`; v4 called it `textDelta`.
 */
import { describe, expect, test } from 'bun:test';
import { emptyStream, translatePart } from './translate-stream.ts';
import type { StreamState } from './translate-stream.ts';
import type { AnthropicSseEvent } from './anthropic-sse.ts';

const run = (parts: readonly unknown[]): { state: StreamState; events: readonly AnthropicSseEvent[] } => {
  let state = emptyStream('msg_1', 'gpt-4o');
  const events: AnthropicSseEvent[] = [];
  for (const part of parts) {
    const step = translatePart(state, part);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
};

const types = (events: readonly AnthropicSseEvent[]): string[] => events.map((e) => e.type);

describe('relaying a plain text answer', () => {
  test('a text block opens, streams and closes in the order the sdk expects', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: 'Hel' },
      { type: 'text-delta', id: 't0', text: 'lo' },
      { type: 'text-end', id: 't0' },
      { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 2 } },
    ]);

    expect(types(events)).toEqual(['content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  });

  test('the deltas carry the text, read from v7 field name', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: 'hi' },
    ]);

    expect(events[1]).toEqual({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } });
  });

  test('a text delta with no start still opens its block, since some providers skip text-start', () => {
    const { events } = run([{ type: 'text-delta', id: 't0', text: 'hi' }]);

    expect(types(events)).toEqual(['content_block_start', 'content_block_delta']);
  });

  test('an empty delta is not relayed as an empty frame', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: '' },
    ]);

    expect(types(events)).toEqual(['content_block_start']);
  });
});

describe('relaying a tool call', () => {
  test('a streamed tool call opens with its name and streams its arguments as partial json', () => {
    const { events } = run([
      { type: 'tool-input-start', id: 'call_1', toolName: 'Bash' },
      { type: 'tool-input-delta', id: 'call_1', delta: '{"command"' },
      { type: 'tool-input-delta', id: 'call_1', delta: ':"ls"}' },
      { type: 'tool-input-end', id: 'call_1' },
      { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 1, outputTokens: 1 } },
    ]);

    expect(events[0]).toEqual({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'Bash', input: {} } });
    expect(events[1]).toEqual({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command"' } });
    expect(types(events)).toEqual(['content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  });

  test('the whole tool-call part is NOT relayed again after its deltas', () => {
    // ai v7 emits tool-call IN ADDITION to the input deltas. Relaying both would give
    // the agent the same tool twice — the same trap as the assistant message repeating
    // streamed text in sdk-event-fold.
    const { events } = run([
      { type: 'tool-input-start', id: 'call_1', toolName: 'Bash' },
      { type: 'tool-input-delta', id: 'call_1', delta: '{"command":"ls"}' },
      { type: 'tool-input-end', id: 'call_1' },
      { type: 'tool-call', toolCallId: 'call_1', toolName: 'Bash', input: { command: 'ls' } },
    ]);

    expect(types(events)).toEqual(['content_block_start', 'content_block_delta', 'content_block_stop']);
  });

  test('a provider that sends only a whole tool-call still produces a complete block', () => {
    // The fallback docs/PLAN.md called for: one input_json_delta carrying the full
    // JSON is legal, and some providers never stream arguments.
    const { events } = run([{ type: 'tool-call', toolCallId: 'call_9', toolName: 'Read', input: { path: 'notes/deep.md' } }]);

    expect(types(events)).toEqual(['content_block_start', 'content_block_delta', 'content_block_stop']);
    expect(events[0]).toMatchObject({ content_block: { type: 'tool_use', id: 'call_9', name: 'Read' } });
    expect(events[1]).toEqual({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"notes/deep.md"}' } });
  });

  test('text followed by a tool call gets its own block index', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: 'Let me look.' },
      { type: 'text-end', id: 't0' },
      { type: 'tool-input-start', id: 'call_1', toolName: 'Bash' },
      { type: 'tool-input-delta', id: 'call_1', delta: '{}' },
      { type: 'tool-input-end', id: 'call_1' },
    ]);

    expect(events[0]).toMatchObject({ index: 0 });
    // Indices must advance: two blocks sharing index 0 would overwrite each other.
    expect(events[3]).toMatchObject({ index: 1, content_block: { type: 'tool_use' } });
    expect(events[4]).toMatchObject({ index: 1 });
  });

  test('two tool calls in one turn get separate blocks', () => {
    const { events } = run([
      { type: 'tool-input-start', id: 'a', toolName: 'Read' },
      { type: 'tool-input-delta', id: 'a', delta: '{}' },
      { type: 'tool-input-end', id: 'a' },
      { type: 'tool-input-start', id: 'b', toolName: 'Bash' },
      { type: 'tool-input-delta', id: 'b', delta: '{}' },
      { type: 'tool-input-end', id: 'b' },
    ]);

    expect(events.filter((e) => e.type === 'content_block_start')).toHaveLength(2);
    expect(events[3]).toMatchObject({ index: 1, content_block: { id: 'b', name: 'Bash' } });
  });
});

describe('closing the turn', () => {
  const stopReasons: ReadonlyArray<{ readonly upstream: string; readonly anthropic: string }> = [
    { upstream: 'stop', anthropic: 'end_turn' },
    { upstream: 'length', anthropic: 'max_tokens' },
    { upstream: 'tool-calls', anthropic: 'tool_use' },
    { upstream: 'content-filter', anthropic: 'end_turn' },
    { upstream: 'other', anthropic: 'end_turn' },
    { upstream: 'unknown-future-reason', anthropic: 'end_turn' },
  ];

  for (const { upstream, anthropic } of stopReasons) {
    test(`an upstream finish of '${upstream}' closes the turn as '${anthropic}'`, () => {
      const { events } = run([{ type: 'finish', finishReason: upstream, totalUsage: { inputTokens: 1, outputTokens: 1 } }]);

      expect(events.at(-2)).toMatchObject({ type: 'message_delta', delta: { stop_reason: anthropic } });
    });
  }

  test('a finish closes any block still open, so the sdk never waits on it', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: 'cut off' },
      { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 1 } },
    ]);

    expect(types(events)).toEqual(['content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  });

  test('the closing usage is relayed', () => {
    const { events } = run([{ type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } }]);

    expect(events.at(-2)).toMatchObject({ usage: { output_tokens: 5 } });
  });

  test('a finish with no usage counts zero rather than emitting undefined', () => {
    const { events } = run([{ type: 'finish', finishReason: 'stop' }]);

    expect(events.at(-2)).toMatchObject({ usage: { output_tokens: 0 } });
  });

  test('the turn is marked done, so the server knows to end the response', () => {
    const { state } = run([{ type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 1 } }]);

    expect(state.done).toBe(true);
  });
});

describe('relaying a failure honestly', () => {
  test('an upstream error becomes an error event rather than a silent truncation', () => {
    const { events } = run([{ type: 'error', error: { message: 'rate limited' } }]);

    expect(events).toEqual([{ type: 'error', error: { type: 'api_error', message: 'rate limited' } }]);
  });

  test('an error that is a bare string is still relayed', () => {
    const { events } = run([{ type: 'error', error: 'boom' }]);

    expect(events.at(-1)).toMatchObject({ type: 'error', error: { message: 'boom' } });
  });

  test('an abort ends the stream without pretending the turn finished', () => {
    const { state, events } = run([{ type: 'abort' }]);

    expect(types(events)).toEqual([]);
    expect(state.done).toBe(true);
  });
});

describe('ignoring what the wire has no place for', () => {
  const noise: ReadonlyArray<{ readonly why: string; readonly part: unknown }> = [
    { why: 'reasoning, which v1 does not show', part: { type: 'reasoning-delta', id: 'r', text: 'hmm' } },
    { why: 'the step markers', part: { type: 'start-step' } },
    { why: 'a finish-step, since only the final finish closes the turn', part: { type: 'finish-step', finishReason: 'stop' } },
    { why: 'the stream start marker', part: { type: 'start' } },
    { why: 'a tool result, which the agent produces itself', part: { type: 'tool-result', toolCallId: 'c', output: 'x' } },
    { why: 'a raw passthrough part', part: { type: 'raw', rawValue: {} } },
    { why: 'a part type added by a future ai release', part: { type: 'something-new-in-v8' } },
    { why: 'a part that is not an object', part: 'nonsense' },
    { why: 'a null part', part: null },
  ];

  for (const { why, part } of noise) {
    test(`${why} produces nothing`, () => {
      const { events } = run([part]);

      expect(events).toEqual([]);
    });
  }
});
