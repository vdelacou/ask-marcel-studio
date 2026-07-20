import { describe, expect, test } from 'bun:test';
import { assignProviderIds } from './provider-id.ts';
import type { Provider } from './types.ts';

const anthropic = (id: string, label: string): Provider => ({ id, kind: 'anthropic', label, apiKey: 'k', modelIds: [] });
const ids = (providers: readonly Provider[]): string[] => assignProviderIds(providers).map((p) => p.id);

describe('assigning provider ids so the user never types one', () => {
  test('a new provider is given a slug of its label', () => {
    expect(ids([anthropic('', 'Anthropic work')])).toEqual(['anthropic-work']);
  });

  test('a provider that already has an id keeps it untouched, even if the label changed', () => {
    expect(ids([anthropic('anthropic-work', 'Renamed since')])).toEqual(['anthropic-work']);
  });

  test('two new providers with the same label get distinct ids', () => {
    expect(ids([anthropic('', 'Anthropic'), anthropic('', 'Anthropic')])).toEqual(['anthropic', 'anthropic-2']);
  });

  test('a third collision keeps counting up', () => {
    expect(ids([anthropic('', 'X'), anthropic('', 'X'), anthropic('', 'X')])).toEqual(['x', 'x-2', 'x-3']);
  });

  test('a new provider does not collide with an existing id', () => {
    expect(ids([anthropic('anthropic', 'Existing'), anthropic('', 'Anthropic')])).toEqual(['anthropic', 'anthropic-2']);
  });

  test('a blank label falls back to the kind', () => {
    const openai: Provider = { id: '', kind: 'openai', label: '', baseUrl: 'https://x', apiKey: 'k', modelIds: [] };
    expect(ids([openai])).toEqual(['openai']);
  });

  test('a label of only punctuation falls back to the kind', () => {
    expect(ids([anthropic('', '!!!')])).toEqual(['anthropic']);
  });

  test('leading and trailing punctuation is trimmed off the slug', () => {
    expect(ids([anthropic('', '(Anthropic)!')])).toEqual(['anthropic']);
  });

  test('a label containing the reference separator cannot leak it into the id', () => {
    expect(ids([anthropic('', 'a::b')])).toEqual(['a-b']);
  });
});
