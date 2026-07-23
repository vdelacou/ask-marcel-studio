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

  // Tool output arrives in every shape a provider feels like sending. The card shows
  // text, so each has to flatten to something showable rather than crash the turn.
  const outputs: ReadonlyArray<{ readonly why: string; readonly content: unknown; readonly shown: string }> = [
    { why: 'plain text', content: 'a.txt', shown: 'a.txt' },
    {
      why: 'text blocks',
      content: [
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
      ],
      shown: 'one\ntwo',
    },
    {
      why: 'blocks where one carries no text',
      content: [
        { type: 'text', text: 'kept' },
        { type: 'image', source: {} },
      ],
      shown: 'kept',
    },
    {
      why: 'blocks where one is empty',
      content: [
        { type: 'text', text: '' },
        { type: 'text', text: 'kept' },
      ],
      shown: 'kept',
    },
    { why: 'a block that is not an object', content: ['nonsense', { type: 'text', text: 'kept' }], shown: 'kept' },
    { why: 'an empty block list', content: [], shown: '' },
    { why: 'no content at all', content: undefined, shown: '' },
    { why: 'content that is a number', content: 42, shown: '' },
    { why: 'content that is an object', content: { oops: true }, shown: '' },
  ];

  for (const { why, content, shown } of outputs) {
    test(`tool output as ${why} is shown as ${JSON.stringify(shown)}`, () => {
      const blocks = { type: 'user', session_id: 's1', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content }] } };
      const { state } = run([assistantToolUse('t1', 'Bash', {}), blocks]);

      expect(state.parts[0]).toMatchObject({ status: 'done', result: shown });
    });
  }

  test('a result for a tool we never saw start is ignored rather than crashing the turn', () => {
    const { state, events } = run([toolResult('ghost', 'output')]);

    expect(events).toEqual([]);
    expect(state.parts).toEqual([]);
  });
});

