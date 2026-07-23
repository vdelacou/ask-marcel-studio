/*
 * The Memory settings section: which provider embeds, and its model.
 *
 * Reads the current settings, and saves the memory section back through the same channel
 * as everything else. Standalone rather than folded into the provider-drafts persist,
 * because it changes one field and should not have to rebuild the provider list.
 */
import { useCallback, useEffect, useState } from 'react';
import type { EmbeddingProviderChoice } from '../components/organisms/memory-config-panel/index.tsx';

export type MemoryConfigController = {
  readonly providers: readonly EmbeddingProviderChoice[];
  readonly hasAnthropicOnly: boolean;
  readonly providerId: string;
  readonly embeddingModelId: string;
  readonly isSaving: boolean;
  readonly notice?: string;
  readonly changeProvider: (id: string) => void;
  readonly changeModel: (model: string) => void;
  readonly save: () => void;
};

export const useMemoryConfig = (): MemoryConfigController => {
  const [providers, setProviders] = useState<readonly EmbeddingProviderChoice[]>([]);
  const [hasAnthropicOnly, setHasAnthropicOnly] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [embeddingModelId, setEmbeddingModelId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async (): Promise<void> => {
      const settings = await studio.settings.get();
      if (!settings.ok) return;
      const openai = settings.value.providers.filter((provider) => provider.kind === 'openai').map((provider) => ({ id: provider.id, label: provider.label }));
      setProviders(openai);
      setHasAnthropicOnly(openai.length === 0 && settings.value.providers.length > 0);
      const configured = settings.value.memory;
      setProviderId(configured?.providerId ?? openai[0]?.id ?? '');
      setEmbeddingModelId(configured?.embeddingModelId ?? '');
    })();
  }, []);

  const changeProvider = useCallback((id: string): void => setProviderId(id), []);
  const changeModel = useCallback((model: string): void => setEmbeddingModelId(model), []);

  const save = useCallback((): void => {
    setNotice(undefined);
    setIsSaving(true);
    void (async (): Promise<void> => {
      const settings = await studio.settings.get();
      if (!settings.ok) {
        setIsSaving(false);
        return setNotice(settings.error.message);
      }
      const saved = await studio.settings.save({ ...settings.value, memory: { providerId, embeddingModelId: embeddingModelId.trim() } });
      setIsSaving(false);
      setNotice(saved.ok ? 'Saved. Memory is on.' : saved.error.message);
    })();
  }, [providerId, embeddingModelId]);

  return {
    providers,
    hasAnthropicOnly,
    providerId,
    embeddingModelId,
    isSaving,
    ...(notice === undefined ? {} : { notice }),
    changeProvider,
    changeModel,
    save,
  };
};
