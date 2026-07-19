/*
 * The app shell. Owns the view toggle and provider bootstrap, drives the conversation
 * list through the use-conversations hook, and hands plain props to the design system.
 *
 * Carries no class string (rule 22) and calls no hook inside a design-system
 * component (rule 21): every hook lives here or in src/renderer/src/hooks.
 *
 * Bootstrap resolves the provider and the default model only; listing, opening and
 * creating conversations belongs to the hook, which owns that state for the sidebar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { AppFrame } from './components/organisms/app-frame/index.tsx';
import type { AppView } from './components/organisms/app-frame/index.tsx';
import { NoProviderNotice } from './components/organisms/no-provider-notice/index.tsx';
import { EmptyConversations } from './components/organisms/empty-conversations/index.tsx';
import { Sidebar } from './components/organisms/sidebar/index.tsx';
import { Toast } from './components/molecules/toast/index.tsx';
import { ChatPage } from './page/chat-page.tsx';
import { SettingsPage } from './page/settings-page.tsx';
import { useConversations } from './hooks/use-conversations.ts';
import { formatModelRef } from '../../shared/model-ref.ts';

type Boot =
  | { readonly step: 'loading' }
  | { readonly step: 'no-provider' }
  | { readonly step: 'ready'; readonly defaultModel: string }
  | { readonly step: 'failed'; readonly message: string };

export const App: FC = () => {
  const [view, setView] = useState<AppView>('chat');
  const [boot, setBoot] = useState<Boot>({ step: 'loading' });
  // Same read guard the hook documents: StrictMode double-invokes the effect and
  // switching back to chat calls bootstrap again.
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
      return setBoot({ step: 'ready', defaultModel });
    })().finally(() => {
      bootstrapping.current = false;
    });
  }, []);

  useEffect(bootstrap, [bootstrap]);

  const onSelectView = useCallback(
    (next: AppView): void => {
      setView(next);
      // Coming back from settings may mean a provider now exists.
      if (next === 'chat') bootstrap();
    },
    [bootstrap]
  );

  const conversations = useConversations(boot.step === 'ready' ? boot.defaultModel : undefined);
  const list = conversations.view;
  const isChatReady = view === 'chat' && boot.step === 'ready';

  // Built unconditionally, mounted only in chat view: keeping the ternaries out of one
  // another is what satisfies sonarjs/no-nested-conditional, and the spreads are how an
  // optional prop stays absent rather than explicitly undefined (exactOptionalPropertyTypes).
  const sidebar = (
    <Sidebar
      conversations={list.conversations.map((c) => ({ id: c.id, title: c.title }))}
      {...(list.activeId === undefined ? {} : { activeId: list.activeId })}
      {...(conversations.editingId === undefined ? {} : { editingId: conversations.editingId })}
      draftTitle={conversations.draftTitle}
      {...(conversations.confirmingDeleteId === undefined ? {} : { confirmingDeleteId: conversations.confirmingDeleteId })}
      onNew={conversations.create}
      onSelect={conversations.select}
      onStartRename={conversations.startRename}
      onDraftChange={conversations.changeDraft}
      onCommitRename={conversations.commitRename}
      onCancelRename={conversations.cancelRename}
      onStartDelete={conversations.startDelete}
      onConfirmDelete={conversations.confirmDelete}
      onCancelDelete={conversations.cancelDelete}
    />
  );

  const onOpenSettings = useCallback((): void => setView('settings'), []);

  return (
    <>
      <AppFrame title="Ask Marcel Studio" view={view} onSelectView={onSelectView} {...(isChatReady ? { sidebar } : {})}>
        {view === 'settings' && <SettingsPage />}
        {view === 'chat' && boot.step === 'no-provider' && <NoProviderNotice onOpenSettings={onOpenSettings} />}
        {view === 'chat' && boot.step === 'failed' && <NoProviderNotice onOpenSettings={onOpenSettings} />}
        {isChatReady && list.activeId !== undefined && <ChatPage key={list.activeId} conversationId={list.activeId} />}
        {isChatReady && list.activeId === undefined && <EmptyConversations onNew={conversations.create} />}
      </AppFrame>
      {conversations.error !== undefined && <Toast message={conversations.error} onDismiss={conversations.dismissError} />}
    </>
  );
};

App.displayName = 'App';
