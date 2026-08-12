import type { FC, ReactNode } from 'react';

// One of the notes Marcel reads before every message. Props-only (rule 21): the heading
// and its explanation come from the page, the editor arrives as children, exactly like the
// other document panels.
//
// One panel for all three notes rather than three near-identical ones: they differ by their
// words, not by their shape.
export type NotePanelProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export const NotePanel: FC<NotePanelProps> = ({ title, description, children }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <p className="text-sm text-ink-muted">{description}</p>
    </header>
    {children}
  </section>
);

NotePanel.displayName = 'NotePanel';
