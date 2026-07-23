/*
 * What the gateway actually puts on the wire.
 *
 * The translators are covered pure and in depth next door; this covers the wiring they
 * cannot see, which is where a provider swap or a base url mistake goes wrong: the address
 * the upstream call lands on, the key it presents, and the tool schemas it carries. All of
 * it through the deps.fetch seam, so nothing here reaches the network.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createGateway } from './gateway-server.ts';
import type { FetchLike, Gateway } from './gateway-server.ts';
import type { Provider } from '../../../shared/types.ts';

const GEMINI: Provider = {
  id: 'gemini',
  kind: 'openai',
  label: 'Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  apiKey: 'google-key',
  modelIds: ['gemini-3.6-flash'],
};

// One OpenAI-shaped answer, enough for generateText to complete a turn.
const ANSWER = {
  id: 'chatcmpl-1',
  created: 1,
  model: 'gemini-3.6-flash',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

type Sent = { readonly url: string; readonly headers: Headers; readonly body: Record<string, unknown> };

// Bun's `fetch` type carries a `preconnect` alongside the call itself. Neither the gateway
// nor the SDK ever reaches for it, but a stand-in has to have one to BE a fetch, so it is
// supplied here rather than the seam being typed as something narrower than the real thing.
const asFetch = (send: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>): FetchLike => Object.assign(send, { preconnect: (): void => undefined });

const recorder = (): { readonly sent: Sent[]; readonly fetch: FetchLike } => {
  const sent: Sent[] = [];
  const fetch = asFetch(async (input, init) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { sent, fetch };
};

// A tool carrying exactly what Gemini refuses, so the assertion is about this gateway and
// not about the sanitiser's own unit tests.
const TOOL = {
  name: 'Read',
  description: 'Reads a file',
  input_schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: { path: { type: 'string' }, limit: { type: 'number', exclusiveMinimum: 0 } },
  },
};

let running: Gateway | undefined;

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

const ask = async (provider: Provider | undefined, body: Record<string, unknown>): Promise<{ readonly status: number; readonly sent: Sent[] }> => {
  const { sent, fetch } = recorder();
  const gateway = createGateway({ findProvider: async () => provider, fetch });
  running = gateway;
  const address = await gateway.start();
  const response = await globalThis.fetch(`${address.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': address.apiKey },
    body: JSON.stringify(body),
  });
  return { status: response.status, sent };
};

const turn = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  model: 'gemini::gemini-3.6-flash',
  max_tokens: 64,
  messages: [{ role: 'user', content: 'hello' }],
  ...extra,
});

describe('sending a turn upstream to a configured provider', () => {
  test('the call lands on the provider address, with the provider key, not the loopback one', async () => {
    const { status, sent } = await ask(GEMINI, turn());

    expect(status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer google-key');
  });

  test('the model asked for is the one after the provider id, not the whole reference', async () => {
    const { sent } = await ask(GEMINI, turn());

    expect(sent[0]?.body['model']).toBe('gemini-3.6-flash');
  });

  test('a tool goes out carrying nothing Gemini would refuse the whole request over', async () => {
    const { sent } = await ask(GEMINI, turn({ tools: [TOOL] }));

    const tools = JSON.stringify(sent[0]?.body['tools']);
    expect(tools).not.toContain('$schema');
    expect(tools).not.toContain('additionalProperties');
    expect(tools).not.toContain('exclusiveMinimum');
    // Still describes the tool it started as, rather than having been emptied.
    expect(tools).toContain('Read');
    expect(tools).toContain('path');
  });

  test('an anthropic provider is refused rather than posted to a default address', async () => {
    const anthropic: Provider = { id: 'gemini', kind: 'anthropic', label: 'Claude', apiKey: 'sk-ant', modelIds: ['x'] };

    const { status, sent } = await ask(anthropic, turn());

    expect(status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  test('a model naming no configured provider is refused', async () => {
    const { status, sent } = await ask(undefined, turn());

    expect(status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});

// Google omits `index` on streaming tool_call deltas, and @ai-sdk/openai declares it
// required. Verified by running this exact fixture against the old provider: the chunk fails
// zod validation, the tool call never reaches the agent, and the turn ends on a raw "Type
// validation failed" dump of the whole payload. This is that wire shape.
const GEMINI_TOOL_STREAM = [
  '{"id":"1","created":1,"model":"gemini-3.6-flash","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"Read","arguments":"{\\"path\\":\\"/notes/x.md\\"}"}}]},"finish_reason":null}]}',
  '{"id":"1","created":1,"model":"gemini-3.6-flash","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
  '[DONE]',
]
  .map((chunk) => `data: ${chunk}\n\n`)
  .join('');

describe('relaying a streamed tool call back to the agent', () => {
  test('a tool call that arrives without an index still reaches the agent', async () => {
    const streaming = asFetch(async () => new Response(GEMINI_TOOL_STREAM, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const gateway = createGateway({ findProvider: async () => GEMINI, fetch: streaming });
    running = gateway;
    const address = await gateway.start();

    const response = await globalThis.fetch(`${address.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': address.apiKey },
      body: JSON.stringify(turn({ stream: true, tools: [TOOL] })),
    });
    const relayed = await response.text();

    expect(relayed).toContain('"type":"tool_use"');
    expect(relayed).toContain('"name":"Read"');
    expect(relayed).toContain('call_1');
    expect(relayed).toContain('/notes/x.md');
    // And the turn is reported as ending because a tool was called, not as simply over.
    expect(relayed).toContain('"stop_reason":"tool_use"');
  });
});

/*
 * Gemini 3 rejects a turn that replays a function call without the thought signature it
 * minted with it. The signature reaches this process on the upstream answer and has nowhere
 * to live on the Anthropic wire, so what these cover is the only thing that can carry it:
 * the gateway remembering it across two requests on ONE server.
 */
