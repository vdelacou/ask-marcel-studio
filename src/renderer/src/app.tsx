/*
 * The app shell. Owns the settings toggle and provider bootstrap, drives the
 * conversation list through the use-conversations hook, and hands plain props to the
 * design system.
 *
 * Carries no class string (rule 22) and calls no hook inside a design-system
 * component (rule 21): every hook lives here or in src/renderer/src/hooks.
 *
 * The sidebar is the whole navigation (New, recents, Settings); the main area is always
 * the chat, and Settings opens as a modal overlay on top of it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { AppFrame } from './components/organisms/app-frame/index.tsx';
import { NoProviderNotice } from './components/organisms/no-provider-notice/index.tsx';
import { EmptyConversations } from './components/organisms/empty-conversations/index.tsx';
import { Sidebar } from './components/organisms/sidebar/index.tsx';
import { SettingsOverlay } from './components/organisms/settings-overlay/index.tsx';
import { OfficeStatusPopover } from './components/organisms/office-status-popover/index.tsx';
import { Toast } from './components/molecules/toast/index.tsx';
import { MemoryConfirmDialog } from './components/organisms/memory-confirm-dialog/index.tsx';
import { ConfirmDialog } from './components/organisms/confirm-dialog/index.tsx';
import { ConversationHeader } from './components/organisms/conversation-header/index.tsx';
import { Popover } from './components/molecules/popover/index.tsx';
import { Menu } from './components/molecules/menu/index.tsx';
import { ChatPage } from './page/chat-page.tsx';
import { SettingsPage } from './page/settings-page.tsx';
import { useConversations } from './hooks/use-conversations.ts';
import { useChatViews } from './hooks/use-chat-views.ts';
import { useOfficeHealth } from './hooks/use-office-health.ts';
import { useSidebarLayout } from './hooks/use-sidebar-layout.ts';
import { useUserIdentity } from './hooks/use-user-identity.ts';
import { useMemoryStore } from './hooks/use-memory-store.ts';
import { MemoryPage } from './components/organisms/memory-page/index.tsx';
import { IconButton } from './components/atoms/icon-button/index.tsx';
import { PanelIcon } from './components/atoms/panel-icon/index.tsx';
import { useMemory } from './hooks/use-memory.ts';
import { useUpdate } from './hooks/use-update.ts';
import { UpdateBanner } from './components/molecules/update-banner/index.tsx';
import { dotLabel } from './lib/office-health.ts';
import { modelOptions } from './lib/model-options.ts';
import type { ModelOption } from './lib/model-options.ts';
import { modelForNewConversation } from '../../shared/model-ref.ts';

type Boot =
  | { readonly step: 'loading' }
  | { readonly step: 'no-provider' }
  | { readonly step: 'ready'; readonly defaultModel: string; readonly models: readonly ModelOption[] }
  | { readonly step: 'failed'; readonly message: string };

export const App: FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Whether the user is mid-sentence, so a question the app wants to ask waits.
  const [composerEmpty, setComposerEmpty] = useState(true);
  const [boot, setBoot] = useState<Boot>({ step: 'loading' });
  // Same read guard the hook documents: StrictMode double-invokes the effect and
  // closing settings re-runs bootstrap.
  const bootstrapping = useRef(false);

  const bootstrap = useCallback((): void => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    void (async (): Promise<void> => {
      const settings = await studio.settings.get();
      if (!settings.ok) return setBoot({ step: 'failed', message: settings.error.message });
      // The same rule main applies when it actually opens one, rather than a second copy of
      // it here: this only decides whether there is a model at all, since main resolves
      // which one at creation time from the last one used.
      const defaultModel = modelForNewConversation(settings.value.providers, settings.value.defaultModel);
      if (defaultModel === undefined) return setBoot({ step: 'no-provider' });
      return setBoot({ step: 'ready', defaultModel, models: modelOptions(settings.value.providers) });
    })().finally(() => {
      bootstrapping.current = false;
    });
  }, []);

  useEffect(bootstrap, [bootstrap]);

  // Transcripts live here, above the keyed chat page, so switching conversations no
  // longer discards a turn that is still running.
  // Destructured rather than held as one object: viewFor changes whenever any
  // transcript does, and binding the callbacks to it would re-run the chat page's
  // effects on every token that arrives.
  const { viewFor, hydrate, send, cancel, evict } = useChatViews();
  const conversations = useConversations(boot.step === 'ready' ? boot.defaultModel : undefined, evict);
  const list = conversations.view;
  const { create } = conversations;
  const backToChat = useCallback((): void => setView('chat'), []);
  const activeId = list.activeId;

  const hydrateActive = useCallback((): void => {
    if (activeId !== undefined) hydrate(activeId);
  }, [activeId, hydrate]);
  const sendToActive = useCallback(
    (text: string): void => {
      if (activeId !== undefined) send(activeId, text);
    },
    [activeId, send]
  );
  const cancelActive = useCallback((): void => {
    if (activeId !== undefined) cancel(activeId);
  }, [activeId, cancel]);

  const sidebarLayout = useSidebarLayout();
  // Which surface asked for the rename, so the input appears where the user clicked
  // rather than in both places at once.
  const [renameSurface, setRenameSurface] = useState<'sidebar' | 'header'>('sidebar');
  const office = useOfficeHealth();
  const identity = useUserIdentity();
  const memory = useMemory({ composerEmpty, settingsOpen });
  const [officeOpen, setOfficeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Which surface fills the main column: the conversation, or the full Memory page.
  const [view, setView] = useState<'chat' | 'memory'>('chat');
  const update = useUpdate();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const memoryStore = useMemoryStore();
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);

  const openSettings = useCallback((): void => {
    setSettingsSection(undefined);
    setSettingsOpen(true);
  }, []);
  const { reload: reloadOffice } = office;
  // Closing may mean a provider was just added, so re-resolve the default model, and a
  // sign-in may have happened in there too.
  const closeSettings = useCallback((): void => {
    setSettingsOpen(false);
    bootstrap();
    reloadOffice();
  }, [bootstrap, reloadOffice]);
  // Before the app knows the user's name the button is still just Settings, so it opens
  // settings rather than a menu with one item in it.
  const knowsUser = identity.context !== undefined && identity.context.firstName.length > 0;
  const pressUser = useCallback((): void => {
    if (!knowsUser) return openSettings();
    return setUserMenuOpen((open) => !open);
  }, [knowsUser, openSettings]);

  const { refresh: refreshOffice } = office;
  // The popover stays open when a sign-in fails, so its reason is readable, and closes
  // itself the moment one succeeds.
  const refreshSignIn = useCallback((): void => {
    void (async (): Promise<void> => {
      if (await refreshOffice()) setOfficeOpen(false);
    })();
  }, [refreshOffice]);
  const { signOut } = office;
  const signOutOffice = useCallback((): void => {
    void signOut();
  }, [signOut]);

  // Escape closes whatever is on top. Here, not in the components, so each of them stays
  // prop-pure. Innermost first: a dialog opened from a menu closes before the menu, and
  // settings (the outermost surface) closes last.
  const { cancelDelete, toggleRowMenu, menuOpenId, confirmingDeleteId } = conversations;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (confirmingDeleteId !== undefined) return cancelDelete();
      if (menuOpenId !== undefined) return toggleRowMenu(menuOpenId);
      if (officeOpen) return setOfficeOpen(false);
      if (settingsOpen) return closeSettings();
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmingDeleteId, cancelDelete, menuOpenId, toggleRowMenu, officeOpen, settingsOpen, closeSettings]);

  const isReady = boot.step === 'ready';
  // Only worth a picker when there is a choice to make.
  const models = boot.step === 'ready' && boot.models.length > 1 ? boot.models : undefined;
  const activeModel = list.conversations.find((c) => c.id === activeId)?.model;
  const { setModel } = conversations;
  const changeModel = useCallback(
    (model: string): void => {
      if (activeId !== undefined) setModel(activeId, model);
    },
    [activeId, setModel]
  );

  const activeConversation = list.conversations.find((c) => c.id === activeId);
  // The header's own rename input and the sidebar row's are the same rename: only one of
  // them shows at a time, decided by which surface started it.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const buildConversationHeader = (): ReactNode => {
    if (activeConversation === undefined) return undefined;
    const { id, title } = activeConversation;
    const pickAction = (action: string): void => {
      setHeaderMenuOpen(false);
      if (action !== 'rename') return conversations.startDelete(id);
      setRenameSurface('header');
      return conversations.startRename(id, title);
    };
    const menu = headerMenuOpen ? (
      <Popover placement="down-end" dismissLabel="Close menu" onDismiss={() => setHeaderMenuOpen(false)}>
        <Menu
          items={[
            { id: 'rename', label: 'Rename' },
            { id: 'delete', label: 'Delete', tone: 'danger' },
          ]}
          onPick={pickAction}
        />
      </Popover>
    ) : undefined;
    return (
      <ConversationHeader
        title={title}
        isEditing={conversations.editingId === id && renameSurface === 'header'}
        draftTitle={conversations.draftTitle}
        {...(menu === undefined ? {} : { menu })}
        onToggleMenu={() => setHeaderMenuOpen((open) => !open)}
        onDraftChange={conversations.changeDraft}
        onCommitRename={conversations.commitRename}
        onCancelRename={conversations.cancelRename}
      />
    );
  };
  const conversationHeader = buildConversationHeader();

  const sidebar = (
    <Sidebar
      conversations={list.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        ...(conversations.activity[c.id] === undefined ? {} : { activity: conversations.activity[c.id] }),
      }))}
      {...(list.activeId === undefined ? {} : { activeId: list.activeId })}
      {...(conversations.editingId === undefined || renameSurface !== 'sidebar' ? {} : { editingId: conversations.editingId })}
      draftTitle={conversations.draftTitle}
      {...(conversations.menuOpenId === undefined ? {} : { menuOpenId: conversations.menuOpenId })}
      isSettingsActive={settingsOpen}
      officeHealth={office.popover.health}
      officeLabel={dotLabel(office.popover.health)}
      {...(officeOpen
        ? {
            officePopover: (
              <OfficeStatusPopover
                health={office.popover.health}
                headline={office.popover.headline}
                unavailable={office.popover.unavailable}
                action={office.popover.action}
                canSignOut={office.popover.canSignOut}
                {...(office.popover.reassurance === undefined ? {} : { reassurance: office.popover.reassurance })}
                isRefreshing={office.isRefreshing}
                isSigningOut={office.isSigningOut}
                {...(office.error === undefined ? {} : { error: office.error })}
                onRefresh={refreshSignIn}
                onSignOut={signOutOffice}
                onDismiss={() => setOfficeOpen(false)}
              />
            ),
          }
        : {})}
      width={sidebarLayout.width}
      onStartResize={sidebarLayout.startResize}
      onCollapse={sidebarLayout.toggleCollapse}
      onToggleOfficeStatus={() => setOfficeOpen((open) => !open)}
      onNew={() => {
        setView('chat');
        create();
      }}
      onSelect={(id) => {
        setView('chat');
        conversations.select(id);
      }}
      {...(identity.context === undefined || identity.context.firstName.length === 0 ? {} : { userName: identity.context.firstName })}
      {...(userMenuOpen
        ? {
            userMenu: (
              <Popover placement="up-start" dismissLabel="Close menu" onDismiss={() => setUserMenuOpen(false)}>
                <Menu
                  items={[
                    { id: 'memory', label: 'Memory' },
                    { id: 'settings', label: 'Settings' },
                  ]}
                  onPick={(id) => {
                    setUserMenuOpen(false);
                    if (id === 'memory') return setView('memory');
                    return openSettings();
                  }}
                />
              </Popover>
            ),
          }
        : {})}
      onPressUser={pressUser}
      onToggleRowMenu={conversations.toggleRowMenu}
      onStartRename={(id, title) => {
        setRenameSurface('sidebar');
        conversations.startRename(id, title);
      }}
      onDraftChange={conversations.changeDraft}
      onCommitRename={conversations.commitRename}
      onCancelRename={conversations.cancelRename}
      onStartDelete={conversations.startDelete}
    />
  );

  return (
    <>
      <AppFrame
        sidebar={sidebarLayout.isCollapsed ? undefined : sidebar}
        {...(sidebarLayout.isCollapsed
          ? {
              bandControl: (
                <IconButton label="Show the sidebar" onClick={sidebarLayout.toggleCollapse} size="md">
                  <PanelIcon />
                </IconButton>
              ),
            }
          : {})}
      >
        {update?.updateAvailable === true && !updateDismissed && (
          <UpdateBanner
            version={update.latest ?? ''}
            {...(update.downloadUrl === undefined ? {} : { downloadUrl: update.downloadUrl })}
            {...(update.releaseUrl === undefined ? {} : { releaseUrl: update.releaseUrl })}
            onDismiss={() => setUpdateDismissed(true)}
          />
        )}
        {boot.step === 'no-provider' && <NoProviderNotice onOpenSettings={openSettings} />}
        {boot.step === 'failed' && <NoProviderNotice onOpenSettings={openSettings} />}
        {view === 'memory' && (
          <MemoryPage
            rows={memoryStore.items.map((item) => ({ id: item.id, text: item.text, source: item.source }))}
            {...(memoryStore.notice === undefined ? {} : { notice: memoryStore.notice })}
            isLoading={memoryStore.isLoading}
            {...(memoryStore.editingId === undefined ? {} : { editingId: memoryStore.editingId })}
            draft={memoryStore.draft}
            newText={memoryStore.newText}
            onBack={backToChat}
            onStartEdit={memoryStore.startEdit}
            onChangeDraft={memoryStore.changeDraft}
            onSaveEdit={memoryStore.saveEdit}
            onCancelEdit={memoryStore.cancelEdit}
            onRemove={memoryStore.remove}
            onChangeNew={memoryStore.changeNew}
            onAddNew={memoryStore.addNew}
            onClearAll={memoryStore.askClear}
          />
        )}
        {view === 'chat' && isReady && activeId !== undefined && (
          // Keyed so the composer draft resets between conversations. The transcript no
          // longer lives in this component, so remounting costs nothing.
          <ChatPage
            key={activeId}
            conversationId={activeId}
            view={viewFor(activeId)}
            {...(models === undefined || activeModel === undefined ? {} : { model: { value: activeModel, options: models } })}
            onHydrate={hydrateActive}
            onSend={sendToActive}
            onCancel={cancelActive}
            onChangeModel={changeModel}
            onComposerActivity={(hasText) => setComposerEmpty(!hasText)}
            {...(conversationHeader === undefined ? {} : { header: conversationHeader })}
          />
        )}
        {view === 'chat' && isReady && activeId === undefined && <EmptyConversations onNew={create} />}
      </AppFrame>
      {settingsOpen && (
        <SettingsOverlay onClose={closeSettings}>
          <SettingsPage {...(settingsSection === undefined ? {} : { initialSection: settingsSection })} onOfficeChanged={reloadOffice} />
        </SettingsOverlay>
      )}
      {memory.isOpen && memory.current !== undefined && (
        <MemoryConfirmDialog
          question={{
            term: memory.current.term,
            kind: memory.current.kind,
            quote: memory.current.quote,
            choices: [memory.current.suggestedDetail, ...memory.current.alternatives].filter((choice) => choice.length > 0),
            ...(memory.current.enrichment === undefined ? {} : { enrichment: memory.current.enrichment }),
          }}
          remaining={memory.pending.length}
          {...(memory.selected === undefined ? {} : { selected: memory.selected })}
          ownAnswer={memory.ownAnswer}
          isSaving={memory.isSaving}
          onSelect={memory.select}
          onChangeOwn={memory.changeOwn}
          onAccept={memory.accept}
          onSkip={memory.skip}
          onClose={memory.snooze}
        />
      )}
      {conversations.confirmingDeleteId !== undefined && (
        <ConfirmDialog
          title="Delete conversation?"
          body={`“${conversations.deletingTitle ?? 'This conversation'}” will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={conversations.confirmDelete}
          onCancel={conversations.cancelDelete}
        />
      )}
      {memoryStore.isConfirmingClear && (
        <ConfirmDialog
          title="Forget everything?"
          body="Marcel will forget every fact on this page. This can't be undone."
          confirmLabel="Forget everything"
          onConfirm={memoryStore.confirmClear}
          onCancel={memoryStore.cancelClear}
        />
      )}
      {conversations.error !== undefined && <Toast message={conversations.error} onDismiss={conversations.dismissError} />}
    </>
  );
};

App.displayName = 'App';
