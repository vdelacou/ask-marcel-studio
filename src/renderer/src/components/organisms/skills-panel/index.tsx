import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { SkillCard } from '../../molecules/skill-card/index.tsx';

export type SkillRow = { folder: string; name: string; description: string; isBuiltIn: boolean; isModified: boolean };

export type SkillsPanelProps = {
  skills: readonly SkillRow[];
  error?: string;
  isAdding: boolean;
  onAdd: () => void;
  onEdit: (folder: string) => void;
  onRemove: (folder: string) => void;
};

export const SkillsPanel: FC<SkillsPanelProps> = ({ skills, error, isAdding, onAdd, onEdit, onRemove }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Skills</h2>
        <p className="text-sm text-ink-muted">Folders with a SKILL.md. A new skill applies from your next message.</p>
      </div>
      <Button variant="secondary" onClick={onAdd} disabled={isAdding}>
        {isAdding ? 'Adding…' : 'Add skill'}
      </Button>
    </header>

    {skills.map((skill) => (
      <SkillCard
        key={skill.folder}
        name={skill.name}
        description={skill.description}
        isBuiltIn={skill.isBuiltIn}
        isModified={skill.isModified}
        onEdit={() => onEdit(skill.folder)}
        onRemove={() => onRemove(skill.folder)}
      />
    ))}

    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}
  </section>
);

SkillsPanel.displayName = 'SkillsPanel';