const SIGNATURE = 'CikBc2lnbmF0dXJl0ClPFkYA==';

const signedCall = { id: 'call_1', type: 'function', extra_content: { google: { thought_signature: SIGNATURE } }, function: { name: 'Read', arguments: '{"path":"/notes/x.md"}' } };

const CALLED = {
  id: 'chatcmpl-2',
  created: 1,
  model: 'gemini-3.6-flash',
  choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [signedCall] }, finish_reason: 'tool_calls' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const SIGNED_TOOL_STREAM = [
  `{"id":"1","created":1,"model":"gemini-3.6-flash","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","extra_content":{"google":{"thought_signature":"${SIGNATURE}"}},"function":{"name":"Read","arguments":"{\\"path\\":\\"/notes/x.md\\"}"}}]},"finish_reason":null}]}`,
  '{"id":"1","created":1,"model":"gemini-3.6-flash","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
  '[DONE]',
]
  .map((chunk) => `data: ${chunk}\n\n`)
  .join('');

// The turn that comes back after a tool ran: the agent replays its own tool_use, which is
// where a missing signature costs the whole request.
const REPLAY = turn({
  tools: [TOOL],
  messages: [
    { role: 'user', content: 'read it' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'Read', input: { path: '/notes/x.md' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'ok' }] },
  ],
});

