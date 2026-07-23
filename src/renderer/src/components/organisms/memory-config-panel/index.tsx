import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { Select } from '../../atoms/select/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';

export type EmbeddingProviderChoice = { readonly id: string; readonly label: string };

// Choosing how the searchable memory embeds. Only OpenAI-compatible providers can, so the
// list is those; Anthropic ones are left out with a word on why.
export type MemoryConfigPanelProps = {
  providers: readonly EmbeddingProviderChoice[];
  hasAnthropicOnly: boolean;
  providerId: string;
  embeddingModelId: string;
  isSaving: boolean;
  notice?: string;
  onChangeProvider: (id: string) => void;
  onChangeModel: (model: string) => void;
  onSave: () => void;
};

export const MemoryConfigPanel: FC<MemoryConfigPanelProps> = ({
  providers,
  hasAnthropicOnly,
  providerId,
  embeddingModelId,
  isSaving,
  notice,
  onChangeProvider,
  onChangeModel,
  onSave,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Memory</h2>
      <p className="text-sm text-ink-muted">
        Marcel remembers facts about your world and searches them when it needs them. To do that it embeds each one, which needs an OpenAI-compatible provider.
      </p>
    </header>

    {providers.length === 0 ? (
      <p className="rounded-panel border border-dashed border-border-subtle p-6 text-sm text-ink-muted">
        {hasAnthropicOnly
          ? 'Your only provider is Anthropic, which has no embeddings. Add an OpenAI-compatible provider (in Models) to turn memory on.'
          : 'Add an OpenAI-compatible provider (in Models) to turn memory on.'}
      </p>
    ) : (
      <>
        <Field label="Provider" htmlFor="memory-provider" hint="Which provider embeds your memories.">
          <Select
            id="memory-provider"
            value={providerId}
            options={providers.map((provider) => ({ value: provider.id, label: provider.label }))}
            onChange={(event) => onChangeProvider(event.target.value)}
          />
        </Field>
        <Field label="Embedding model" htmlFor="memory-model" hint="The provider's embedding model, e.g. gemini-embedding-001 or text-embedding-3-small.">
          <TextInput id="memory-model" value={embeddingModelId} placeholder="gemini-embedding-001" onChange={(event) => onChangeModel(event.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-x-3">
          {notice !== undefined ? <span className="text-xs text-ink-muted">{notice}</span> : <span />}
          <Button onClick={onSave} disabled={isSaving || providerId.length === 0 || embeddingModelId.trim().length === 0}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </>
    )}
  </section>
);

MemoryConfigPanel.displayName = 'MemoryConfigPanel';
