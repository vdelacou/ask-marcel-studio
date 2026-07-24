import type { FC, ReactNode } from 'react';
import { StatusDot } from '../../atoms/status-dot/index.tsx';
import { IconButton } from '../../atoms/icon-button/index.tsx';

// Props-only (rule 21). One row of the sidebar, either normal (select it, or open its
// menu) or renaming (an inline input). Deleting is not a row state any more: it asks in a
// dialog in the middle of the window, because it cannot be undone.
export type ConversationItemProps = {
  title: string;
  // Absent when the conversation is idle and up to date.
  activity?: 'running' | 'unseen';
  isActive: boolean;
  isEditing: boolean;
  draftTitle: string;
  // The row's menu, built by the sidebar and rendered here so it anchors to this row.
  menu?: ReactNode;
  onSelect: () => void;
  onToggleMenu: () => void;
  onDraftChange: (title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
};

const DotsIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
    <path d="M6 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
  </svg>
);

const rowBase = 'group relative flex items-center gap-x-1 rounded-md px-2 py-1 text-sm';

export const ConversationItem: FC<ConversationItemProps> = ({
  title,
  activity,
  isActive,
  isEditing,
  draftTitle,
  menu,
  onSelect,
  onToggleMenu,
  onDraftChange,
  onCommitRename,
  onCancelRename,
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

  return (
    <li className={`${rowBase} ${isActive ? 'bg-surface-raised text-ink' : 'text-ink-faint hover:bg-surface-raised hover:text-ink'}`}>
      {activity !== undefined && <StatusDot kind={activity} />}
      <button type="button" onClick={onSelect} aria-current={isActive ? 'page' : undefined} className="flex-1 truncate text-left focus-visible:outline-none">
        {title}
      </button>
      <IconButton label={`Actions for ${title}`} onClick={onToggleMenu} isHidden={menu === undefined}>
        <DotsIcon />
      </IconButton>
      {menu}
    </li>
  );
};

ConversationItem.displayName = 'ConversationItem';
