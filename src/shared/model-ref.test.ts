import { describe, expect, test } from 'bun:test';
import { formatModelRef, modelForNewConversation, modelRefIsConfigured, parseModelRef } from './model-ref.ts';

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

describe('checking a reference against what is set up', () => {
  const providers = [
    { id: 'anthropic', modelIds: ['claude-fable-5', 'claude-haiku-4-5'] },
    { id: 'local', modelIds: ['qwen'] },
  ];

  test('a reference naming a configured model is accepted', () => {
    expect(modelRefIsConfigured(providers, 'anthropic::claude-haiku-4-5')).toBe(true);
  });

  test('a reference to a provider that is not there is refused', () => {
    expect(modelRefIsConfigured(providers, 'openai::gpt-5')).toBe(false);
  });

  test('a reference to a model the provider does not offer is refused', () => {
    // The provider survived a settings edit; the model did not.
    expect(modelRefIsConfigured(providers, 'anthropic::claude-2')).toBe(false);
  });

  test('a reference that is not a reference at all is refused', () => {
    expect(modelRefIsConfigured(providers, 'claude-fable-5')).toBe(false);
  });

  test('nothing configured accepts nothing', () => {
    expect(modelRefIsConfigured([], 'anthropic::claude-fable-5')).toBe(false);
  });
});

describe('picking the model a new conversation opens on', () => {
  const providers = [
    { id: 'anthropic', modelIds: ['claude-fable-5', 'claude-haiku-4-5'] },
    { id: 'google', modelIds: ['gemini-3.6-flash'] },
  ];

  test('the model last used is the one the next conversation opens on', () => {
    expect(modelForNewConversation(providers, 'google::gemini-3.6-flash')).toBe('google::gemini-3.6-flash');
  });

  test('having used none yet, the first model configured is the one', () => {
    expect(modelForNewConversation(providers, undefined)).toBe('anthropic::claude-fable-5');
  });

  test('a model last used before its provider was removed gives way to the first still configured', () => {
    expect(modelForNewConversation(providers, 'deleted::some-model')).toBe('anthropic::claude-fable-5');
  });

  test('a provider whose models were all deleted is passed over rather than yielding nothing', () => {
    expect(modelForNewConversation([{ id: 'empty', modelIds: [] }, ...providers], undefined)).toBe('anthropic::claude-fable-5');
  });

  test('nothing configured means there is no conversation to open', () => {
    expect(modelForNewConversation([], undefined)).toBeUndefined();
    expect(modelForNewConversation([{ id: 'empty', modelIds: [] }], 'empty::gone')).toBeUndefined();
  });
});
