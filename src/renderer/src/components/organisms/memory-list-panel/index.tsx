import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';
import { ActionNotice } from '../../molecules/action-notice/index.tsx';
import type { ActionNoticeProps } from '../../molecules/action-notice/index.tsx';
import { MemoryEntryEditor } from '../../molecules/memory-entry-editor/index.tsx';
import type { MemoryEntryEditorProps } from '../../molecules/memory-entry-editor/index.tsx';
import { MemoryEntryRow } from '../../molecules/memory-entry-row/index.tsx';
import type { MemoryEntryPerson } from '../../molecules/memory-entry-row/index.tsx';

// One of the notes Marcel reads before every message, shown as a list the user edits an
// entry at a time. Props-only (rule 21): the page owns the notes, the draft, the filter and
// every string; this lays them out and builds its own rows, so no Tailwind leaves this folder
// (rule 22).
export type MemoryListItem = {
  readonly key: string;
  readonly term: string;
  readonly detail: string;
  // Undefined on a word.
  readonly person: MemoryEntryPerson | undefined;
  readonly editLabel: string;
  readonly deleteLabel: string;
};

export type MemoryListNotice = { readonly id: string } & ActionNoticeProps;

export type MemoryListChoice = { readonly id: string; readonly label: string };

// The open editor: on the row whose key it carries, or, with no key, a new entry at the top.
export type MemoryListEditor = { readonly key?: string; readonly fields: MemoryEntryEditorProps };

// What an empty list says instead, and what it offers.
export type MemoryListEmpty = { readonly message: string; readonly action?: { readonly label: string; readonly onAction: () => void } };

export type MemoryListSegments = { readonly label: string; readonly options: readonly MemoryListChoice[]; readonly activeId: string };

export type MemoryListPanelProps = {
  title: string;
  description: string;
  addLabel: string;
  notices: readonly MemoryListNotice[];
  query: string;
  queryLabel: string;
  queryPlaceholder: string;
  // A second way to narrow the list, as a row of toggles: My team / Others on the people list.
  segments?: MemoryListSegments;
  items: readonly MemoryListItem[];
  editor?: MemoryListEditor;
  empty: MemoryListEmpty;
  summary: string;
  textModes: readonly MemoryListChoice[];
  onAdd: () => void;
  onQuery: (query: string) => void;
  onSegment: (id: string) => void;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onMove: (key: string) => void;
  onTextMode: (id: string) => void;
};

const linkStyle = 'rounded underline underline-offset-2 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const MemoryListPanel: FC<MemoryListPanelProps> = ({
  title,
  description,
  addLabel,
  notices,
  query,
  queryLabel,
  queryPlaceholder,
  segments,
  items,
  editor,
  empty,
  summary,
  textModes,
  onAdd,
  onQuery,
  onSegment,
  onEdit,
  onDelete,
  onMove,
  onTextMode,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-start justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      <Button onClick={onAdd}>{addLabel}</Button>
    </header>

    {notices.map((notice) => (
      <ActionNotice key={notice.id} tone={notice.tone} message={notice.message} {...(notice.action === undefined ? {} : { action: notice.action })} />
    ))}

    <div className="flex flex-col gap-y-2">
      <TextInput type="search" value={query} aria-label={queryLabel} placeholder={queryPlaceholder} onChange={(event) => onQuery(event.target.value)} />
      {segments !== undefined && (
        <div role="group" aria-label={segments.label} className="flex flex-wrap items-center gap-1.5">
          {segments.options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === segments.activeId}
              onClick={() => onSegment(option.id)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                option.id === segments.activeId ? 'border-transparent bg-ink text-surface' : 'border-border-subtle text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>

    <ul className="flex flex-col border-t border-border-subtle">
      {editor !== undefined && editor.key === undefined && <MemoryEntryEditor {...editor.fields} />}
      {items.map((item) =>
        editor !== undefined && item.key === editor.key ? (
          <MemoryEntryEditor key={item.key} {...editor.fields} />
        ) : (
          <MemoryEntryRow
            key={item.key}
            term={item.term}
            detail={item.detail}
            person={item.person}
            editLabel={item.editLabel}
            deleteLabel={item.deleteLabel}
            onEdit={() => onEdit(item.key)}
            onDelete={() => onDelete(item.key)}
            onMove={() => onMove(item.key)}
          />
        )
      )}
    </ul>

    {items.length === 0 && editor === undefined && (
      <p className="rounded-panel border border-dashed border-border-subtle p-6 text-center text-sm text-ink-muted">
        {empty.message}
        {empty.action !== undefined && (
          <>
            {' '}
            <button type="button" onClick={empty.action.onAction} className={`font-medium text-ink ${linkStyle}`}>
              {empty.action.label}
            </button>
          </>
        )}
      </p>
    )}

    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
      <span>{summary}</span>
      {textModes.map((mode) => (
        <button key={mode.id} type="button" onClick={() => onTextMode(mode.id)} className={linkStyle}>
          {mode.label}
        </button>
      ))}
    </footer>
  </section>
);

MemoryListPanel.displayName = 'MemoryListPanel';
