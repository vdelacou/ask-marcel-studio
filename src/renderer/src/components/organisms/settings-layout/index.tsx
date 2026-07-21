import type { FC, ReactNode } from 'react';

// Two panes: a fixed left menu and the active panel in a padded, centered, scrollable
// column. Layout only (rule 22 keeps the page shell class-free); the nav and the panels
// own their own internals.
export type SettingsLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};

export const SettingsLayout: FC<SettingsLayoutProps> = ({ nav, children }) => (
  <div className="flex min-h-0 flex-1">
    <aside className="w-56 shrink-0 overflow-y-auto border-r border-border-subtle px-3 py-6">{nav}</aside>
    <div className="flex-1 overflow-y-auto">
      {/* The column stays a reading width even when the dialog grows: a form field
          stretched to a metre wide is harder to fill in, not easier. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-y-12 px-10 py-10">{children}</div>
    </div>
  </div>
);

SettingsLayout.displayName = 'SettingsLayout';
