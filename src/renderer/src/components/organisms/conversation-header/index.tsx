import type { FC, ReactNode } from 'react';
import { IconButton } from '../../atoms/icon-button/index.tsx';

// The title bar of the open conversation. It sits inside the thread's scroll container and
// sticks to its top, so the title stays readable while the transcript runs under it: hence
// the translucent background and the blur, which keep the text legible over whatever
// scrolls beneath without hiding that something is moving.
export type ConversationHeaderProps = {
  title: string;
  isEditing: boolean;
  draftTitle: string;
  // The actions menu, built by the shell so this stays prop-pure.
  menu?: ReactNode;
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

export const ConversationHeader: FC<ConversationHeaderProps> = ({ title, isEditing, draftTitle, menu, onToggleMenu, onDraftChange, onCommitRename, onCancelRename }) => (
  <header className="sticky top-0 z-10 -mx-6 flex items-center gap-x-2 border-b border-border-subtle/60 bg-surface/80 px-6 py-2.5 backdrop-blur">
    <div className="mx-auto flex w-full min-w-0 max-w-reading items-center gap-x-2">
      {isEditing ? (
        <input
          autoFocus
          aria-label="Conversation title"
          value={draftTitle}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommitRename();
            if (event.key === 'Escape') onCancelRename();
          }}
          className="min-w-0 flex-1 rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</h1>
      )}
      <div className="relative shrink-0">
        <IconButton label="Conversation actions" onClick={onToggleMenu} size="md" isActive={menu !== undefined}>
          <DotsIcon />
        </IconButton>
        {menu}
      </div>
    </div>
  </header>
);

ConversationHeader.displayName = 'ConversationHeader';
