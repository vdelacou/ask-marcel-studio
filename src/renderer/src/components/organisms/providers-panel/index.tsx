import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { Select } from '../../atoms/select/index.tsx';
import { ProviderForm } from '../../molecules/provider-form/index.tsx';
import { ProviderRow } from '../../molecules/provider-row/index.tsx';
import type { ProviderDraft } from '../../molecules/provider-form/index.tsx';

// A saved/error/idle banner. A typed variant, not a free-form className, so the
// app cannot style it (rule 22).
export type PanelNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

// The flattened union of every configured provider's models, built by the page shell
// (lib/model-options).
export type ModelChoice = { readonly value: string; readonly label: string };

export type ProvidersPanelProps = {
  drafts: readonly ProviderDraft[];
  // At most one provider's form is open at a time; the rest stay one line each.
  expandedRowId?: string;
  defaultModel?: string;
  modelChoices: readonly ModelChoice[];
  // The result of the last save (a provider's Save button persists the whole set).
  notice?: PanelNotice;
  onToggleRow: (rowId: string) => void;
  onChangeDefaultModel: (reference: string) => void;
  onChangeDraft: (rowId: string, patch: Partial<ProviderDraft>) => void;
  onRemoveDraft: (rowId: string) => void;
  onAddDraft: () => void;
  onSave: () => void;
};

const noticeStyles: Record<PanelNotice['tone'], string> = {
  saved: 'border-success text-success',
  error: 'border-danger text-danger',
};

const rowLabel = (draft: ProviderDraft): string => {
  const label = draft.label.trim();
  return label.length > 0 ? label : 'New provider';
};

export const ProvidersPanel: FC<ProvidersPanelProps> = ({
  drafts,
  expandedRowId,
  defaultModel,
  modelChoices,
  notice,
  onToggleRow,
  onChangeDefaultModel,
  onChangeDraft,
  onRemoveDraft,
  onAddDraft,
  onSave,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Models</h2>
        <p className="text-sm text-ink-muted">Add an Anthropic or OpenAI-compatible provider, then pick which model new conversations start with.</p>
      </div>
      <Button variant="secondary" onClick={onAddDraft}>
        Add provider
      </Button>
    </header>

    {modelChoices.length > 0 && (
      <Field label="Model for new conversations" htmlFor="default-model">
        <Select
          id="default-model"
          value={defaultModel ?? ''}
          options={[{ value: '', label: 'Use the first one I set up' }, ...modelChoices]}
          onChange={(e) => onChangeDefaultModel(e.target.value)}
        />
      </Field>
    )}

    {drafts.length === 0 && (
      <p className="rounded-panel border border-dashed border-border-subtle p-8 text-center text-sm text-ink-muted">No providers yet. Add one to start a conversation.</p>
    )}

    <div className="flex flex-col gap-y-2">
      {drafts.map((draft) => (
        <div key={draft.rowId} className="flex flex-col gap-y-2">
          <ProviderRow
            label={rowLabel(draft)}
            kind={draft.kind}
            modelCount={draft.modelIds.filter((m) => m.trim().length > 0).length}
            hasKey={draft.apiKey.trim().length > 0}
            isExpanded={draft.rowId === expandedRowId}
            onToggle={() => onToggleRow(draft.rowId)}
          />
          {draft.rowId === expandedRowId && (
            <ProviderForm draft={draft} onChange={(patch) => onChangeDraft(draft.rowId, patch)} onRemove={() => onRemoveDraft(draft.rowId)} onSave={onSave} />
          )}
        </div>
      ))}
    </div>

    {notice !== undefined && (
      <p role="status" className={`self-end rounded-md border px-2.5 py-1.5 text-xs ${notice.tone === 'saved' ? noticeStyles.saved : noticeStyles.error}`}>
        {notice.message}
      </p>
    )}
  </section>
);

ProvidersPanel.displayName = 'ProvidersPanel';
