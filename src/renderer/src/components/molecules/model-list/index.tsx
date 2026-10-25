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
  // Absent where there is nothing to test with: a Claude plan model has no key to try.
  onTest?: (model: string) => void;
};

const toneStyles: Record<ModelTestTone, string> = {
  good: 'text-success',
  warn: 'text-ink-muted',
  bad: 'text-danger',
};

const toneStyle = (tone: ModelTestTone | undefined): string => (tone === undefined ? 'text-ink-muted' : toneStyles[tone]);

// What a row's buttons call the model before it has a name.
const labelFor = (model: string): string => (model === '' ? 'model' : model);

type ModelRowProps = {
  model: string;
  test: ModelTestRow | undefined;
  onRename: (model: string) => void;
  onRemove: () => void;
  onTest?: (model: string) => void;
};

const ModelRow: FC<ModelRowProps> = ({ model, test, onRename, onRemove, onTest }) => (
  <div className="flex flex-col gap-y-1">
    <div className="flex items-center gap-x-2">
      <input
        value={model}
        aria-label="Model"
        placeholder="claude-opus-4-8"
        onChange={(e) => onRename(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      {onTest !== undefined && (
        <button
          type="button"
          onClick={() => onTest(model)}
          disabled={model.trim().length === 0 || test?.isRunning === true}
          aria-label={`Test ${labelFor(model)}`}
          className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1.5 text-sm leading-none text-ink transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Test
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${labelFor(model)}`}
        className="shrink-0 rounded-md border border-border-subtle px-2 py-1.5 text-sm leading-none text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        ×
      </button>
    </div>
    {test?.message !== undefined && (
      <p role="status" className={`pl-1 text-xs ${toneStyle(test.tone)}`}>
        {test.message}
      </p>
    )}
  </div>
);

ModelRow.displayName = 'ModelRow';

export const ModelList: FC<ModelListProps> = ({ models, tests, onChange, onTest }) => (
  <div className="flex flex-col gap-y-2">
    {models.map((model, index) => (
      <ModelRow
        key={`model-${String(index)}`}
        model={model}
        test={tests?.[model]}
        onRename={(renamed) => onChange(models.map((m, i) => (i === index ? renamed : m)))}
        onRemove={() => onChange(models.filter((_, i) => i !== index))}
        {...(onTest === undefined ? {} : { onTest })}
      />
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
