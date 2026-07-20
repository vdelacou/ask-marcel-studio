import type { FC } from 'react';

// Props-only (rule 21). Each model is an editable row you can rename in place or drop,
// plus a button to append a new one. It emits the whole next list rather than granular
// intents, so the page shell just stores it; blank rows are pruned when the provider is
// saved (provider-draft).
export type ModelListProps = {
  models: readonly string[];
  onChange: (models: readonly string[]) => void;
};

export const ModelList: FC<ModelListProps> = ({ models, onChange }) => (
  <div className="flex flex-col gap-y-2">
    {models.map((model, index) => (
      <div key={`model-${String(index)}`} className="flex items-center gap-x-2">
        <input
          value={model}
          aria-label="Model"
          placeholder="claude-opus-4-8"
          onChange={(e) => onChange(models.map((m, i) => (i === index ? e.target.value : m)))}
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={() => onChange(models.filter((_, i) => i !== index))}
          aria-label={`Remove ${model === '' ? 'model' : model}`}
          className="shrink-0 rounded-md border border-border-subtle px-2 py-1.5 text-sm leading-none text-ink-muted transition hover:bg-surface-raised hover:text-ink"
        >
          ×
        </button>
      </div>
    ))}
    <button
      type="button"
      onClick={() => onChange([...models, ''])}
      className="self-start rounded-md border border-border-subtle px-2.5 py-1 text-sm text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      + Add model
    </button>
  </div>
);

ModelList.displayName = 'ModelList';
