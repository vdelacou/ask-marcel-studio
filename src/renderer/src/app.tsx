/*
 * The app shell. Owns the view toggle and the bootstrap, hands plain props to the
 * design system.
 *
 * Carries no class string (rule 22) and calls no hook inside a design-system
 * component (rule 21).
 *
 * M2 shows ONE conversation: the most recent, or a new one. The sidebar and the
 * conversation list are not in M2's definition of done, so state stays local here.
 * docs/PLAN.md names zustand for the renderer; it earns its place when the sidebar
 * needs cross-component state, not before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { AppFrame } from './components/organisms/app-frame/index.tsx';
import type { AppView } from './components/organisms/app-frame/index.tsx';
import { NoProviderNotice } from './components/organisms/no-provider-notice/index.tsx';
import { ChatPage } from './page/chat-page.tsx';
import { SettingsPage } from './page/settings-page.tsx';
import { formatModelRef } from '../../shared/model-ref.ts';

type Boot =
  | { readonly step: 'loading' }
  | { readonly step: 'no-provider' }
  | { readonly step: 'ready'; readonly conversationId: string }
  | { readonly step: 'failed'; readonly message: string };

export const App: FC = () => {
  const [view, setView] = useState<AppView>('chat');
  const [boot, setBoot] = useState<Boot>({ step: 'loading' });
  // Bootstrap lists conversations and creates one if there are none, which is a
  // read-then-write race: two concurrent runs both see an empty list and both create.
  // That really happens — StrictMode double-invokes the effect, and switching back to
  // chat calls bootstrap again. Caught live: it produced two conversations 5ms apart.
  const bootstrapping = useRef(false);

  const bootstrap = useCallback((): void => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    void (async (): Promise<void> => {
      const settings = await studio.settings.get();
      if (!settings.ok) {
        setBoot({ step: 'failed', message: settings.error.message });
        return;
      }
      const first = settings.value.providers[0];
      const firstModel = first?.modelIds[0];
      if (first === undefined || firstModel === undefined) {
        setBoot({ step: 'no-provider' });
        return;
      }

      // Reopen the most recent conversation, so quitting and relaunching lands the
      // user back where they were. That is what makes resume visible.
      const listed = await studio.conversations.list();
      if (!listed.ok) {
        setBoot({ step: 'failed', message: listed.error.message });
        return;
      }
      const existing = listed.value[0];
      if (existing !== undefined) {
        setBoot({ step: 'ready', conversationId: existing.id });
        return;
      }

      const model = settings.value.defaultModel ?? formatModelRef({ providerId: first.id, modelId: firstModel });
      const created = await studio.conversations.create({ model });
      setBoot(created.ok ? { step: 'ready', conversationId: created.value.id } : { step: 'failed', message: created.error.message });
    })().finally(() => {
      // Released on every path, including the early returns above: a guard that
      // leaks would wedge the app on a transient settings read failure.
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

  return (
    <AppFrame title="Ask Marcel Studio" view={view} onSelectView={onSelectView}>
      {view === 'settings' && <SettingsPage />}
      {view === 'chat' && boot.step === 'no-provider' && <NoProviderNotice onOpenSettings={() => setView('settings')} />}
      {view === 'chat' && boot.step === 'ready' && <ChatPage conversationId={boot.conversationId} />}
      {view === 'chat' && boot.step === 'failed' && <NoProviderNotice onOpenSettings={() => setView('settings')} />}
    </AppFrame>
  );
};

App.displayName = 'App';
