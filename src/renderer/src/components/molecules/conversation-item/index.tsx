import type { FC } from 'react';
import { StatusDot } from '../../atoms/status-dot/index.tsx';

// Props-only (rule 21). One row of the sidebar, in one of three states: normal
// (select it, or reveal rename/delete on hover), renaming (an inline input), or
// confirming a delete (an inline yes/no, never a browser dialog).
export type ConversationItemProps = {
  title: string;
  // Absent when the conversation is idle and up to date.
  activity?: 'running' | 'unseen';
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  draftTitle: string;
  onSelect: () => void;
  onStartRename: () => void;
  onDraftChange: (title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

const PencilIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
);

const TrashIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM7 8a1 1 0 0 1 2 0v6a1 1 0 1 1-2 0V8zm5-1a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1z"
      clipRule="evenodd"
    />
  </svg>
);

const rowBase = 'group flex items-center gap-x-1 rounded-md px-2 py-1.5 text-sm';
const iconButton = 'rounded p-1 text-ink-muted opacity-0 transition hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100';

export const ConversationItem: FC<ConversationItemProps> = ({
  title,
  activity,
  isActive,
  isEditing,
  isConfirmingDelete,
  draftTitle,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}) => {
  if (isEditing) {
    return (
      <li className={rowBase}>
        <input
          autoFocus
          aria-label="Conversation title"
          value={draftTitle}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          className="w-full rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </li>
    );
  }

  if (isConfirmingDelete) {
    return (
      <li className={`${rowBase} justify-between`}>
        <span className="truncate text-ink-muted">Delete this conversation?</span>
        <span className="flex shrink-0 gap-x-1">
          <button type="button" onClick={onConfirmDelete} className="rounded px-1.5 py-0.5 text-xs font-medium text-danger hover:bg-danger-wash">
            Delete
          </button>
          <button type="button" onClick={onCancelDelete} className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:text-ink">
            Cancel
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className={`${rowBase} ${isActive ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}>
      {activity !== undefined && <StatusDot kind={activity} />}
      <button type="button" onClick={onSelect} aria-current={isActive ? 'page' : undefined} className="flex-1 truncate text-left focus-visible:outline-none">
        {title}
      </button>
      <button type="button" onClick={onStartRename} aria-label={`Rename ${title}`} className={iconButton}>
        <PencilIcon />
      </button>
      <button type="button" onClick={onStartDelete} aria-label={`Delete ${title}`} className={iconButton}>
        <TrashIcon />
      </button>
    </li>
  );
};

ConversationItem.displayName = 'ConversationItem';
