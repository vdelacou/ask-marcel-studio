import { describe, expect, test } from 'bun:test';
import { formatModelRef, parseModelRef } from './model-ref.ts';

describe('addressing a model that belongs to a configured provider', () => {
  test('a reference naming an Anthropic provider and one of its models resolves to both parts', () => {
    const parsed = parseModelRef('anthropic-work::claude-opus-4-8');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.providerId).toBe('anthropic-work');
    expect(parsed.value.modelId).toBe('claude-opus-4-8');
  });

  test('a model id containing colons keeps every colon after the first separator', () => {
    // OpenAI-compatible gateways route ids like 'openrouter::meta-llama/llama-3:free'.
    const parsed = parseModelRef('openrouter::meta-llama/llama-3:free');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.providerId).toBe('openrouter');
    expect(parsed.value.modelId).toBe('meta-llama/llama-3:free');
  });

  test('a provider and model chosen in the picker round-trip back to the same reference', () => {
    const reference = formatModelRef({ providerId: 'local-lmstudio', modelId: 'qwen2.5-coder-32b' });

    expect(reference).toBe('local-lmstudio::qwen2.5-coder-32b');

    const parsed = parseModelRef(reference);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ providerId: 'local-lmstudio', modelId: 'qwen2.5-coder-32b' });
  });
});

describe('rejecting a model reference the app cannot route', () => {
  test('a bare model id with no provider is rejected as malformed, naming the expected shape', () => {
    const parsed = parseModelRef('claude-opus-4-8');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('malformed');
    // The message reaches the settings screen, so it is part of the contract.
    expect(parsed.error.message).toBe("model reference must be 'providerId::modelId'");
  });

  test('a reference with no provider before the separator is rejected as malformed', () => {
    const parsed = parseModelRef('::claude-opus-4-8');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('malformed');
  });

  test('a reference with no model after the separator is rejected as malformed, naming the expected shape', () => {
    const parsed = parseModelRef('anthropic-work::');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('malformed');
    expect(parsed.error.message).toBe("model reference must be 'providerId::modelId'");
  });

  test('an empty reference is rejected as malformed', () => {
    const parsed = parseModelRef('');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('malformed');
  });

  test('a single colon is not mistaken for the provider separator', () => {
    const parsed = parseModelRef('anthropic-work:claude-opus-4-8');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('malformed');
  });

  test('the rejected reference is echoed back so the settings screen can name it', () => {
    const parsed = parseModelRef('nonsense');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.reference).toBe('nonsense');
  });
});
