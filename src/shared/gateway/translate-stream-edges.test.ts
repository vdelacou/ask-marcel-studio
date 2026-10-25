/*
 * The edges of the stream translator: the parts that arrive half-formed, out of place or
 * empty, and what a fresh stream starts from. Each is a shape a provider we do not control
 * can send, and each has to produce either nothing or a frame the sdk accepts.
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

describe('starting a stream', () => {
  test('a new stream has nothing open, no tool relayed and the turn not done', () => {
    expect(emptyStream('msg_1', 'gpt-4o')).toEqual({ messageId: 'msg_1', model: 'gpt-4o', nextIndex: 0, relayedTools: [], done: false });
  });
});

describe('a text block at its edges', () => {
  test('a text block announces itself as an empty text block, the text following in deltas', () => {
    const { events } = run([{ type: 'text-start', id: 't0' }]);

    expect(events).toEqual([{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]);
  });

  test('a text delta that carries no text produces nothing', () => {
    const { events } = run([{ type: 'text-delta', id: 't0' }]);

    expect(events).toEqual([]);
  });

  test('a text end closes the block on its own, before any finish', () => {
    const { state, events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', text: 'Hello' },
      { type: 'text-end', id: 't0' },
    ]);

    expect(events.at(-1)).toEqual({ type: 'content_block_stop', index: 0 });
    expect(state.open).toBeUndefined();
  });
});

describe('tool arguments that cannot be placed', () => {
  test('an argument delta with no tool block open produces nothing', () => {
    const { events } = run([{ type: 'tool-input-delta', id: 'c1', delta: '{"command":"ls"}' }]);

    expect(events).toEqual([]);
  });

  test('an argument delta arriving inside a text block produces nothing', () => {
    const { events } = run([
      { type: 'text-start', id: 't0' },
      { type: 'tool-input-delta', id: 'c1', delta: '{"command":"ls"}' },
    ]);

    expect(events.map((event) => event.type)).toEqual(['content_block_start']);
  });

  const empty: ReadonlyArray<{ readonly why: string; readonly part: unknown }> = [
    { why: 'an empty argument delta', part: { type: 'tool-input-delta', id: 'c1', delta: '' } },
    { why: 'an argument delta with no delta at all', part: { type: 'tool-input-delta', id: 'c1' } },
  ];

  for (const { why, part } of empty) {
    test(`${why} inside an open tool block produces nothing`, () => {
      const { events } = run([{ type: 'tool-input-start', id: 'c1', toolName: 'Bash' }, part]);

      expect(events.map((event) => event.type)).toEqual(['content_block_start']);
    });
  }

  const incomplete: ReadonlyArray<{ readonly why: string; readonly part: unknown }> = [
    { why: 'a whole tool call with no id', part: { type: 'tool-call', toolName: 'Bash', input: { command: 'ls' } } },
    { why: 'a whole tool call with no tool name', part: { type: 'tool-call', toolCallId: 'c1', input: { command: 'ls' } } },
  ];

  for (const { why, part } of incomplete) {
    test(`${why} produces nothing, since the agent could not answer it`, () => {
      const { events } = run([part]);

      expect(events).toEqual([]);
    });
  }
});

describe('closing the turn on what the provider reported', () => {
  test('output tokens that are not a number count zero', () => {
    const { events } = run([{ type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 'many' } }]);

    expect(events.at(-2)).toMatchObject({ usage: { output_tokens: 0 } });
  });
});

describe('a failure the provider described badly', () => {
  const vague: ReadonlyArray<{ readonly why: string; readonly error: unknown }> = [
    { why: 'an error object with no message', error: { code: 500 } },
    { why: 'an error that is neither text nor an object', error: 42 },
  ];

  for (const { why, error } of vague) {
    test(`${why} is relayed as an upstream error, and the turn ends`, () => {
      const { state, events } = run([{ type: 'error', error }]);

      expect(events).toEqual([{ type: 'error', error: { type: 'api_error', message: 'upstream error' } }]);
      expect(state).toEqual({ messageId: 'msg_1', model: 'gpt-4o', nextIndex: 0, relayedTools: [], done: true });
    });
  }
});
