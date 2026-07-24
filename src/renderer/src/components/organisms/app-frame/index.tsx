import type { FC, ReactNode } from 'react';

// Layout only (rule 22). Two full-height columns, no title bar: the sidebar owns the app's
// navigation and its surface runs to the window top, where the OS traffic lights overlay its
// first row. The content column carries its own top strip (the conversation header), so the
// frame reserves no band of its own.
export type AppFrameProps = {
  sidebar: ReactNode;
  children: ReactNode;
  // The way back to a hidden sidebar. Rendered as a chip in the content column's top-left,
  // clear of the traffic lights, only while the sidebar is collapsed (there is no sidebar
  // strip to hold it then).
  reopenControl?: ReactNode;
};

export const AppFrame: FC<AppFrameProps> = ({ sidebar, children, reopenControl }) => (
  <div className="flex h-full bg-surface font-sans text-ink">
    {sidebar}
    {/* min-w-0: without it a wide code block or table inside the thread grows the flex item
        and pushes the sidebar off screen instead of scrolling inside its column. relative:
        anchors the reopen chip to this column's top-left. */}
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
      {/* Last in the DOM on purpose. -webkit-app-region regions resolve by document order,
          not z-index: the conversation header (and the empty-state canvas) are draggable, and
          a no-drag chip painted over one of them only wins the OS hit-test, and stays
          clickable, when it is collected AFTER that drag region. First in the DOM, the header
          overrode it and the OS swallowed the click as a window drag. */}
      {reopenControl !== undefined && <div className="absolute left-[5.5rem] top-0 z-30 flex h-12 items-center [-webkit-app-region:no-drag]">{reopenControl}</div>}
    </main>
  </div>
);

AppFrame.displayName = 'AppFrame';
