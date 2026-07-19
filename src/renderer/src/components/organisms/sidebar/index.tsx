import type { FC } from 'react';
import { ConversationItem } from '../../molecules/conversation-item/index.tsx';

export type SidebarConversation = { id: string; title: string };

// Props-only (rule 21). The page shell owns every id-taking callback; the organism
// binds each one to its row, so ConversationItem stays a plain per-row component.
export type SidebarProps = {
  conversations: readonly SidebarConversation[];
  activeId?: string;
  editingId?: string;
  draftTitle: string;
  confirmingDeleteId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onDraftChange: (title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

export const Sidebar: FC<SidebarProps> = ({
  conversations,
  activeId,
  editingId,
  draftTitle,
  confirmingDeleteId,
  onNew,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}) => (
  <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface">
    <div className="p-2">
      <button
        type="button"
        onClick={onNew}
        className="w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        + New conversation
      </button>
    </div>
    <ul className="flex flex-1 flex-col gap-y-0.5 overflow-y-auto px-2 pb-2">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          title={conversation.title}
          isActive={conversation.id === activeId}
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
  </aside>
);

Sidebar.displayName = 'Sidebar';
