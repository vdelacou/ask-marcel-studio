import type { FC, ReactNode } from 'react';

// Layout only (rule 22). The sidebar owns the app's navigation, so the frame is just
// the two columns and has no title bar; the window's traffic lights sit over the
// sidebar's padded, draggable top.
export type AppFrameProps = {
  sidebar: ReactNode;
  children: ReactNode;
  // Sits inside the draggable band, clear of the traffic lights: the way back to a
  // sidebar the user has hidden.
  bandControl?: ReactNode;
};

export const AppFrame: FC<AppFrameProps> = ({ sidebar, children, bandControl }) => (
  <div className="flex h-full flex-col bg-surface font-sans text-ink">
    {/* Full-width draggable band: the window has no title bar, so this is what you grab to
        move it, and the traffic lights sit in its top-left. Anything interactive inside it
        has to opt out of the drag region, or the OS eats the click. */}
    <div className="flex h-9 shrink-0 items-center [-webkit-app-region:drag]">
      {bandControl !== undefined && <div className="pl-[5.5rem] [-webkit-app-region:no-drag]">{bandControl}</div>}
    </div>
    <div className="flex min-h-0 flex-1">
      {sidebar}
      {/* min-w-0: without it a wide code block or table inside the thread grows the flex
          item and pushes the sidebar off screen instead of scrolling inside its column. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  </div>
);

AppFrame.displayName = 'AppFrame';
