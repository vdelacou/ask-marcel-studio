import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Popover } from '../../molecules/popover/index.tsx';
import { Menu } from '../../molecules/menu/index.tsx';
import { SkillCard } from '../../molecules/skill-card/index.tsx';

export type SkillRow = { folder: string; displayName: string; description: string; isBuiltIn: boolean; isModified: boolean; isActive: boolean };

export type SkillsPanelProps = {
  skills: readonly SkillRow[];
  error?: string;
  isImporting: boolean;
  isAddMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onCreate: () => void;
  onImport: () => void;
  onEdit: (folder: string) => void;
  onRemove: (folder: string) => void;
};

export const SkillsPanel: FC<SkillsPanelProps> = ({ skills, error, isImporting, isAddMenuOpen, onToggleAddMenu, onCreate, onImport, onEdit, onRemove }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Skills</h2>
        <p className="text-sm text-ink-muted">Folders with a SKILL.md. A new skill applies from your next message.</p>
      </div>
      <div className="relative shrink-0">
        <Button variant="secondary" onClick={onToggleAddMenu} disabled={isImporting}>
          {isImporting ? 'Adding…' : 'Add skill'}
        </Button>
        {isAddMenuOpen && (
          <Popover placement="down-end" dismissLabel="Close menu" onDismiss={onToggleAddMenu}>
            <Menu
              items={[
                { id: 'create', label: 'Write one from scratch' },
                { id: 'import', label: 'Add a folder from your computer…' },
              ]}
              onPick={(id) => (id === 'create' ? onCreate() : onImport())}
            />
          </Popover>
        )}
      </div>
    </header>

    {skills.map((skill) => (
      <SkillCard
        key={skill.folder}
        title={skill.displayName}
        folder={skill.folder}
        description={skill.description}
        isBuiltIn={skill.isBuiltIn}
        isModified={skill.isModified}
        isActive={skill.isActive}
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
