import type { FC } from 'react';

// The sidebar glyph: a panel with its left column marked. Used by both the hide button in
// the sidebar's top strip and the show button in the content column, shown while the
// sidebar is collapsed.
export const PanelIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0" aria-hidden="true">
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M8 3.5v13" />
  </svg>
);

PanelIcon.displayName = 'PanelIcon';
