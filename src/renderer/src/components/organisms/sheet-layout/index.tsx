import type { FC, ReactNode } from 'react';

// Two panes: a fixed left menu and the active panel in a padded, centered, scrollable
// column. Layout only (rule 22 keeps the page shell class-free); the nav and the panels
// own their own internals.
export type SheetLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
  // A quiet line pinned to the bottom of the nav column: the app's version lives here.
  footer?: ReactNode;
};

export const SheetLayout: FC<SheetLayoutProps> = ({ nav, children, footer }) => (
  <div className="flex min-h-0 flex-1">
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border-subtle px-3 py-6">
      {nav}
      {footer !== undefined && <div className="mt-auto pt-6">{footer}</div>}
    </aside>
    {/* min-w-0, for the same reason the app frame carries it: a flex item's default
        min-width is its content, so one wide thing inside a panel (a code block in a
        skill's instructions, a table) grew this column past the sheet and pushed every
        form field's right edge out of sight instead of scrolling inside itself. */}
    <div className="min-w-0 flex-1 overflow-y-auto">
      {/* The column stays a reading width even when the dialog grows: a form field
          stretched to a metre wide is harder to fill in, not easier. */}
      <div className="mx-auto flex w-full min-w-0 max-w-reading flex-col gap-y-12 px-10 py-10">{children}</div>
    </div>
  </div>
);

SheetLayout.displayName = 'SheetLayout';
