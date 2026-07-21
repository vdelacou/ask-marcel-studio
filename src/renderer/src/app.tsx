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
import type { FC } from 'react';
import { AppFrame } from './components/organisms/app-frame/index.tsx';
import { NoProviderNotice } from './components/organisms/no-provider-notice/index.tsx';
import { EmptyConversations } from './components/organisms/empty-conversations/index.tsx';
import { Sidebar } from './components/organisms/sidebar/index.tsx';
import { SettingsOverlay } from './components/organisms/settings-overlay/index.tsx';
import { Toast } from './components/molecules/toast/index.tsx';
import { ChatHeader } from './components/organisms/chat-header/index.tsx';
import { ChatPage } from './page/chat-page.tsx';
import { SettingsPage } from './page/settings-page.tsx';
import { useConversations } from './hooks/use-conversations.ts';
import { useChatViews } from './hooks/use-chat-views.ts';
import { modelOptions } from './lib/model-options.ts';
import type { ModelOption } from './lib/model-options.ts';
import { formatModelRef } from '../../shared/model-ref.ts';

type Boot =
  | { readonly step: 'loading' }
  | { readonly step: 'no-provider' }
  | { readonly step: 'ready'; readonly defaultModel: string; readonly models: readonly ModelOption[] }
  | { readonly step: 'failed'; readonly message: string };

export const App: FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      const first = settings.value.providers[0];
      const firstModel = first?.modelIds[0];
      if (first === undefined || firstModel === undefined) return setBoot({ step: 'no-provider' });
      const defaultModel = settings.value.defaultModel ?? formatModelRef({ providerId: first.id, modelId: firstModel });
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

  const openSettings = useCallback((): void => setSettingsOpen(true), []);
  // Closing may mean a provider was just added, so re-resolve the default model.
  const closeSettings = useCallback((): void => {
    setSettingsOpen(false);
    bootstrap();
  }, [bootstrap]);

  // Escape closes the overlay. Here, not in the modal, so the modal stays prop-pure.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, closeSettings]);

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

  const sidebar = (
    <Sidebar
      conversations={list.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        ...(conversations.activity[c.id] === undefined ? {} : { activity: conversations.activity[c.id] }),
      }))}
      {...(list.activeId === undefined ? {} : { activeId: list.activeId })}
      {...(conversations.editingId === undefined ? {} : { editingId: conversations.editingId })}
      draftTitle={conversations.draftTitle}
      {...(conversations.confirmingDeleteId === undefined ? {} : { confirmingDeleteId: conversations.confirmingDeleteId })}
      isSettingsActive={settingsOpen}
      onNew={create}
      onSelect={conversations.select}
      onOpenSettings={openSettings}
      onStartRename={conversations.startRename}
      onDraftChange={conversations.changeDraft}
      onCommitRename={conversations.commitRename}
      onCancelRename={conversations.cancelRename}
      onStartDelete={conversations.startDelete}
      onConfirmDelete={conversations.confirmDelete}
      onCancelDelete={conversations.cancelDelete}
    />
  );

  return (
    <>
      <AppFrame sidebar={sidebar}>
        {boot.step === 'no-provider' && <NoProviderNotice onOpenSettings={openSettings} />}
        {boot.step === 'failed' && <NoProviderNotice onOpenSettings={openSettings} />}
        {isReady && activeId !== undefined && models !== undefined && activeModel !== undefined && <ChatHeader value={activeModel} options={models} onChange={changeModel} />}
        {isReady && activeId !== undefined && (
          // Keyed so the composer draft resets between conversations. The transcript no
          // longer lives in this component, so remounting costs nothing.
          <ChatPage key={activeId} conversationId={activeId} view={viewFor(activeId)} onHydrate={hydrateActive} onSend={sendToActive} onCancel={cancelActive} />
        )}
        {isReady && activeId === undefined && <EmptyConversations onNew={create} />}
      </AppFrame>
      {settingsOpen && (
        <SettingsOverlay onClose={closeSettings}>
          <SettingsPage />
        </SettingsOverlay>
      )}
      {conversations.error !== undefined && <Toast message={conversations.error} onDismiss={conversations.dismissError} />}
    </>
  );
};

App.displayName = 'App';
