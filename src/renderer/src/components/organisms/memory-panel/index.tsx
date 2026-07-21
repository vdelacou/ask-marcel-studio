import type { FC, ReactNode } from 'react';
import { ModeTabs } from '../../molecules/mode-tabs/index.tsx';

export type MemoryNoteId = 'jargon' | 'team' | 'people';

// The editor arrives as children, like the other document panels (rule 21).
export type MemoryPanelProps = {
  note: MemoryNoteId;
  pendingCount: number;
  onSelectNote: (note: MemoryNoteId) => void;
  children: ReactNode;
};

const TABS = [
  { id: 'jargon', label: 'Words we use' },
  { id: 'team', label: 'My team' },
  { id: 'people', label: 'People I work with' },
];

const asNote = (id: string): MemoryNoteId => {
  if (id === 'team') return 'team';
  if (id === 'people') return 'people';
  return 'jargon';
};

export const MemoryPanel: FC<MemoryPanelProps> = ({ note, pendingCount, onSelectNote, children }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">What Marcel remembers</h2>
      <p className="text-sm text-ink-muted">
        Words your organisation uses, and who is who. Marcel reads these before every message, and asks before adding anything.
        {pendingCount > 0 && ` ${String(pendingCount)} waiting to be confirmed.`}
      </p>
    </header>
    <ModeTabs tabs={TABS} active={note} onSelect={(id) => onSelectNote(asNote(id))} />
    {children}
  </section>
);

MemoryPanel.displayName = 'MemoryPanel';