// One gateway, several requests, a canned answer each. Anything past the end repeats the
// last one, so a test only writes the answers it cares about.
const conversation = (answers: readonly unknown[], provider: Provider = GEMINI): { readonly sent: Sent[]; readonly send: (body: Record<string, unknown>) => Promise<void> } => {
  const sent: Sent[] = [];
  let at = 0;
  const fetch = asFetch(async (input, init) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const answer = answers[Math.min(at, answers.length - 1)];
    at += 1;
    const streamed = typeof answer === 'string';
    return new Response(streamed ? answer : JSON.stringify(answer), { status: 200, headers: { 'content-type': streamed ? 'text/event-stream' : 'application/json' } });
  });
  const gateway = createGateway({ findProvider: async () => provider, fetch });
  running = gateway;
  const send = async (body: Record<string, unknown>): Promise<void> => {
    const address = await gateway.start();
    const response = await globalThis.fetch(`${address.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': address.apiKey },
      body: JSON.stringify(body),
    });
    // Drained, not discarded: on the streaming path the gateway only reads the upstream
    // answer as this body is pulled, so the next request would otherwise race it.
    await response.text();
  };
  return { sent, send };
};

const signatureSent = (sent: Sent | undefined): unknown => {
  const messages = sent?.body['messages'];
  const assistant = Array.isArray(messages) ? messages.find((message: unknown) => (message as { role?: string }).role === 'assistant') : undefined;
  const calls = (assistant as { tool_calls?: readonly unknown[] } | undefined)?.tool_calls;
  return (calls?.[0] as { extra_content?: { google?: { thought_signature?: unknown } } } | undefined)?.extra_content?.google?.thought_signature;
};

describe('carrying a Gemini thought signature across the anthropic round trip', () => {
  test('a signature that arrived on a whole answer goes back out on the call it belongs to', async () => {
    const { sent, send } = conversation([CALLED]);

    await send(turn({ tools: [TOOL] }));
    await send(REPLAY);

    expect(sent).toHaveLength(2);
    expect(signatureSent(sent[1])).toBe(SIGNATURE);
  });

  test('a signature that arrived on a streamed answer is carried the same way', async () => {
    const { sent, send } = conversation([SIGNED_TOOL_STREAM, CALLED]);

    await send(turn({ stream: true, tools: [TOOL] }));
    await send(REPLAY);

    expect(signatureSent(sent[1])).toBe(SIGNATURE);
  });

  test('a call this process never saw signed still goes out signed, with the dummy Google documents', async () => {
    // No first request: exactly the conversation resumed off disk after a restart.
    const { sent, send } = conversation([CALLED]);

    await send(REPLAY);

    expect(signatureSent(sent[0])).toBe('skip_thought_signature_validator');
  });

  test('a provider that is not Google gets the request it got before any of this existed', async () => {
    // Every openai-kind provider comes through this gateway, and extra_content.google is a
    // field only Google asked for. Same replay, same empty book, different endpoint.
    const openai: Provider = { ...GEMINI, id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' };

    const { sent, send } = conversation([CALLED], openai);
    await send(REPLAY);

    expect(signatureSent(sent[0])).toBeUndefined();
    expect(JSON.stringify(sent[0]?.body)).not.toContain('extra_content');
  });
});

describe('giving up on an upstream that has gone quiet', () => {
  // A provider that accepts the connection and then says nothing is the failure with no
  // floor: without a deadline the turn stays open until the app is killed.
  const mute = (): { readonly fetch: FetchLike; readonly signals: AbortSignal[] } => {
    const signals: AbortSignal[] = [];
    const fetch = asFetch(async (_input, init) => {
      const signal = init?.signal ?? undefined;
      if (signal instanceof AbortSignal) signals.push(signal);
      // Opens, sends a first byte so the response resolves, then never says another word.
      // The abort is wired to the body the way a real fetch wires it, because a stand-in
      // that ignored it would prove the deadline fires and not that anything acts on it.
      const body = new ReadableStream({
        start: (controller) => {
          controller.enqueue(new TextEncoder().encode(': open\n\n'));
          signal?.addEventListener('abort', () => controller.error(new Error('upstream aborted')));
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    return { fetch, signals };
  };

  const askMute = async (body: Record<string, unknown>): Promise<{ readonly status: number; readonly relayed: string; readonly signals: AbortSignal[] }> => {
    const { fetch, signals } = mute();
    const gateway = createGateway({ findProvider: async () => GEMINI, fetch, silenceMs: 50 });
    running = gateway;
    const address = await gateway.start();

    const response = await globalThis.fetch(`${address.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': address.apiKey },
      body: JSON.stringify(body),
    });
    return { status: response.status, relayed: await response.text(), signals };
  };

  test('a streamed turn that stalls is cut off instead of holding the conversation open', async () => {
    const { relayed, signals } = await askMute(turn({ stream: true }));

    expect(signals[0]?.aborted).toBe(true);
    // And the agent is told, rather than being left holding a silent empty answer.
    expect(relayed).toContain('"type":"error"');
  });

  test('a single answer that never arrives is abandoned on the same budget', async () => {
    const { status, signals } = await askMute(turn());

    expect(signals[0]?.aborted).toBe(true);
    expect(status).toBe(502);
  });

  // The other half of the deadline, the agent hanging up, has NO test here and cannot have
  // one under this runner. It rides on `res.on('close')`, which the app gets right because
  // Electron is Node: measured, Node fires req.aborted, res.close, req.close on a client
  // hangup, and Bun fires only req.aborted and req.close. Listening on the request instead
  // would make it testable and wrong, because on a HEALTHY request req.close fires as soon
  // as the body ends, before the response is written, on both runtimes: every good turn
  // would abort itself. So the seam stays on the response and this stays uncovered.
});

describe('guarding the loopback endpoint', () => {
  test('a request without the run key is rejected before any provider is reached', async () => {
    const { sent, fetch } = recorder();
    const gateway = createGateway({ findProvider: async () => GEMINI, fetch });
    running = gateway;
    const address = await gateway.start();

    const response = await globalThis.fetch(`${address.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'wrong' },
      body: JSON.stringify(turn()),
    });

    expect(response.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  test('the reachability probe the SDK sends first is answered', async () => {
    const { fetch } = recorder();
    const gateway = createGateway({ findProvider: async () => GEMINI, fetch });
    running = gateway;
    const address = await gateway.start();

    const response = await globalThis.fetch(address.baseUrl, { method: 'HEAD' });

    expect(response.status).toBe(200);
  });
});
