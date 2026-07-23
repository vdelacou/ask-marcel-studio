import type { FC, ReactNode } from 'react';

// What the user writes about themselves, read into every conversation. The editor arrives
// as children (rule 21: it owns a library and a ref).
export type AboutYouPanelProps = {
  children: ReactNode;
};

export const AboutYouPanel: FC<AboutYouPanelProps> = ({ children }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">About you</h2>
      <p className="text-sm text-ink-muted">Who you are and what matters to you. Marcel reads this at the start of every conversation, so it does not have to be told twice.</p>
    </header>
    {children}
  </section>
);

AboutYouPanel.displayName = 'AboutYouPanel';
