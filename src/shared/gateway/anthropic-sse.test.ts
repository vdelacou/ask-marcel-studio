import { describe, expect, test } from 'bun:test';
import { encodeSse } from './anthropic-sse.ts';

describe('putting an event on the wire the way the sdk parses it', () => {
  test('an event names its type on the event line and repeats it in the data', () => {
    const wire = encodeSse({ type: 'message_stop' });

    // Both halves matter: the client dispatches on `event:` and validates `data.type`.
    expect(wire).toBe('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  });

  test('every frame ends with a blank line, which is what terminates it', () => {
    const wire = encodeSse({ type: 'content_block_stop', index: 0 });

    // Without the double newline the client waits forever and the turn hangs.
    expect(wire.endsWith('\n\n')).toBe(true);
  });

  test('a text delta carries its text', () => {
    const wire = encodeSse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } });

    expect(wire).toBe('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n');
  });

  test('text with newlines does not break the framing', () => {
    // A raw newline in the payload would look like a frame boundary; JSON escapes it.
    const wire = encodeSse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'line one\nline two' } });

    expect(wire.split('\n\n')).toHaveLength(2);
    expect(wire).toContain('line one\\nline two');
  });

  test('a tool_use block starts with empty input, since the arguments stream separately', () => {
    const wire = encodeSse({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'Bash', input: {} } });

    expect(wire).toContain('"type":"tool_use"');
    expect(wire).toContain('"input":{}');
  });

  test('tool arguments go out as partial json', () => {
    const wire = encodeSse({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"a":' } });

    expect(wire).toContain('"partial_json":"{\\"a\\":"');
  });

  test('the closing message_delta carries the stop reason and the output count', () => {
    const wire = encodeSse({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } });

    expect(wire).toContain('"stop_reason":"tool_use"');
    expect(wire).toContain('"output_tokens":7');
  });

  test('an error goes out as its own event rather than a broken stream', () => {
    const wire = encodeSse({ type: 'error', error: { type: 'api_error', message: 'upstream exploded' } });

    expect(wire.startsWith('event: error\n')).toBe(true);
    expect(wire).toContain('upstream exploded');
  });
});
