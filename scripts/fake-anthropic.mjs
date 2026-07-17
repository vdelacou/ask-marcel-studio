/*
 * A stand-in Anthropic endpoint that speaks the real SSE wire protocol.
 *
 * Lets M2 be verified end to end without a live key: streamed text, a tool call the
 * agent actually executes, the tool result going back, and a second turn. Everything
 * except the model itself is the real thing — real SDK, real agent subprocess, real
 * IPC, real renderer.
 *
 * Turn 1: text, then a tool_use (Bash) -> stop_reason tool_use
 * Turn 2: text only -> stop_reason end_turn
 */
import { createServer } from 'node:http';

/** @type {(res: import('node:http').ServerResponse, event: string, data: unknown) => void} */
const sse = (res, event, data) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

/** @type {(res: import('node:http').ServerResponse, chunks: string[]) => void} */
const streamText = (res, chunks) => {
  sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  for (const text of chunks) sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
  sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
};

/** @type {(res: import('node:http').ServerResponse, index: number, id: string, name: string, input: unknown) => void} */
const streamToolUse = (res, index, id, name, input) => {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } });
  // Real servers dribble the arguments out as partial json.
  sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } });
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
};

const server = createServer((req, res) => {
  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // Stateless: which turn this is comes from the REQUEST, not a counter. A counter
    // leaks across runs and retries, which silently made an earlier probe read as an
    // app bug when it was a harness bug.
    const isFirstTurn = !body.includes('tool_result');
    process.stdout.write(`REQ ${isFirstTurn ? 'turn-1 (text + tool_use)' : 'turn-2 (after tool_result)'}\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });

    sse(res, 'message_start', {
      type: 'message_start',
      message: {
        id: `msg_fake_${isFirstTurn ? 1 : 2}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-4-8',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 0 },
      },
    });

    if (isFirstTurn) {
      streamText(res, ['Let me ', 'check that ', 'for you.']);
      streamToolUse(res, 1, 'toolu_fake_1', 'Bash', { command: 'echo MARCEL_WAS_HERE', description: 'probe' });
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } });
    } else {
      streamText(res, ['The command ', 'printed MARCEL_WAS_HERE.']);
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } });
    }

    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
  });
});

const port = Number(process.argv[2] ?? 0);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`FAKE_PORT ${server.address().port}\n`);
});
