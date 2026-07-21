import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';

// The editor itself is passed in as children: it holds a third-party library and a
// mutable ref, neither of which may live in the design system (rule 21).
export type VoicePanelProps = {
  isRegenerating: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  children: ReactNode;
};

export const VoicePanel: FC<VoicePanelProps> = ({ isRegenerating, canRegenerate, onRegenerate, children }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Writing voice</h2>
        <p className="text-sm text-ink-muted">How you write, so a draft sounds like you rather than like an assistant.</p>
      </div>
      <Button variant="secondary" onClick={onRegenerate} disabled={isRegenerating || !canRegenerate}>
        {isRegenerating ? 'Reading your sent mail…' : 'Rebuild from my sent mail'}
      </Button>
    </header>
    {children}
  </section>
);

VoicePanel.displayName = 'VoicePanel';
