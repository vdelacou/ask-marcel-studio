/*
 * The list of models a conversation can actually be started with.
 *
 * A model is not a top-level entity in settings: it is one entry in one provider's
 * modelIds. Both the settings screen (default model) and the chat header (this
 * conversation's model) need the flattened union of every configured provider's models,
 * addressed the way the runtime addresses them, so the flattening lives here once.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { formatModelRef } from '../../../shared/model-ref.ts';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import type { Provider } from '../../../shared/types.ts';

export type ModelOption = { readonly value: string; readonly label: string };

// Just the two fields a picker needs, so both a saved Provider and an in-progress
// draft can be read by the same function without either type reaching the other.
type ProviderModels = { readonly id: string; readonly label: string; readonly modelIds: readonly string[] };

const optionsOf = (providers: readonly ProviderModels[]): readonly ModelOption[] => {
  const options = new Map<string, ModelOption>();
  for (const provider of providers) {
    const providerId = provider.id.trim();
    // A provider that has never been saved has no id yet, so nothing can address its
    // models: `::gpt-4` is not a reference the runtime can resolve.
    if (providerId.length === 0) continue;
    for (const raw of provider.modelIds) {
      const modelId = raw.trim();
      if (modelId.length === 0) continue;
      const value = formatModelRef({ providerId, modelId });
      // First occurrence wins, so the order the user arranged their providers in is
      // the order the picker shows.
      if (!options.has(value)) options.set(value, { value, label: `${provider.label.trim()} · ${modelId}` });
    }
  }
  return [...options.values()];
};

export const modelOptions = (providers: readonly Provider[]): readonly ModelOption[] => optionsOf(providers);

export const modelOptionsFromDrafts = (drafts: readonly ProviderDraft[]): readonly ModelOption[] => optionsOf(drafts);

// What the collapsed row of the models list shows about a provider without opening it.
export type ProviderSummary = { readonly modelCount: number; readonly hasKey: boolean };

export const providerSummary = (draft: ProviderDraft): ProviderSummary => ({
  modelCount: draft.modelIds.filter((m) => m.trim().length > 0).length,
  hasKey: draft.apiKey.trim().length > 0,
});
