import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type SkillCardProps = {
  name: string;
  description: string;
  isBuiltIn: boolean;
  onRemove: () => void;
};

export const SkillCard: FC<SkillCardProps> = ({ name, description, isBuiltIn, onRemove }) => (
  <article className="flex items-start gap-x-3 rounded-panel border border-border-subtle bg-surface-raised p-3">
    <div className="flex min-w-0 flex-1 flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <h3 className="truncate font-mono text-sm font-medium text-ink">{name}</h3>
        {isBuiltIn && <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">built in</span>}
      </div>
      <p className="line-clamp-3 text-xs text-ink-muted">{description}</p>
    </div>
    {/* A built-in is re-seeded every launch, so removing it would just come back.
        Hiding the button is more honest than showing one that refuses. */}
    {!isBuiltIn && (
      <Button variant="danger" onClick={onRemove}>
        Remove
      </Button>
    )}
  </article>
);

SkillCard.displayName = 'SkillCard';
