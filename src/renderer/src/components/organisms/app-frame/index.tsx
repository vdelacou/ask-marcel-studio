import type { FC, ReactNode } from 'react';

export type AppView = 'chat' | 'settings';

export type AppFrameProps = {
  title: string;
  view: AppView;
  onSelectView: (view: AppView) => void;
  children: ReactNode;
};

const tabStyles = {
  active: 'bg-surface-raised text-ink',
  idle: 'text-ink-muted hover:text-ink',
};

export const AppFrame: FC<AppFrameProps> = ({ title, view, onSelectView, children }) => (
  <div className="flex h-full flex-col bg-surface font-sans text-ink">
    <header className="flex shrink-0 items-center gap-x-3 border-b border-border-subtle px-4 py-2 [-webkit-app-region:drag]">
      <p className="flex-1 truncate pl-16 text-xs text-ink-muted">{title}</p>
      <nav aria-label="Views" className="flex gap-x-1 [-webkit-app-region:no-drag]">
        {(['chat', 'settings'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-current={view === candidate ? 'page' : undefined}
            onClick={() => onSelectView(candidate)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${view === candidate ? tabStyles.active : tabStyles.idle}`}
          >
            {candidate}
          </button>
        ))}
      </nav>
    </header>
    <main className="flex min-h-0 flex-1 flex-col">{children}</main>
  </div>
);

AppFrame.displayName = 'AppFrame';
