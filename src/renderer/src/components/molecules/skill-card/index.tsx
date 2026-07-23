import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type SkillCardProps = {
  // What a person calls it, and under it the handle they type after a slash.
  title: string;
  folder: string;
  description: string;
  isBuiltIn: boolean;
  // A built-in the user has changed: it no longer follows app updates, and the editor
  // offers to put the original back.
  isModified: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

export const SkillCard: FC<SkillCardProps> = ({ title, folder, description, isBuiltIn, isModified, onEdit, onRemove }) => (
  <article className="flex items-start gap-x-3 rounded-panel border border-border-subtle bg-surface-raised p-3">
    <div className="flex min-w-0 flex-1 flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <h3 className="truncate text-sm font-medium text-ink">{title}</h3>
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">/{folder}</span>
        {isBuiltIn && <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">built in</span>}
        {isModified && <span className="shrink-0 rounded-full border border-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">edited</span>}
      </div>
      <p className="line-clamp-3 text-xs text-ink-muted">{description}</p>
    </div>
    <div className="flex shrink-0 gap-x-2">
      <Button variant="secondary" onClick={onEdit}>
        Edit
      </Button>
      {/* A built-in comes back with the app, so removing it would just reappear.
          Hiding the button is more honest than showing one that refuses. */}
      {!isBuiltIn && (
        <Button variant="danger" onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  </article>
);

SkillCard.displayName = 'SkillCard';
