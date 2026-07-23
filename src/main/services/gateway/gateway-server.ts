/*
 * A loopback endpoint that speaks Anthropic and calls an OpenAI-compatible provider.
 *
 * The agent subprocess gets ANTHROPIC_BASE_URL=http://127.0.0.1:<port> and never knows
 * it is not talking to Anthropic. The IO shell: every mapping decision lives in the
 * pure translators under src/shared/gateway.
 *
 * Security posture (risk R9, accepted for a local single-user app): bound to 127.0.0.1
 * only, an OS-assigned port so nothing collides, and a per-app-run random key compared
 * in constant time. Any local process could still reach it if it knew the key, which is
 * why the key never leaves this process except into the agent's own environment.
 *
 * Routes are what the SDK ACTUALLY calls, learned by watching it (M2 recon):
 *   HEAD /                  a reachability probe, before anything else
 *   POST /v1/messages       with a ?beta=true query string, so match the PATH not the url
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, jsonSchema, streamText, tool } from 'ai';
import type { ModelMessage, ToolSet } from 'ai';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { encodeSse } from '../../../shared/gateway/anthropic-sse.ts';
import { emptyStream, translatePart } from '../../../shared/gateway/translate-stream.ts';
import { sanitiseToolSchema } from '../../../shared/gateway/sanitise-tool-schema.ts';
import { noSignatures, rememberSignature, signAssistantTurns } from '../../../shared/gateway/thought-signatures.ts';
import type { ThoughtSignatures } from '../../../shared/gateway/thought-signatures.ts';
import { translateRequest } from '../../../shared/gateway/translate-request.ts';
import type { TranslatedRequest } from '../../../shared/gateway/translate-request.ts';
import { parseModelRef } from '../../../shared/model-ref.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { Provider } from '../../../shared/types.ts';

// The gateway is reached only by an openai-kind provider (session-env points the agent here
// for those alone), and only that kind carries the baseUrl an upstream call needs.
type OpenAiProvider = Extract<Provider, { readonly kind: 'openai' }>;

// Exactly what the SDK's own FetchFunction is. Named here so a test can build a stand-in
// against it without reaching into an SDK internal for the type.
export type FetchLike = typeof globalThis.fetch;

export type GatewayDeps = {
  // Looked up per request rather than captured once: the user can change a key in
  // settings while the gateway is up, and the next turn must use the new one.
  readonly findProvider: (providerId: string) => Promise<Provider | undefined>;
  // The adapter's test seam. Production leaves it out and the SDK uses global fetch; a test
  // passes its own and reads what actually went upstream, which is the only way to prove the
  // url, the auth header and the tool schemas without a network call.
  readonly fetch?: FetchLike;
  // Overridden only by a test, which cannot wait two minutes to prove a stall is caught.
  readonly silenceMs?: number;
};

export type Gateway = {
  // Starts on first use and returns the same address after: the port is only known
  // once the OS assigns it.
  readonly start: () => Promise<{ readonly baseUrl: string; readonly apiKey: string }>;
  readonly stop: () => Promise<void>;
};

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

// Constant time, and length-safe: timingSafeEqual throws on a length mismatch, which
// would itself leak the length.
const keyMatches = (expected: string, given: string | undefined): boolean => {
  if (given === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const presentedKey = (req: IncomingMessage): string | undefined => {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string') return header;
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
};

const sendError = (res: ServerResponse, status: number, type: string, message: string): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  // The Anthropic error envelope, because that is what the SDK parses.
  res.end(JSON.stringify({ type: 'error', error: { type, message } }));
};

// Declared with ai's own tool() and NO execute: the agent runs its own tools, so the
// gateway passes the schema through only, and hands whatever the model asks for back
// to the agent as a tool_use block.
//
// Sanitised on the way past, because the schema is no longer going somewhere that ignores
// what it does not recognise. Gemini refuses an unknown JSON Schema keyword outright and
// fails the whole request, and every turn in this app carries tools.
const toolsFor = (request: TranslatedRequest): ToolSet => {
  const tools: ToolSet = {};
  for (const spec of request.tools) {
    tools[spec.name] = tool({ description: spec.description, inputSchema: jsonSchema(sanitiseToolSchema(spec.inputSchema) as Parameters<typeof jsonSchema>[0]) });
  }
  return tools;
};

// How long the upstream may say nothing: between two parts of a stream, or in total for a
// single-shot answer, which has no parts to wait between. A long answer is legitimate and
// keeps resetting this; what it catches is silence. Without it a provider that accepts the
// connection and then stalls holds the turn open forever, and the user's only way out is
// killing the app.
const UPSTREAM_SILENCE_MS = 120_000;

// The agent hanging up has to reach the upstream. Without this, pressing Stop abandons the
// response while the provider carries on generating, and charging for it.
const abortOnHangup = (res: ServerResponse): AbortController => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller;
};

// Restarted by every part that arrives, so the deadline is on silence rather than on the
// length of the answer.
const silenceWatchdog = (giveUp: () => void, ms: number): { readonly heard: () => void; readonly stop: () => void } => {
  let timer = setTimeout(giveUp, ms);
  const stop = (): void => {
    clearTimeout(timer);
  };
  return {
    heard: () => {
      stop();
      timer = setTimeout(giveUp, ms);
    },
    stop,
  };
};

export const createGateway = (deps: GatewayDeps): Gateway => {
  const apiKey = crypto.randomUUID();
  let server: Server | undefined;
  let baseUrl: string | undefined;
  // Gemini's thought signatures, which reach this process on the upstream answer and are
  // dropped by the Anthropic wire on the way to the agent. Bounded inside the module, and
  // gone when the app is: a resumed conversation falls back to the documented dummy rather
  // than to a failed turn.
  let signatures: ThoughtSignatures = noSignatures;

  const resolve = async (modelRef: string): Promise<{ provider: OpenAiProvider; modelId: string } | undefined> => {
    const parsed = parseModelRef(modelRef);
    if (!parsed.ok) return undefined;
    const provider = await deps.findProvider(parsed.value.providerId);
    // An anthropic provider has no business here and carries no baseUrl. Left through, it
    // would reach the upstream client with none, which silently defaults to OpenAI's own
    // address and posts the user's key to a company they never configured.
    if (provider === undefined || provider.kind !== 'openai') return undefined;
    return { provider, modelId: parsed.value.modelId };
  };

  // Built with explicit optional properties rather than conditional spreads: ai's
  // Prompt is a union ({prompt, messages?: never} | {messages, prompt?: never}), and a
  // spread-built object types as a union that matches neither branch.
  const callOptions = (
    provider: OpenAiProvider,
    modelId: string,
    request: TranslatedRequest,
    abortSignal: AbortSignal
  ): {
    model: ReturnType<ReturnType<typeof createOpenAICompatible>['chatModel']>;
    messages: ModelMessage[];
    allowSystemInMessages: true;
    system: string | undefined;
    tools: ToolSet | undefined;
    maxOutputTokens: number | undefined;
    abortSignal: AbortSignal;
  } => ({
    // openai-compatible, not @ai-sdk/openai, because the strict one is built for OpenAI
    // itself: it requires `index` on every streaming tool_call delta, and Google does not
    // send one, so each Gemini tool call failed chunk validation and vanished with no error
    // at all. This provider makes that field optional and carries Gemini's thought
    // signatures, at the cost of nothing for the endpoints that were already working.
    model: createOpenAICompatible({ name: provider.id, baseURL: provider.baseUrl, apiKey: provider.apiKey, ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) }).chatModel(
      modelId
    ),
    messages: signAssistantTurns(request.messages, signatures, provider.baseUrl) as ModelMessage[],
    // ai defaults this to false, and the SDK really does send system-role messages
    // inside the array. Without it every real turn is rejected before it leaves here.
    allowSystemInMessages: true,
    system: request.system,
    tools: request.tools.length === 0 ? undefined : toolsFor(request),
    maxOutputTokens: request.maxOutputTokens,
    abortSignal,
  });

  const callUpstream = (provider: OpenAiProvider, modelId: string, request: TranslatedRequest, abortSignal: AbortSignal): ReturnType<typeof streamText> =>
    streamText({ ...callOptions(provider, modelId, request, abortSignal), toolChoice: request.toolChoice });

  const streamBack = async (res: ServerResponse, provider: OpenAiProvider, modelId: string, request: TranslatedRequest): Promise<void> => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });

    const messageId = `msg_${crypto.randomUUID()}`;
    let state = emptyStream(messageId, modelId);
    res.write(encodeSse({ type: 'message_start', message: { id: messageId, model: modelId, usage: { input_tokens: 0, output_tokens: 0 } } }));

    const aborter = abortOnHangup(res);
    const watchdog = silenceWatchdog(() => aborter.abort(), deps.silenceMs ?? UPSTREAM_SILENCE_MS);
    try {
      for await (const part of callUpstream(provider, modelId, request, aborter.signal).stream) {
        watchdog.heard();
        // Read before translating: the signature rides on the `tool-call` part, which the
        // translator drops as a duplicate of the input deltas it already relayed.
        signatures = rememberSignature(signatures, part);
        const step = translatePart(state, part);
        state = step.state;
        for (const event of step.events) res.write(encodeSse(event));
      }
    } catch (e) {
      // The stream is already open, so a failure has to go out as an SSE error event.
      // A dropped connection would look to the agent like an empty answer.
      res.write(encodeSse({ type: 'error', error: { type: 'api_error', message: formatError(e) } }));
    }
    watchdog.stop();
    res.end();
  };

  const answerOnce = async (res: ServerResponse, provider: OpenAiProvider, modelId: string, request: TranslatedRequest): Promise<void> => {
    const aborter = abortOnHangup(res);
    // No parts to wait between, so the same budget is the whole answer's.
    const watchdog = silenceWatchdog(() => aborter.abort(), deps.silenceMs ?? UPSTREAM_SILENCE_MS);
    const result = await generateText(callOptions(provider, modelId, request, aborter.signal)).finally(watchdog.stop);
    for (const call of result.toolCalls) signatures = rememberSignature(signatures, call);

    const content = [
      ...(result.text.length === 0 ? [] : [{ type: 'text', text: result.text }]),
      ...result.toolCalls.map((call) => ({ type: 'tool_use', id: call.toolCallId, name: call.toolName, input: call.input })),
    ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model: modelId,
        content,
        stop_reason: result.toolCalls.length > 0 ? 'tool_use' : 'end_turn',
        usage: { input_tokens: result.usage.inputTokens ?? 0, output_tokens: result.usage.outputTokens ?? 0 },
      })
    );
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // The SDK probes this before anything else; a 404 here and it never tries again.
    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (!keyMatches(apiKey, presentedKey(req))) return sendError(res, 401, 'authentication_error', 'invalid x-api-key');

    // Matched on the PATH: the SDK appends ?beta=true, so a url comparison never hits.
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (req.method !== 'POST' || path !== '/v1/messages') return sendError(res, 404, 'not_found_error', `no route for ${req.method ?? '?'} ${path}`);

    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return sendError(res, 400, 'invalid_request_error', `body is not json: ${formatError(e)}`);
    }

    const request = translateRequest(parsed);
    if (!request.ok) return sendError(res, 400, 'invalid_request_error', request.error.message);

    const resolved = await resolve(request.value.modelRef);
    if (resolved === undefined) return sendError(res, 404, 'not_found_error', `no provider for model ${request.value.modelRef}`);

    if (request.value.stream) return streamBack(res, resolved.provider, resolved.modelId, request.value);
    return answerOnce(res, resolved.provider, resolved.modelId, request.value);
  };

  const start = async (): Promise<{ baseUrl: string; apiKey: string }> => {
    if (server !== undefined && baseUrl !== undefined) return { baseUrl, apiKey };

    const created = createServer((req, res) => {
      void handle(req, res).catch((e: unknown) => {
        // Never let a handler rejection take the whole main process down.
        if (!res.headersSent) sendError(res, 502, 'api_error', formatError(e));
        else res.end();
      });
    });
    // Port 0: the OS picks a free one, so two app instances never collide.
    await new Promise<void>((done) => created.listen(0, '127.0.0.1', done));
    const address = created.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    server = created;
    baseUrl = `http://127.0.0.1:${String(port)}`;
    return { baseUrl, apiKey };
  };

  const stop = async (): Promise<void> => {
    const running = server;
    if (running === undefined) return;
    server = undefined;
    baseUrl = undefined;
    await new Promise<void>((done) => running.close(() => done()));
  };

  return { start, stop };
};
