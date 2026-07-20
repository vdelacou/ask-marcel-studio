import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { ProviderForm } from '../../molecules/provider-form/index.tsx';
import type { ProviderDraft } from '../../molecules/provider-form/index.tsx';

// A saved/error/idle banner. A typed variant, not a free-form className, so the
// app cannot style it (rule 22).
export type PanelNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

export type ProvidersPanelProps = {
  drafts: readonly ProviderDraft[];
  // The result of the last save (a provider's Save button persists the whole set).
  notice?: PanelNotice;
  onChangeDraft: (rowId: string, patch: Partial<ProviderDraft>) => void;
  onRemoveDraft: (rowId: string) => void;
  onAddDraft: () => void;
  onSave: () => void;
};

const noticeStyles: Record<PanelNotice['tone'], string> = {
  saved: 'border-success text-success',
  error: 'border-danger text-danger',
};

export const ProvidersPanel: FC<ProvidersPanelProps> = ({ drafts, notice, onChangeDraft, onRemoveDraft, onAddDraft, onSave }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Providers</h2>
        <p className="text-sm text-ink-muted">Add an Anthropic or OpenAI-compatible provider.</p>
      </div>
      <Button variant="secondary" onClick={onAddDraft}>
        Add provider
      </Button>
    </header>

    {drafts.length === 0 && (
      <p className="rounded-panel border border-dashed border-border-subtle p-8 text-center text-sm text-ink-muted">No providers yet. Add one to start a conversation.</p>
    )}

    {drafts.map((draft) => (
      <ProviderForm key={draft.rowId} draft={draft} onChange={(patch) => onChangeDraft(draft.rowId, patch)} onRemove={() => onRemoveDraft(draft.rowId)} onSave={onSave} />
    ))}

    {notice !== undefined && (
      <p role="status" className={`self-end rounded-md border px-2.5 py-1.5 text-xs ${notice.tone === 'saved' ? noticeStyles.saved : noticeStyles.error}`}>
        {notice.message}
      </p>
    )}
  </section>
);

ProvidersPanel.displayName = 'ProvidersPanel';
