import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

// One agent Marcel can delegate to.
export type AgentCardProps = {
  name: string;
  description: string;
  isBuiltIn: boolean;
  isModified: boolean;
  onEdit: () => void;
};

export const AgentCard: FC<AgentCardProps> = ({ name, description, isBuiltIn, isModified, onEdit }) => (
  <article className="flex items-start gap-x-3 rounded-panel border border-border-subtle bg-surface-raised p-3">
    <div className="flex min-w-0 flex-1 flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <h3 className="truncate font-mono text-sm font-medium text-ink">{name}</h3>
        {isBuiltIn && <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">built in</span>}
        {isModified && <span className="shrink-0 rounded-full border border-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">edited</span>}
      </div>
      <p className="line-clamp-3 text-xs text-ink-muted">{description}</p>
    </div>
    <Button variant="secondary" onClick={onEdit}>
      Edit
    </Button>
  </article>
);

AgentCard.displayName = 'AgentCard';
