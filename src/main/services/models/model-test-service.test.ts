import { describe, expect, test } from 'bun:test';
import { createModelTestService } from './model-test-service.ts';
import type { ModelTestFetch } from './model-test-service.ts';
import type { ModelTestTarget } from '../../../shared/model-test.ts';

type Call = { readonly url: string; readonly method: string; readonly headers: Record<string, string>; readonly body: string; readonly hasDeadline: boolean };

// A hand-written fake (rule 13): it records what was asked and answers with whatever
// the test set up, including by throwing.
const fakeFetch = (answer: { readonly status: number } | Error): { readonly fetch: ModelTestFetch; readonly calls: Call[] } => {
  const calls: Call[] = [];
  const fetch: ModelTestFetch = (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body, hasDeadline: init.signal instanceof AbortSignal });
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { fetch, calls };
};

const target: ModelTestTarget = { kind: 'anthropic', apiKey: 'sk-test', modelId: 'claude-opus-4-8' };

const named = (name: string): Error => {
  const error = new Error(name);
  error.name = name;
  return error;
};

describe('testing one model against its provider', () => {
  test('a provider that answers means the model works', async () => {
    const { fetch } = fakeFetch({ status: 200 });

    expect(await createModelTestService({ fetch }).test(target)).toEqual({ outcome: 'works', message: 'Works. The model answered.' });
  });

  test('the request is a post to the provider, carrying the key', async () => {
    const { fetch, calls } = fakeFetch({ status: 200 });

    await createModelTestService({ fetch }).test(target);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers['x-api-key']).toBe('sk-test');
  });

  test('every call carries a deadline, so a silent endpoint cannot hang the button', async () => {
    const { fetch, calls } = fakeFetch({ status: 200 });

    await createModelTestService({ fetch }).test(target);

    expect(calls[0]?.hasDeadline).toBe(true);
  });

  test('a refused key is reported as a refused key', async () => {
    const { fetch } = fakeFetch({ status: 401 });

    expect((await createModelTestService({ fetch }).test(target)).outcome).toBe('key-refused');
  });

  test('a model the provider does not know is reported as the model', async () => {
    const { fetch } = fakeFetch({ status: 404 });

    expect((await createModelTestService({ fetch }).test(target)).outcome).toBe('model-unknown');
  });

  test('an address that cannot be reached is an answer, not a crash', async () => {
    const { fetch } = fakeFetch(named('TypeError'));

    expect((await createModelTestService({ fetch }).test(target)).outcome).toBe('unreachable');
  });

  test('an endpoint that never answers is told apart from one that refuses to', async () => {
    const timedOut = await createModelTestService({ fetch: fakeFetch(named('TimeoutError')).fetch, timeoutMs: 1 }).test(target);
    const unreachable = await createModelTestService({ fetch: fakeFetch(named('TypeError')).fetch }).test(target);

    expect(timedOut.outcome).toBe('unreachable');
    expect(timedOut.message).not.toBe(unreachable.message);
  });

  test('an aborted call reads as a deadline too', async () => {
    const { fetch } = fakeFetch(named('AbortError'));

    expect((await createModelTestService({ fetch }).test(target)).message).toBe('That address did not answer in time.');
  });

  test('nothing is sent when there is nothing to test yet', async () => {
    const { fetch, calls } = fakeFetch({ status: 200 });

    const verdict = await createModelTestService({ fetch }).test({ ...target, apiKey: '' });

    expect(verdict.outcome).toBe('key-refused');
    expect(calls).toHaveLength(0);
  });

  test('an openai-compatible provider is asked at its own address', async () => {
    const { fetch, calls } = fakeFetch({ status: 200 });

    await createModelTestService({ fetch }).test({ kind: 'openai', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'sk-test', modelId: 'local' });

    expect(calls[0]?.url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(calls[0]?.headers['authorization']).toBe('Bearer sk-test');
  });
});
