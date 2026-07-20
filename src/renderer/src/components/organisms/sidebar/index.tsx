import type { FC } from 'react';
import { ConversationItem } from '../../molecules/conversation-item/index.tsx';

export type SidebarConversation = { id: string; title: string };

// Props-only (rule 21). The app's whole navigation: New on top, recent conversations in
// the middle, Settings pinned to the bottom. The page shell owns every id-taking
// callback; the organism binds each one to its row.
export type SidebarProps = {
  conversations: readonly SidebarConversation[];
  activeId?: string;
  editingId?: string;
  draftTitle: string;
  confirmingDeleteId?: string;
  isSettingsActive: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onStartRename: (id: string, title: string) => void;
  onDraftChange: (title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

const PlusIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const GearIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l.68 1.178a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.226l1.267 1.113a1 1 0 0 1 .206 1.25l-.68 1.18a1 1 0 0 1-1.187.446l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-.68-1.178a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.226L2.31 7.913a1 1 0 0 1-.206-1.25l.68-1.18a1 1 0 0 1 1.187-.446l1.598.54A6.993 6.993 0 0 1 7.5 4.062l.84-2.258zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
      clipRule="evenodd"
    />
  </svg>
);

const menuItem = 'flex w-full items-center gap-x-2 rounded-md px-2 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const Sidebar: FC<SidebarProps> = ({
  conversations,
  activeId,
  editingId,
  draftTitle,
  confirmingDeleteId,
  isSettingsActive,
  onNew,
  onSelect,
  onOpenSettings,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}) => (
  <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface shadow-[4px_0_16px_-8px_rgba(0,0,0,0.08)]">
    <div className="px-2 pb-1 pt-2">
      <button type="button" onClick={onNew} className={`${menuItem} font-medium text-ink hover:bg-surface-raised`}>
        <PlusIcon />
        New conversation
      </button>
    </div>

    <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
      <p className="px-2 pb-1 pt-3 text-xs font-medium text-ink-muted">Recents</p>
      <ul className="flex flex-col gap-y-0.5">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            title={conversation.title}
            isActive={!isSettingsActive && conversation.id === activeId}
            isEditing={conversation.id === editingId}
            isConfirmingDelete={conversation.id === confirmingDeleteId}
            draftTitle={draftTitle}
            onSelect={() => onSelect(conversation.id)}
            onStartRename={() => onStartRename(conversation.id, conversation.title)}
            onDraftChange={onDraftChange}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onStartDelete={() => onStartDelete(conversation.id)}
            onConfirmDelete={onConfirmDelete}
            onCancelDelete={onCancelDelete}
          />
        ))}
      </ul>
    </div>

    <div className="border-t border-border-subtle p-2">
      <button
        type="button"
        onClick={onOpenSettings}
        aria-current={isSettingsActive ? 'page' : undefined}
        className={`${menuItem} ${isSettingsActive ? 'bg-surface-raised font-medium text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}
      >
        <GearIcon />
        Settings
      </button>
    </div>
  </aside>
);

Sidebar.displayName = 'Sidebar';
