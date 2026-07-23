import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';

// The instructions editor arrives as children (rule 21: it owns a library and a ref).
export type AgentEditorProps = {
  name: string;
  // The handle Marcel uses, derived from the name. Shown so the user can see what they
  // typed became.
  slug: string;
  description: string;
  isBuiltIn: boolean;
  isNew: boolean;
  isModified: boolean;
  error?: string;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string) => void;
  onBack: () => void;
  onRemove: () => void;
  onRestore: () => void;
  children: ReactNode;
};

const nameHint = (isBuiltIn: boolean, slug: string): string => {
  if (isBuiltIn) return 'This one came with the app.';
  return slug.length > 0 ? `Marcel refers to it as ${slug}.` : 'Give it a name a person would use.';
};

export const AgentEditor: FC<AgentEditorProps> = ({
  name,
  slug,
  description,
  isBuiltIn,
  isNew,
  isModified,
  error,
  onChangeName,
  onChangeDescription,
  onBack,
  onRemove,
  onRestore,
  children,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex min-w-0 flex-col gap-y-1">
        <button type="button" onClick={onBack} className="self-start text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
          ‹ All agents
        </button>
        <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{isNew ? 'New agent' : name}</h2>
      </div>
      <div className="flex shrink-0 gap-x-2">
        {isBuiltIn && isModified && (
          <Button variant="secondary" onClick={onRestore}>
            Put the original back
          </Button>
        )}
        {!isBuiltIn && !isNew && (
          <Button variant="danger" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </header>

    <Field label="Name" htmlFor="agent-name" hint={nameHint(isBuiltIn, slug)}>
      <TextInput id="agent-name" value={name} disabled={isBuiltIn} placeholder="Weekly report" onChange={(event) => onChangeName(event.target.value)} />
    </Field>

    <Field label="When to use it" htmlFor="agent-description" hint="Marcel reads this to decide when to hand a job over, so be specific.">
      <TextArea
        id="agent-description"
        size="compact"
        value={description}
        placeholder="Reads a long document and returns a summary."
        onChange={(event) => onChangeDescription(event.target.value)}
      />
    </Field>

    <div className="flex flex-col gap-y-1.5">
      <span className="text-xs font-medium text-ink-muted">Instructions</span>
      {children}
    </div>

    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}
  </section>
);

AgentEditor.displayName = 'AgentEditor';
