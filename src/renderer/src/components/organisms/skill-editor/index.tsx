import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';

// The editor itself arrives as children, for the same reason the voice panel's does.
export type SkillEditorProps = {
  name: string;
  isBuiltIn: boolean;
  isModified: boolean;
  onBack: () => void;
  onRestore: () => void;
  children: ReactNode;
};

export const SkillEditor: FC<SkillEditorProps> = ({ name, isBuiltIn, isModified, onBack, onRestore, children }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex min-w-0 flex-col gap-y-1">
        <button type="button" onClick={onBack} className="self-start text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
          ‹ All skills
        </button>
        <h2 className="truncate font-mono text-lg font-semibold tracking-tight text-ink">{name}</h2>
        <p className="text-sm text-ink-muted">
          {isBuiltIn ? 'This one came with the app. Your changes stay until you put the original back.' : 'Your own skill. It applies from your next message.'}
        </p>
      </div>
      {isBuiltIn && isModified && (
        <Button variant="secondary" onClick={onRestore}>
          Put the original back
        </Button>
      )}
    </header>
    {children}
  </section>
);

SkillEditor.displayName = 'SkillEditor';
