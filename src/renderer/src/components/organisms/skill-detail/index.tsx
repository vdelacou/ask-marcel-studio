import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { Toggle } from '../../atoms/toggle/index.tsx';

// A skill shown as the fields a person edits, not as a raw file. Built-ins are read-only:
// their fields are disabled and their body is rendered rather than editable, but they can
// be switched off, and put back if the user had changed one. The body editor arrives as
// children, the way the other panels pass theirs.
export type SkillDetailProps = {
  title: string;
  folder: string;
  isBuiltIn: boolean;
  isModified: boolean;
  isActive: boolean;
  name: string;
  displayName: string;
  description: string;
  extras: readonly { readonly key: string; readonly value: string }[];
  // The body, editable (own skills) or rendered (built-ins).
  bodyEditor?: ReactNode;
  bodyRendered?: ReactNode;
  onBack: () => void;
  onToggleActive: () => void;
  onChangeName: (value: string) => void;
  onChangeDisplayName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onRestore: () => void;
};

export const SkillDetail: FC<SkillDetailProps> = ({
  title,
  folder,
  isBuiltIn,
  isModified,
  isActive,
  name,
  displayName,
  description,
  extras,
  bodyEditor,
  bodyRendered,
  onBack,
  onToggleActive,
  onChangeName,
  onChangeDisplayName,
  onChangeDescription,
  onRestore,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-start justify-between gap-x-4">
      <div className="flex min-w-0 flex-col gap-y-1">
        <button type="button" onClick={onBack} className="self-start text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
          ‹ All skills
        </button>
        <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">
          {isBuiltIn
            ? 'This one came with the app, so its wording is fixed. You can switch it off, and put the original back if you had changed it.'
            : 'Your own skill. It applies from your next message.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-x-2">
        <span className="text-xs text-ink-muted">{isActive ? 'On' : 'Off'}</span>
        <Toggle checked={isActive} label={`${isActive ? 'Switch off' : 'Switch on'} ${title}`} onChange={onToggleActive} />
      </div>
    </header>

    <Field label="Name" htmlFor="skill-display-name" hint="What you and Marcel call it. Marcel refers to it as the handle below.">
      <TextInput id="skill-display-name" value={displayName} disabled={isBuiltIn} onChange={(event) => onChangeDisplayName(event.target.value)} />
    </Field>

    <Field label="Handle" htmlFor="skill-name" hint={`Typed after a slash, and saved in the folder ${folder}. Lowercase letters, numbers and dashes.`}>
      <TextInput id="skill-name" value={name} disabled={isBuiltIn} onChange={(event) => onChangeName(event.target.value)} />
    </Field>

    <Field label="When to use it" htmlFor="skill-description" hint="Marcel reads this to decide when the skill applies. Line breaks are saved as spaces.">
      <TextArea id="skill-description" size="compact" value={description} disabled={isBuiltIn} onChange={(event) => onChangeDescription(event.target.value)} />
    </Field>

    {extras.length > 0 && (
      <div className="flex flex-col gap-y-1">
        <p className="text-xs font-medium text-ink-muted">Other settings this skill carries</p>
        <ul className="flex flex-col gap-y-0.5 rounded-md border border-border-subtle p-2.5">
          {extras.map((extra) => (
            <li key={extra.key} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-mono text-ink-muted">{extra.key}</span>
              <span className="text-ink">{extra.value}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className="flex flex-col gap-y-1">
      <p className="text-xs font-medium text-ink-muted">Instructions</p>
      {isBuiltIn ? <div className="rounded-md border border-border-subtle p-3">{bodyRendered}</div> : bodyEditor}
    </div>

    {isBuiltIn && isModified && (
      <Button variant="secondary" onClick={onRestore}>
        Put the original wording back
      </Button>
    )}
  </section>
);

SkillDetail.displayName = 'SkillDetail';
