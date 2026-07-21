import type { FC } from 'react';

// A typed variant, not a class name (rule 22): the page decides which outcomes are
// which, this decides what each one looks like.
export type ModelTestTone = 'good' | 'warn' | 'bad';

export type ModelTestRow = { isRunning: boolean; message?: string; tone?: ModelTestTone };

// Props-only (rule 21). Each model is an editable row you can rename in place or drop,
// plus a button to append a new one. It emits the whole next list rather than granular
// intents, so the page shell just stores it; blank rows are pruned when the provider is
// saved (provider-draft).
export type ModelListProps = {
  models: readonly string[];
  // Keyed by the model name, so a rename drops its own stale answer.
  tests?: Readonly<Record<string, ModelTestRow>>;
  onChange: (models: readonly string[]) => void;
  onTest: (model: string) => void;
};

const toneStyles: Record<ModelTestTone, string> = {
  good: 'text-success',
  warn: 'text-ink-muted',
  bad: 'text-danger',
};

const toneStyle = (tone: ModelTestTone | undefined): string => (tone === undefined ? 'text-ink-muted' : toneStyles[tone]);

export const ModelList: FC<ModelListProps> = ({ models, tests, onChange, onTest }) => (
  <div className="flex flex-col gap-y-2">
    {models.map((model, index) => (
      <div key={`model-${String(index)}`} className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <input
            value={model}
            aria-label="Model"
            placeholder="claude-opus-4-8"
            onChange={(e) => onChange(models.map((m, i) => (i === index ? e.target.value : m)))}
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          <button
            type="button"
            onClick={() => onTest(model)}
            disabled={model.trim().length === 0 || tests?.[model]?.isRunning === true}
            aria-label={`Test ${model === '' ? 'model' : model}`}
            className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1.5 text-sm leading-none text-ink transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Test
          </button>
          <button
            type="button"
            onClick={() => onChange(models.filter((_, i) => i !== index))}
            aria-label={`Remove ${model === '' ? 'model' : model}`}
            className="shrink-0 rounded-md border border-border-subtle px-2 py-1.5 text-sm leading-none text-ink-muted transition hover:bg-surface-raised hover:text-ink"
          >
            ×
          </button>
        </div>
        {tests?.[model]?.message !== undefined && (
          <p role="status" className={`pl-1 text-xs ${toneStyle(tests[model]?.tone)}`}>
            {tests[model]?.message}
          </p>
        )}
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
