import type { FC, ReactNode } from 'react';
import { ConversationItem } from '../../molecules/conversation-item/index.tsx';
import { Popover } from '../../molecules/popover/index.tsx';
import { Menu } from '../../molecules/menu/index.tsx';
import { IconButton } from '../../atoms/icon-button/index.tsx';
import { PanelIcon } from '../../atoms/panel-icon/index.tsx';

export type SidebarConversation = { id: string; title: string; activity?: 'running' | 'unseen' };

// Props-only (rule 21). The app's whole navigation: New on top, recent conversations in
// the middle, Settings pinned to the bottom. The page shell owns every id-taking
// callback; the organism binds each one to its row.
export type SidebarProps = {
  conversations: readonly SidebarConversation[];
  activeId?: string;
  editingId?: string;
  draftTitle: string;
  // The row whose actions menu is open, if any.
  menuOpenId?: string;
  isSettingsActive: boolean;
  // The Microsoft 365 dot beside Settings. The popover is built by the app shell and
  // rendered here when it is open, so the sidebar stays free of any refresh wiring.
  officeHealth: 'checking' | 'healthy' | 'attention' | 'signed-out';
  officeLabel: string;
  officePopover?: ReactNode;
  // The user's own first name once Microsoft 365 has told the app what it is. Until then
  // the button says Settings, which is what it used to say and what it still does.
  userName?: string;
  userMenu?: ReactNode;
  // How wide the user has dragged it. An inline style, which is allowed here and only
  // here: a pixel value cannot be a utility class, and the seal is about the app not
  // knowing Tailwind, not about the design system refusing a number.
  width: number;
  onStartResize: (clientX: number) => void;
  onCollapse: () => void;
  onToggleOfficeStatus: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  // Opens the user menu when the app knows who the user is, and settings directly when
  // it does not (the button is still labelled Settings then).
  onPressUser: () => void;
  onToggleRowMenu: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onDraftChange: (title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartDelete: (id: string) => void;
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

const menuItem = 'flex w-full items-center gap-x-2 rounded-md px-2 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const healthDot: Record<SidebarProps['officeHealth'], string> = {
  checking: 'bg-border-subtle',
  healthy: 'bg-success',
  attention: 'bg-warning',
  'signed-out': 'bg-ink-muted',
};

export const Sidebar: FC<SidebarProps> = ({
  conversations,
  activeId,
  editingId,
  draftTitle,
  menuOpenId,
  isSettingsActive,
  officeHealth,
  officeLabel,
  officePopover,
  userName,
  userMenu,
  width,
  onStartResize,
  onCollapse,
  onToggleOfficeStatus,
  onNew,
  onSelect,
  onPressUser,
  onToggleRowMenu,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onStartDelete,
}) => (
  <aside style={{ width }} className="relative flex shrink-0 flex-col border-r border-border-subtle bg-surface shadow-[4px_0_16px_-8px_rgba(0,0,0,0.08)]">
    {/* Top strip: the window-move surface, so the OS traffic lights overlay its left. The
        collapse control sits at the right, opted out of the drag region or the OS eats its
        click. */}
    <div className="flex h-12 shrink-0 items-center justify-end px-2 [-webkit-app-region:drag]">
      <div className="[-webkit-app-region:no-drag]">
        <IconButton label="Hide the sidebar" onClick={onCollapse} size="md">
          <PanelIcon />
        </IconButton>
      </div>
    </div>
    <div className="px-2 pb-1">
      <button type="button" onClick={onNew} className={`${menuItem} font-medium text-ink hover:bg-surface-raised`}>
        <PlusIcon />
        New conversation
      </button>
    </div>

    <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
      <p className="px-2 pb-1 pt-3 text-xs font-medium text-ink-faint">Recents</p>
      <ul className="flex flex-col gap-y-0.5">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            title={conversation.title}
            {...(conversation.activity === undefined ? {} : { activity: conversation.activity })}
            isActive={!isSettingsActive && conversation.id === activeId}
            isEditing={conversation.id === editingId}
            draftTitle={draftTitle}
            {...(conversation.id === menuOpenId
              ? {
                  menu: (
                    <Popover placement="down-end" dismissLabel="Close menu" onDismiss={() => onToggleRowMenu(conversation.id)}>
                      <Menu
                        items={[
                          { id: 'rename', label: 'Rename' },
                          { id: 'delete', label: 'Delete', tone: 'danger' },
                        ]}
                        onPick={(action) => (action === 'rename' ? onStartRename(conversation.id, conversation.title) : onStartDelete(conversation.id))}
                      />
                    </Popover>
                  ),
                }
              : {})}
            onSelect={() => onSelect(conversation.id)}
            onToggleMenu={() => onToggleRowMenu(conversation.id)}
            onDraftChange={onDraftChange}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
          />
        ))}
      </ul>
    </div>

    <div className="relative border-t border-border-subtle p-2">
      {officePopover}
      <div className="relative flex items-center gap-x-1">
        {userMenu}
        <button
          type="button"
          onClick={onPressUser}
          aria-current={isSettingsActive ? 'page' : undefined}
          className={`${menuItem} ${isSettingsActive ? 'bg-surface-raised font-medium text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}
        >
          {userName === undefined ? (
            <GearIcon />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[10px] font-semibold uppercase text-ink-muted"
            >
              {userName.slice(0, 1)}
            </span>
          )}
          <span className="truncate">{userName ?? 'Settings'}</span>
        </button>
        <button
          type="button"
          onClick={onToggleOfficeStatus}
          aria-label={officeLabel}
          title={officeLabel}
          className="shrink-0 rounded-md p-2 transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className={`block h-2 w-2 rounded-full ${healthDot[officeHealth]}`} />
        </button>
      </div>
    </div>

    {/* The drag handle. Pointer-only by design: the collapse button in the top strip is the
        keyboard path to the same outcome. It straddles the top strip, so it must opt out of
        the window-drag region or a grab near the top moves the window instead of resizing. */}
    <div
      role="presentation"
      onPointerDown={(event) => onStartResize(event.clientX)}
      onDoubleClick={onCollapse}
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize transition hover:bg-accent/20 [-webkit-app-region:no-drag]"
    />
  </aside>
);

Sidebar.displayName = 'Sidebar';
