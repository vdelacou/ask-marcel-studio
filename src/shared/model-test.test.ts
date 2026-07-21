import { describe, expect, test } from 'bun:test';
import { ANTHROPIC_API, ANTHROPIC_VERSION, buildModelTestRequest, checkTarget, parseModelTestTarget, TOO_SLOW, UNREACHABLE, verdictForStatus } from './model-test.ts';
import type { ModelTestOutcome, ModelTestTarget } from './model-test.ts';

const anthropic = (patch: Partial<ModelTestTarget> = {}): ModelTestTarget => ({ kind: 'anthropic', apiKey: 'sk-test', modelId: 'claude-opus-4-8', ...patch });
const openai = (patch: Partial<ModelTestTarget> = {}): ModelTestTarget => ({
  kind: 'openai',
  baseUrl: 'http://127.0.0.1:1234/v1',
  apiKey: 'sk-test',
  modelId: 'local-model',
  ...patch,
});

describe('addressing the provider the way a real turn would', () => {
  test('an anthropic provider with no base url goes to the real api', () => {
    expect(buildModelTestRequest(anthropic()).url).toBe(`${ANTHROPIC_API}/v1/messages`);
  });

  test('a base url pasted with the /v1 already on it does not end up doubled', () => {
    expect(buildModelTestRequest(anthropic({ baseUrl: 'https://proxy.example.com/v1' })).url).toBe('https://proxy.example.com/v1/messages');
  });

  test('a trailing slash on the base url is not a second slash in the path', () => {
    expect(buildModelTestRequest(anthropic({ baseUrl: 'https://proxy.example.com/' })).url).toBe('https://proxy.example.com/v1/messages');
  });

  test('a base url of only spaces counts as none at all', () => {
    expect(buildModelTestRequest(anthropic({ baseUrl: '   ' })).url).toBe(`${ANTHROPIC_API}/v1/messages`);
  });

  test('anthropic authenticates with the key header and states the api version', () => {
    expect(buildModelTestRequest(anthropic()).headers).toEqual({ 'content-type': 'application/json', 'x-api-key': 'sk-test', 'anthropic-version': ANTHROPIC_VERSION });
  });

  test('an openai-compatible provider is asked at the completions path its own base url implies', () => {
    // Kept whole, /v1 and all: this is the url the gateway hands to the AI SDK, and
    // these endpoints disagree about whether it belongs.
    expect(buildModelTestRequest(openai()).url).toBe('http://127.0.0.1:1234/v1/chat/completions');
  });

  test('trailing slashes on an openai base url do not double up', () => {
    expect(buildModelTestRequest(openai({ baseUrl: 'http://127.0.0.1:1234/v1//' })).url).toBe('http://127.0.0.1:1234/v1/chat/completions');
  });

  test('openai-compatible authenticates with a bearer token', () => {
    expect(buildModelTestRequest(openai()).headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer sk-test' });
  });

  test('the body names the model and asks for one token', () => {
    expect(JSON.parse(buildModelTestRequest(anthropic({ modelId: 'claude-haiku-4-5' })).body)).toEqual({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  });

  test('both kinds send the same body, so only the address and the key differ', () => {
    expect(buildModelTestRequest(openai({ modelId: 'x' })).body).toBe(buildModelTestRequest(anthropic({ modelId: 'x' })).body);
  });
});

describe('saying what is missing before anything is sent', () => {
  test('a filled-in provider has nothing missing', () => {
    expect(checkTarget(anthropic())).toBeUndefined();
    expect(checkTarget(openai())).toBeUndefined();
  });

  test('an unnamed model is the first thing to say', () => {
    expect(checkTarget(anthropic({ modelId: '  ' }))?.outcome).toBe('model-unknown');
  });

  test('a missing key is named as a key, not as a refusal from the provider', () => {
    expect(checkTarget(anthropic({ apiKey: '' }))).toEqual({ outcome: 'key-refused', message: 'Add the key first.' });
  });

  test('an openai provider with no address cannot be reached', () => {
    expect(checkTarget(openai({ baseUrl: '' }))?.outcome).toBe('unreachable');
    expect(checkTarget(openai({ baseUrl: undefined }))?.outcome).toBe('unreachable');
  });

  test('an anthropic provider needs no address, because it has a default', () => {
    expect(checkTarget(anthropic({ baseUrl: '' }))).toBeUndefined();
  });
});

describe('reading the answer', () => {
  test.each<readonly [number, ModelTestOutcome]>([
    [200, 'works'],
    [201, 'works'],
    [299, 'works'],
    [400, 'model-unknown'],
    [401, 'key-refused'],
    [403, 'key-refused'],
    [404, 'model-unknown'],
    [429, 'busy'],
    [500, 'provider-error'],
    [529, 'provider-error'],
    [199, 'provider-error'],
    [300, 'provider-error'],
  ])('%i reads as %s', (status, outcome) => {
    expect(verdictForStatus(status).outcome).toBe(outcome);
  });

  test('an unexpected status still says what came back, so it can be reported', () => {
    expect(verdictForStatus(418).message).toBe('The provider answered with an error (418).');
  });

  test('every verdict says something a person can act on', () => {
    const messages = [200, 401, 404, 429, 500].map((status) => verdictForStatus(status).message);

    expect(messages.every((message) => message.length > 10)).toBe(true);
    expect(UNREACHABLE.message.length).toBeGreaterThan(10);
    expect(TOO_SLOW.message.length).toBeGreaterThan(10);
  });

  test('not reaching the provider at all is its own answer, and so is being ignored', () => {
    expect(UNREACHABLE.outcome).toBe('unreachable');
    expect(TOO_SLOW.outcome).toBe('unreachable');
    expect(TOO_SLOW.message).not.toBe(UNREACHABLE.message);
  });
});

describe('reading what the renderer sent', () => {
  test('a complete target comes through as it was sent', () => {
    expect(parseModelTestTarget({ kind: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', modelId: 'm' })).toEqual({
      kind: 'openai',
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      modelId: 'm',
    });
  });

  test('anything but the openai kind is the anthropic one', () => {
    expect(parseModelTestTarget({ kind: 'nonsense' }).kind).toBe('anthropic');
    expect(parseModelTestTarget({ kind: 'anthropic' }).kind).toBe('anthropic');
  });

  test('fields that are not text read as missing, which checkTarget then names', () => {
    const target = parseModelTestTarget({ kind: 'anthropic', apiKey: 42, modelId: null, baseUrl: {} });

    expect(target).toEqual({ kind: 'anthropic', baseUrl: '', apiKey: '', modelId: '' });
    expect(checkTarget(target)?.outcome).toBe('model-unknown');
  });

  test('nothing at all is still a target, and still says what is missing', () => {
    expect(checkTarget(parseModelTestTarget(undefined))).toBeDefined();
    expect(checkTarget(parseModelTestTarget('a string'))).toBeDefined();
  });
});
