/*
 * The app shell. Owns wiring, hands plain props to the design system.
 *
 * Carries no class string of its own (hard rule 22) and calls no hook inside a
 * design-system component (hard rule 21).
 *
 * M1 has one screen. The chat/settings split and the sidebar arrive in M2.
 */
import type { FC } from 'react';
import { AppFrame } from './components/organisms/app-frame/index.tsx';
import { SettingsPage } from './page/settings-page.tsx';

export const App: FC = () => (
  <AppFrame title="Ask Marcel Studio">
    <SettingsPage />
  </AppFrame>
);

App.displayName = 'App';
