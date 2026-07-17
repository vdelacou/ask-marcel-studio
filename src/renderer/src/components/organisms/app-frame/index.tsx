import type { FC, ReactNode } from 'react';

export type AppFrameProps = {
  title: string;
  children: ReactNode;
};

// The window chrome: a titlebar-safe header plus a scrolling body. M1 has one
// screen, so there is no nav yet; the sidebar arrives with conversations in M2.
export const AppFrame: FC<AppFrameProps> = ({ title, children }) => (
  <div className="flex h-full flex-col bg-surface font-sans text-ink">
    <header className="flex shrink-0 items-center justify-center border-b border-border-subtle px-4 py-3 [-webkit-app-region:drag]">
      <h1 className="text-sm font-medium text-ink-muted">{title}</h1>
    </header>
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">{children}</main>
  </div>
);

AppFrame.displayName = 'AppFrame';
