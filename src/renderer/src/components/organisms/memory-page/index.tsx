import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';
import { Spinner } from '../../atoms/spinner/index.tsx';
import { MemoryEntryRow } from '../../molecules/memory-entry-row/index.tsx';

export type MemoryPageRow = { id: string; text: string; source: string };

// The full page for what the agent remembers: a list, add and forget, and a clear-all.
// The confirm dialog for clearing is the shell's, so this stays prop-pure.
export type MemoryPageProps = {
  rows: readonly MemoryPageRow[];
  notice?: string;
  isLoading: boolean;
  editingId?: string;
  draft: string;
  newText: string;
  onBack: () => void;
  onStartEdit: (id: string, text: string) => void;
  onChangeDraft: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRemove: (id: string) => void;
  onChangeNew: (text: string) => void;
  onAddNew: () => void;
  onClearAll: () => void;
};

export const MemoryPage: FC<MemoryPageProps> = ({
  rows,
  notice,
  isLoading,
  editingId,
  draft,
  newText,
  onBack,
  onStartEdit,
  onChangeDraft,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onChangeNew,
  onAddNew,
  onClearAll,
}) => (
  <section className="flex-1 overflow-y-auto px-6">
    <div className="mx-auto flex w-full min-w-0 max-w-reading flex-col gap-y-5 py-8">
      <header className="flex flex-col gap-y-1">
        <button type="button" onClick={onBack} className="self-start text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
          ‹ Back to chat
        </button>
        <div className="flex items-baseline justify-between gap-x-4">
          <h1 className="text-lg font-semibold tracking-tight text-ink">What Marcel remembers</h1>
          {rows.length > 0 && (
            <Button variant="danger" onClick={onClearAll}>
              Forget everything
            </Button>
          )}
        </div>
        <p className="text-sm text-ink-muted">
          Facts about your world that Marcel searches when it needs them. It asks before remembering anything, and everything it keeps is here to edit or remove.
        </p>
      </header>

      <div className="flex items-end gap-x-2">
        <div className="flex-1">
          <TextInput value={newText} placeholder="Add something to remember, in a sentence…" aria-label="Add a memory" onChange={(event) => onChangeNew(event.target.value)} />
        </div>
        <Button onClick={onAddNew} disabled={newText.trim().length === 0}>
          Add
        </Button>
      </div>

      {notice !== undefined && <p className="rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-ink-muted">{notice}</p>}

      {isLoading && <Spinner label="Loading your memories…" />}

      {!isLoading && rows.length === 0 && notice === undefined && (
        <p className="rounded-panel border border-dashed border-border-subtle p-8 text-center text-sm text-ink-muted">
          Nothing yet. Marcel adds to this only when you ask it to, and you can add something above.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-y-2">
          {rows.map((row) => (
            <MemoryEntryRow
              key={row.id}
              text={row.text}
              source={row.source}
              isEditing={row.id === editingId}
              draft={draft}
              onStartEdit={() => onStartEdit(row.id, row.text)}
              onChangeDraft={onChangeDraft}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
              onRemove={() => onRemove(row.id)}
            />
          ))}
        </ul>
      )}
    </div>
  </section>
);

MemoryPage.displayName = 'MemoryPage';
