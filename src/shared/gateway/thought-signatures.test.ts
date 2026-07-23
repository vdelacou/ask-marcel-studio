/*
 * The shapes here are the ones the installed packages actually produce, read out of
 * @ai-sdk/openai-compatible 3.0.14 rather than imagined: inbound the signature rides on the
 * `tool-call` stream part under the provider's OWN name, because createOpenAICompatible is
 * given the user's provider id as its name; outbound it has to sit under the hardcoded
 * `google` key, which is the only one convert-to-openai-compatible-chat-messages reads.
 */
import { describe, expect, test } from 'bun:test';
import { DUMMY_SIGNATURE, noSignatures, rememberSignature, signAssistantTurns } from './thought-signatures.ts';
import type { ModelMessage } from './translate-request.ts';
import type { ThoughtSignatures } from './thought-signatures.ts';

// A real signature is a long padded base64 string; short stand-ins are used here because
// nothing in the module reads inside the value.
const SIGNATURE = 'CikBc2lnbmF0dXJl0ClPFkYA==';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

const streamedCall = (id: string, metadata: unknown): unknown => ({ type: 'tool-call', toolCallId: id, toolName: 'Bash', input: { command: 'ls' }, providerMetadata: metadata });

const assistantCalls = (...ids: readonly string[]): ModelMessage => ({
  role: 'assistant',
  content: ids.map((id) => ({ type: 'tool-call', toolCallId: id, toolName: 'Bash', input: { command: 'ls' } })),
});

const optionsOn = (message: ModelMessage | undefined, at = 0): unknown => {
  if (message?.role !== 'assistant') return undefined;
  return (message.content[at] as { readonly providerOptions?: unknown } | undefined)?.providerOptions;
};

const signatureOn = (message: ModelMessage | undefined, at = 0): string | undefined => {
  if (message?.role !== 'assistant') return undefined;
  const part = message.content[at];
  return part?.type === 'tool-call' ? part.providerOptions?.google.thoughtSignature : undefined;
};

const bookWith = (id: string): ThoughtSignatures => rememberSignature(noSignatures, streamedCall(id, { gemini: { thoughtSignature: SIGNATURE } }));

describe('remembering what the model signed', () => {
  test('a streamed tool call is remembered under its own id', () => {
    const signed = signAssistantTurns([assistantCalls('call_1')], bookWith('call_1'), GEMINI_BASE);

    expect(signatureOn(signed[0])).toBe(SIGNATURE);
  });

  test('the namespace the provider files the signature under does not matter', () => {
    const book = rememberSignature(noSignatures, streamedCall('call_1', { 'my-own-gemini': { thoughtSignature: SIGNATURE } }));

    expect(signatureOn(signAssistantTurns([assistantCalls('call_1')], book, GEMINI_BASE)[0])).toBe(SIGNATURE);
  });

  const ignored: ReadonlyArray<{ readonly why: string; readonly part: unknown }> = [
    { why: 'a part that is not a tool call', part: { type: 'text-delta', id: 'text', text: 'hello' } },
    { why: 'a part that is not an object at all', part: 'tool-call' },
    { why: 'a part that is null', part: null },
    { why: 'a tool call carrying no provider metadata', part: streamedCall('call_1', undefined) },
    { why: 'a tool call whose metadata came back null', part: streamedCall('call_1', null) },
    { why: 'a tool call whose metadata holds no signature', part: streamedCall('call_1', { gemini: { acceptedPredictionTokens: 3 } }) },
    { why: 'a tool call whose namespace is not an object', part: streamedCall('call_1', { gemini: 'signed' }) },
    { why: 'a tool call whose signature is empty', part: streamedCall('call_1', { gemini: { thoughtSignature: '' } }) },
    { why: 'a tool call with no id', part: { type: 'tool-call', toolName: 'Bash', providerMetadata: { gemini: { thoughtSignature: SIGNATURE } } } },
    // A tool-result part names a tool call id too, so the part type is what tells them apart.
    { why: 'a tool result naming the same call', part: { type: 'tool-result', toolCallId: 'call_1', providerMetadata: { gemini: { thoughtSignature: SIGNATURE } } } },
  ];
  for (const { why, part } of ignored) {
    test(`${why} leaves the book exactly as it was`, () => {
      expect(rememberSignature(noSignatures, part)).toBe(noSignatures);
    });
  }

  test('the book stays bounded: the oldest call is forgotten and the next oldest is not', () => {
    // 513 distinct calls against a 512 entry book, so exactly one has to go.
    let book = noSignatures;
    for (let n = 0; n < 513; n += 1) book = rememberSignature(book, streamedCall(`call_${String(n)}`, { gemini: { thoughtSignature: `${SIGNATURE}${String(n)}` } }));

    const signed = signAssistantTurns([assistantCalls('call_0'), assistantCalls('call_1'), assistantCalls('call_512')], book, GEMINI_BASE);

    // call_0 is gone, so its step is the unknown one and takes the dummy instead.
    expect(signatureOn(signed[0])).toBe(DUMMY_SIGNATURE);
    expect(signatureOn(signed[1])).toBe(`${SIGNATURE}1`);
    expect(signatureOn(signed[2])).toBe(`${SIGNATURE}512`);
  });
});

