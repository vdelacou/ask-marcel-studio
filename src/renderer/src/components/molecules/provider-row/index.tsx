import type { FC } from 'react';

// One collapsed line in the models list. The form only opens when this is clicked, so
// the screen reads as "here is what you have set up" rather than as four stacked forms.
export type ProviderRowProps = {
  label: string;
  kind: 'anthropic' | 'openai';
  modelCount: number;
  hasKey: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

const KIND_LABEL: Record<ProviderRowProps['kind'], string> = { anthropic: 'Anthropic', openai: 'OpenAI compatible' };

const modelsLabel = (count: number): string => (count === 1 ? '1 model' : `${String(count)} models`);

export const ProviderRow: FC<ProviderRowProps> = ({ label, kind, modelCount, hasKey, isExpanded, onToggle }) => (
  <button
    type="button"
    aria-expanded={isExpanded}
    onClick={onToggle}
    className="flex w-full items-center gap-x-3 rounded-panel border border-border-subtle px-4 py-3 text-left transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{label}</span>
    <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{KIND_LABEL[kind]}</span>
    <span className="shrink-0 text-xs text-ink-muted">{modelsLabel(modelCount)}</span>
    <span className={`shrink-0 text-xs ${hasKey ? 'text-success' : 'text-danger'}`}>{hasKey ? 'Key set' : 'No key'}</span>
  </button>
);

ProviderRow.displayName = 'ProviderRow';
