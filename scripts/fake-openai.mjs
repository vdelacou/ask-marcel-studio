/*
 * A stand-in OpenAI-compatible endpoint, for verifying the gateway without a key.
 *
 * The mirror of scripts/fake-anthropic.mjs: that one stands in for Anthropic so the
 * AGENT can be tested; this one stands in for an OpenAI-compatible provider so the
 * GATEWAY can be. Together they let a full turn run with no credentials anywhere.
 *
 * Speaks OpenAI's chat-completions SSE:
 *   turn 1: some text, then a streamed tool_call  -> finish_reason 'tool_calls'
 *   turn 2 (once it sees a tool role message)     -> text -> finish_reason 'stop'
 */
import { createServer } from 'node:http';

const sse = (res, data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const chunk = (delta, finish = null) => ({
  id: 'chatcmpl-fake',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'qwen2.5',
  choices: [{ index: 0, delta, finish_reason: finish }],
});

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // Stateless: which turn this is comes from the REQUEST, never a counter. A counter
    // leaks across runs and made an earlier probe read as an app bug (see LESSONS).
    const isFirstTurn = !body.includes('"role":"tool"');
    process.stdout.write(`REQ ${isFirstTurn ? 'turn-1 (text + tool_call)' : 'turn-2 (after tool result)'}\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });

    if (isFirstTurn) {
      sse(res, chunk({ role: 'assistant', content: '' }));
      sse(res, chunk({ content: 'Let me ' }));
      sse(res, chunk({ content: 'check that.' }));
      // Tool arguments stream in fragments, the way a real provider sends them.
      sse(res, chunk({ tool_calls: [{ index: 0, id: 'call_fake_1', type: 'function', function: { name: 'Bash', arguments: '' } }] }));
      sse(res, chunk({ tool_calls: [{ index: 0, function: { arguments: '{"command":' } }] }));
      sse(res, chunk({ tool_calls: [{ index: 0, function: { arguments: '"echo GATEWAY_WAS_HERE"}' } }] }));
      sse(res, chunk({}, 'tool_calls'));
    } else {
      sse(res, chunk({ role: 'assistant', content: '' }));
      sse(res, chunk({ content: 'The command printed GATEWAY_WAS_HERE.' }));
      sse(res, chunk({}, 'stop'));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

const port = Number(process.argv[2] ?? 0);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`FAKE_OPENAI_PORT ${server.address().port}\n`);
});