describe('watching and recording what a subagent does, without its narration', () => {
  // A Task tool spawns a subagent whose messages arrive on the same stream with
  // parent_tool_use_id set. Its tool calls are folded as CHILD parts tagged with the
  // spawning tool's id, so a delegated job can be watched live AND reviewed after the
  // conversation is reopened; its narration stays out (a second conversation).
  const subagentToolUse = {
    type: 'assistant',
    session_id: 's1',
    parent_tool_use_id: 't1',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'inner', name: 'Read', input: { file_path: '/deck.pptx' } }] },
  };
  const subagentToolResult = {
    type: 'user',
    session_id: 's1',
    parent_tool_use_id: 't1',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'inner', content: 'forty pages of slides' }] },
  };

  test('a subagent tool call is reported under the tool that spawned it and lands as a child part', () => {
    const { state, events } = run([subagentToolUse]);

    expect(events).toEqual([
      { type: 'subagent-tool-start', conversationId: CONV, messageId: MSG, parentToolUseId: 't1', toolUseId: 'inner', name: 'Read', input: { file_path: '/deck.pptx' } },
    ]);
    expect(state.parts).toEqual([{ type: 'tool', toolUseId: 'inner', name: 'Read', input: { file_path: '/deck.pptx' }, status: 'running', parentToolUseId: 't1' }]);
  });

  test('a subagent tool result carries what it returned and resolves the child part', () => {
    const { state, events } = run([subagentToolUse, subagentToolResult]);

    expect(events.at(-1)).toEqual({
      type: 'subagent-tool-result',
      conversationId: CONV,
      messageId: MSG,
      parentToolUseId: 't1',
      toolUseId: 'inner',
      isError: false,
      result: 'forty pages of slides',
    });
    expect(state.parts).toEqual([
      { type: 'tool', toolUseId: 'inner', name: 'Read', input: { file_path: '/deck.pptx' }, status: 'done', result: 'forty pages of slides', parentToolUseId: 't1' },
    ]);
  });

  test('a subagent result for a step that never started is ignored', () => {
    const ghost = {
      type: 'user',
      session_id: 's1',
      parent_tool_use_id: 't1',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ghost', content: 'x' }] },
    };
    const { state, events } = run([ghost]);

    expect(events).toEqual([]);
    expect(state.parts).toEqual([]);
  });

  test('a subagent tool that failed says so', () => {
    const failed = {
      type: 'user',
      session_id: 's1',
      parent_tool_use_id: 't1',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'inner', content: 'nope', is_error: true }] },
    };
    const { state, events } = run([subagentToolUse, failed]);

    expect(events.at(-1)).toEqual({ type: 'subagent-tool-result', conversationId: CONV, messageId: MSG, parentToolUseId: 't1', toolUseId: 'inner', isError: true, result: 'nope' });
    expect(state.parts.at(-1)).toMatchObject({ status: 'error', result: 'nope' });
  });

  test('a subagent text delta is still not shown: its narration is a second conversation', () => {
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

  test("a subagent's own result message does not end the outer turn", () => {
    const nested = { type: 'result', subtype: 'success', session_id: 's1', parent_tool_use_id: 't1', usage: { input_tokens: 5, output_tokens: 5 } };
    const { state, events } = run([nested]);

    expect(events).toEqual([]);
    expect(state.done).toBe(false);
  });

  test('a malformed subagent message is ignored rather than crashing the turn', () => {
    expect(run([{ type: 'assistant', parent_tool_use_id: 't1', message: 'not an object' }]).events).toEqual([]);
  });

  test('a subagent message whose content is not a list is ignored', () => {
    expect(run([{ type: 'assistant', parent_tool_use_id: 't1', message: { role: 'assistant', content: 'nope' } }]).events).toEqual([]);
  });

  test('a subagent message that is neither a reply nor a tool result is ignored', () => {
    // A system or result message from the subagent carrying blocks must not be read as
    // if it were the subagent using a tool.
    const nested = { type: 'system', parent_tool_use_id: 't1', message: { role: 'system', content: [{ type: 'tool_result', tool_use_id: 'inner' }] } };

    expect(run([nested]).events).toEqual([]);
  });

  test('a subagent tool call missing its id is skipped', () => {
    const nested = { type: 'assistant', parent_tool_use_id: 't1', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read' }, 'junk'] } };

    expect(run([nested]).events).toEqual([]);
  });

  test('a subagent tool call missing its name is skipped', () => {
    const nested = { type: 'assistant', parent_tool_use_id: 't1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'inner' }] } };

    expect(run([nested]).events).toEqual([]);
  });

  test('only tool_use blocks count as subagent steps', () => {
    // A text block can carry an id and a name of its own; reading it as a step would
    // invent work the subagent never did.
    const nested = {
      type: 'assistant',
      parent_tool_use_id: 't1',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', id: 'not-a-step', name: 'Read', text: 'thinking' },
          { type: 'tool_use', id: 'inner', name: 'Read', input: {} },
        ],
      },
    };

    expect(run([nested]).events.map((e) => (e.type === 'subagent-tool-start' ? e.toolUseId : e.type))).toEqual(['inner']);
  });

  test('only tool_result blocks resolve a subagent step', () => {
    const nested = {
      type: 'user',
      parent_tool_use_id: 't1',
      message: {
        role: 'user',
        content: [
          { type: 'text', tool_use_id: 'not-a-step', text: 'chatter' },
          { type: 'tool_result', tool_use_id: 'inner' },
        ],
      },
    };

    expect(run([subagentToolUse, nested]).events.map((e) => (e.type === 'subagent-tool-result' ? e.toolUseId : e.type))).toEqual(['subagent-tool-start', 'inner']);
  });

  test('a subagent tool result missing its id is skipped', () => {
    const nested = { type: 'user', parent_tool_use_id: 't1', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } };

    expect(run([nested]).events).toEqual([]);
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

  test('a failed turn shows what the sdk actually said went wrong', () => {
    const { events } = run([result({ subtype: 'error_during_execution', is_error: true, result: 'the model refused' })]);

    expect(events.at(-1)).toEqual({ type: 'error', conversationId: CONV, message: 'the model refused' });
  });

  test('a failed turn with no detail names its subtype rather than saying nothing', () => {
    const { events } = run([result({ subtype: 'error_max_turns', is_error: true })]);

    expect(events.at(-1)).toEqual({ type: 'error', conversationId: CONV, message: 'error_max_turns' });
  });

  test('a failure with neither detail nor subtype still says something', () => {
    const { events } = run([{ type: 'result', is_error: true, session_id: 's1', parent_tool_use_id: null }]);

    expect(events.at(-1)).toEqual({ type: 'error', conversationId: CONV, message: 'the turn failed' });
  });

  test('a result marked success but with a non-success subtype is still treated as a failure', () => {
    // is_error and subtype can disagree; the safer read is that the turn did not
    // finish cleanly, rather than reporting a clean turn that never happened.
    const { events } = run([result({ subtype: 'error_during_execution', is_error: false })]);

    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });

  test('a finished turn keeps the session id it was given', () => {
    const { state } = run([result({ session_id: 'sess_final' })]);

    expect(state.sdkSessionId).toBe('sess_final');
  });

  test('a result with no session id does not wipe the one the system message gave', () => {
    // Load-bearing for resume: losing it here means the next turn starts a new session
    // and the conversation silently forgets everything.
    const { state } = run([{ type: 'system', subtype: 'init', session_id: 'sess_early' }, result({ session_id: undefined })]);

    expect(state.sdkSessionId).toBe('sess_early');
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

describe('reading only the blocks that mean something', () => {
  test('a text block carrying an id and a name is not folded as a tool call', () => {
    // Blocks share a shape; only `type` says what one is. Trusting id+name alone would
    // put a card in the transcript for something the agent never ran.
    const assistant = {
      type: 'assistant',
      session_id: 's1',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', id: 'not-a-tool', name: 'Bash', text: 'about to look' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
        ],
      },
    };
    const { state } = run([assistant]);

    expect(state.parts).toEqual([{ type: 'tool', toolUseId: 't1', name: 'Bash', input: {}, status: 'running' }]);
  });

  test('a text block carrying a tool_use_id does not resolve a running tool', () => {
    const user = {
      type: 'user',
      session_id: 's1',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'text', tool_use_id: 't1', text: 'chatter' }] },
    };
    const { state, events } = run([assistantToolUse('t1', 'Bash', {}), user]);

    expect(events).toHaveLength(1);
    expect(state.parts[0]).toMatchObject({ status: 'running' });
  });
});
