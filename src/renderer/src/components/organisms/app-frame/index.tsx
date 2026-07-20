import type { FC, ReactNode } from 'react';

// Layout only (rule 22). The sidebar owns the app's navigation, so the frame is just
// the two columns and has no title bar; the window's traffic lights sit over the
// sidebar's padded, draggable top.
export type AppFrameProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export const AppFrame: FC<AppFrameProps> = ({ sidebar, children }) => (
  <div className="flex h-full flex-col bg-surface font-sans text-ink">
    {/* Full-width draggable band: the window has no title bar, so this is what you grab to
        move it, and the traffic lights sit in its top-left. */}
    <div className="h-9 shrink-0 [-webkit-app-region:drag]" />
    <div className="flex min-h-0 flex-1">
      {sidebar}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  </div>
);

AppFrame.displayName = 'AppFrame';