describe('putting the signature back on the turn the agent replays', () => {
  test('a step the process never saw is waved through with the dummy Google documents', () => {
    const signed = signAssistantTurns([{ role: 'user', content: [{ type: 'text', text: 'read it' }] }, assistantCalls('call_1')], noSignatures, GEMINI_BASE);

    expect(signatureOn(signed[1])).toBe(DUMMY_SIGNATURE);
  });

  test('every call of an unknown step is waved through, not only the first', () => {
    const signed = signAssistantTurns([assistantCalls('call_1', 'call_2')], noSignatures, GEMINI_BASE);

    expect(signatureOn(signed[0], 1)).toBe(DUMMY_SIGNATURE);
  });

  test('a remembered step keeps the shape the model sent: the calls it left unsigned stay unsigned', () => {
    // Gemini signs the first call of a parallel batch and deliberately leaves the rest bare.
    const signed = signAssistantTurns([assistantCalls('call_1', 'call_2')], bookWith('call_1'), GEMINI_BASE);

    expect(signatureOn(signed[0], 0)).toBe(SIGNATURE);
    // No empty envelope either: an unsigned call goes out with no providerOptions at all.
    expect(optionsOn(signed[0], 1)).toBeUndefined();
  });

  test('only the tool calls are signed: the text the assistant wrote in the same step is not', () => {
    const withText: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'listing it' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'Bash', input: { command: 'ls' } },
      ],
    };

    const signed = signAssistantTurns([withText], noSignatures, GEMINI_BASE)[0];

    expect(optionsOn(signed, 0)).toBeUndefined();
    expect(signatureOn(signed, 1)).toBe(DUMMY_SIGNATURE);
  });

  test('a step that closed before the last user message is an earlier turn, wherever it sits', () => {
    const messages: readonly ModelMessage[] = [assistantCalls('call_1'), { role: 'user', content: [{ type: 'text', text: 'again' }] }, assistantCalls('call_2')];

    const signed = signAssistantTurns(messages, noSignatures, GEMINI_BASE);

    expect(optionsOn(signed[0])).toBeUndefined();
    expect(signatureOn(signed[2])).toBe(DUMMY_SIGNATURE);
  });

  test('an unsigned step from an earlier turn is left alone, because Gemini validates the current turn only', () => {
    const older: readonly ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'first' }] },
      assistantCalls('call_1'),
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'Bash', output: { type: 'text', value: 'ok' } }] },
      { role: 'user', content: [{ type: 'text', text: 'second' }] },
      assistantCalls('call_2'),
    ];

    const signed = signAssistantTurns(older, noSignatures, GEMINI_BASE);

    expect(signatureOn(signed[1])).toBeUndefined();
    expect(signatureOn(signed[4])).toBe(DUMMY_SIGNATURE);
  });

  const untouched: ReadonlyArray<{ readonly why: string; readonly message: ModelMessage }> = [
    { why: 'a system message', message: { role: 'system', content: 'be brief' } },
    { why: 'a user message', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } },
    { why: 'a tool result', message: { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'Bash', output: { type: 'text', value: 'ok' } }] } },
    { why: 'an assistant message that called no tool', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } },
  ];
  for (const { why, message } of untouched) {
    test(`${why} comes back as the very same object`, () => {
      expect(signAssistantTurns([message], noSignatures, GEMINI_BASE)[0]).toBe(message);
    });
  }

  test('the text an assistant wrote alongside its call is carried through untouched', () => {
    const withText: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'listing it' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'Bash', input: { command: 'ls' } },
      ],
    };

    const signed = signAssistantTurns([withText], bookWith('call_1'), GEMINI_BASE)[0];

    expect(signed?.role === 'assistant' ? signed.content[0] : undefined).toEqual({ type: 'text', text: 'listing it' });
    expect(signatureOn(signed, 1)).toBe(SIGNATURE);
  });
});

describe('leaving every endpoint but Google exactly as it was', () => {
  // Every provider of kind openai comes through the same gateway, and extra_content.google
  // is a field only Google asked for. These are the base urls this app is really pointed at.
  const elsewhere: ReadonlyArray<{ readonly why: string; readonly baseUrl: string }> = [
    { why: 'OpenAI itself', baseUrl: 'https://api.openai.com/v1' },
    { why: 'a local llama server', baseUrl: 'http://127.0.0.1:1234/v1' },
    { why: 'an aggregator that also serves Gemini', baseUrl: 'https://openrouter.ai/api/v1' },
    { why: 'a host that only looks like Google', baseUrl: 'https://notgoogleapis.com/v1' },
    { why: 'a base url the user typed wrong', baseUrl: 'generativelanguage.googleapis.com' },
  ];
  for (const { why, baseUrl } of elsewhere) {
    test(`${why} is sent no signature at all, remembered or dummy`, () => {
      const messages = [assistantCalls('call_1')];

      expect(signAssistantTurns(messages, bookWith('call_1'), baseUrl)).toBe(messages);
      expect(signAssistantTurns(messages, noSignatures, baseUrl)).toBe(messages);
    });
  }

  test('Vertex is Google too, so it is signed like the Gemini endpoint', () => {
    const signed = signAssistantTurns(
      [assistantCalls('call_1')],
      bookWith('call_1'),
      'https://europe-west1-aiplatform.googleapis.com/v1/projects/x/locations/europe-west1/endpoints/openapi'
    );

    expect(signatureOn(signed[0])).toBe(SIGNATURE);
  });
});
