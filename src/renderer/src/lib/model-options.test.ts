import { describe, expect, test } from 'bun:test';
import { modelOptions, modelOptionsFromDrafts, providerSummary } from './model-options.ts';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import type { Provider } from '../../../shared/types.ts';

const draft = (patch: Partial<ProviderDraft>): ProviderDraft => ({
  rowId: 'row-1',
  id: 'anthropic',
  kind: 'anthropic',
  label: 'Anthropic',
  baseUrl: '',
  apiKey: 'sk-live',
  modelIds: ['claude-fable-5'],
  ...patch,
});

describe('listing every model a conversation could use', () => {
  test('a saved provider contributes one option per model, addressed the way the runtime resolves it', () => {
    const providers: readonly Provider[] = [{ id: 'anthropic', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk', modelIds: ['claude-fable-5', 'claude-haiku-4-5'] }];

    expect(modelOptions(providers)).toEqual([
      { value: 'anthropic::claude-fable-5', label: 'Anthropic · claude-fable-5' },
      { value: 'anthropic::claude-haiku-4-5', label: 'Anthropic · claude-haiku-4-5' },
    ]);
  });

  test('models from several providers are one flat list, in the order the providers are arranged', () => {
    const providers: readonly Provider[] = [
      { id: 'anthropic', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk', modelIds: ['claude-fable-5'] },
      { id: 'local', kind: 'openai', label: 'Local', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'x', modelIds: ['qwen'] },
    ];

    expect(modelOptions(providers).map((o) => o.value)).toEqual(['anthropic::claude-fable-5', 'local::qwen']);
  });

  test('a provider with no models contributes nothing', () => {
    expect(modelOptions([{ id: 'anthropic', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk', modelIds: [] }])).toEqual([]);
  });

  test('a draft that has never been saved has no id, so its models cannot be addressed and are left out', () => {
    expect(modelOptionsFromDrafts([draft({ id: '', modelIds: ['claude-fable-5'] })])).toEqual([]);
  });

  test('an id that is only whitespace is treated as absent', () => {
    expect(modelOptionsFromDrafts([draft({ id: '  ', modelIds: ['claude-fable-5'] })])).toEqual([]);
  });

  test('the blank row an in-progress edit leaves behind is not offered as a model', () => {
    expect(modelOptionsFromDrafts([draft({ modelIds: ['claude-fable-5', '', '  '] })]).map((o) => o.value)).toEqual(['anthropic::claude-fable-5']);
  });

  test('model ids and labels are trimmed, so a pasted name does not show its whitespace', () => {
    expect(modelOptionsFromDrafts([draft({ label: ' Anthropic ', modelIds: [' claude-fable-5 '] })])).toEqual([
      { value: 'anthropic::claude-fable-5', label: 'Anthropic · claude-fable-5' },
    ]);
  });

  test('the same model listed twice under one provider is offered once', () => {
    expect(modelOptionsFromDrafts([draft({ modelIds: ['claude-fable-5', 'claude-fable-5'] })])).toHaveLength(1);
  });

  test('nothing configured yields nothing to pick', () => {
    expect(modelOptionsFromDrafts([])).toEqual([]);
  });
});

describe('what a collapsed provider row says about itself', () => {
  test('it counts the models it would actually offer', () => {
    expect(providerSummary(draft({ modelIds: ['a', '', 'b'] })).modelCount).toBe(2);
  });

  test('a provider with a key says so', () => {
    expect(providerSummary(draft({ apiKey: 'sk-live' })).hasKey).toBe(true);
  });

  test('a key of only whitespace counts as missing, because it is', () => {
    expect(providerSummary(draft({ apiKey: '   ' })).hasKey).toBe(false);
  });
});
