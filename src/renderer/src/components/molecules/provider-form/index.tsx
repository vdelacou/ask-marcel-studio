import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { Select } from '../../atoms/select/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';
import { ModelList } from '../model-list/index.tsx';
import type { ModelTestRow } from '../model-list/index.tsx';

// What one provider looks like while it is being edited. Text fields hold strings; the
// models are a list edited one entry at a time. The page shell saves it, trimming each
// model and dropping the blank rows an in-progress edit leaves behind.
export type ProviderDraft = {
  readonly rowId: string;
  readonly id: string;
  readonly kind: 'anthropic' | 'openai' | 'claude-plan';
  readonly label: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelIds: readonly string[];
};

// Where the Claude plan sign-in stands, worked out upstream (lib/claude-plan-view) so this
// stays props-only (rule 21). A typed tone, not a class name (rule 22).
export type PlanSignInView = {
  readonly line: string;
  readonly tone: 'good' | 'muted' | 'bad';
  readonly buttonLabel: string;
  readonly isBusy: boolean;
};

export type ProviderFormProps = {
  draft: ProviderDraft;
  // What the last Test said about each model, keyed by name.
  modelTests?: Readonly<Record<string, ModelTestRow>>;
  // Shown for a Claude plan provider, in place of the key and the address.
  planSignIn: PlanSignInView;
  // State lives upstream in the page shell (rule 21): this reports intent, it does
  // not hold anything.
  onChange: (patch: Partial<ProviderDraft>) => void;
  onRemove: () => void;
  onSave: () => void;
  onTestModel: (model: string) => void;
  onSignIn: () => void;
};

const KIND_OPTIONS: readonly { readonly value: ProviderDraft['kind']; readonly label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI compatible' },
  { value: 'claude-plan', label: 'Claude plan' },
];

const kindOf = (value: string): ProviderDraft['kind'] => KIND_OPTIONS.find((option) => option.value === value)?.value ?? 'anthropic';

const toneStyles: Record<PlanSignInView['tone'], string> = {
  good: 'text-success',
  muted: 'text-ink-muted',
  bad: 'text-danger',
};

type KeyFieldsProps = { draft: ProviderDraft; onChange: ProviderFormProps['onChange'] };

const KeyFields: FC<KeyFieldsProps> = ({ draft, onChange }) => (
  <>
    <Field
      label={draft.kind === 'openai' ? 'Base URL (required)' : 'Base URL (optional)'}
      htmlFor={`${draft.rowId}-baseUrl`}
      hint={draft.kind === 'openai' ? 'An OpenAI-compatible endpoint, for example http://127.0.0.1:1234/v1' : 'Leave blank to use the real Anthropic API.'}
    >
      <TextInput id={`${draft.rowId}-baseUrl`} value={draft.baseUrl} placeholder="https://api.anthropic.com" onChange={(e) => onChange({ baseUrl: e.target.value })} />
    </Field>

    <Field label="API key" htmlFor={`${draft.rowId}-apiKey`} hint="Encrypted and stored only on your device.">
      <TextInput id={`${draft.rowId}-apiKey`} type="password" value={draft.apiKey} placeholder="sk-…" autoComplete="off" onChange={(e) => onChange({ apiKey: e.target.value })} />
    </Field>
  </>
);

type PlanSignInProps = { view: PlanSignInView; onSignIn: () => void };

const PlanSignIn: FC<PlanSignInProps> = ({ view, onSignIn }) => (
  <div className="flex flex-col gap-y-1.5">
    <span className="text-xs font-medium text-ink-muted">Sign-in</span>
    <div className="flex items-center justify-between gap-x-3">
      <p role="status" className={`min-w-0 text-sm ${toneStyles[view.tone]}`}>
        {view.line}
      </p>
      <div className="shrink-0">
        <Button variant="secondary" disabled={view.isBusy} onClick={onSignIn}>
          {view.buttonLabel}
        </Button>
      </div>
    </div>
    <p className="text-xs text-ink-muted">
      Uses your Claude subscription: Pro, Max, Team or Enterprise. You sign in on claude.ai in your browser, and the sign-in stays with Claude Code in your Mac&apos;s keychain.
      This app never stores it.
    </p>
  </div>
);

export const ProviderForm: FC<ProviderFormProps> = ({ draft, modelTests, planSignIn, onChange, onRemove, onSave, onTestModel, onSignIn }) => (
  <section className="flex flex-col gap-y-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name" htmlFor={`${draft.rowId}-label`}>
        <TextInput id={`${draft.rowId}-label`} value={draft.label} placeholder="Anthropic" onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Kind" htmlFor={`${draft.rowId}-kind`}>
        <Select id={`${draft.rowId}-kind`} value={draft.kind} options={KIND_OPTIONS} onChange={(e) => onChange({ kind: kindOf(e.target.value) })} />
      </Field>
    </div>

    {draft.kind === 'claude-plan' ? <PlanSignIn view={planSignIn} onSignIn={onSignIn} /> : <KeyFields draft={draft} onChange={onChange} />}

    <div className="flex flex-col gap-y-1.5">
      <span className="text-xs font-medium text-ink-muted">Models</span>
      <ModelList
        models={draft.modelIds}
        {...(modelTests === undefined ? {} : { tests: modelTests })}
        onChange={(models) => onChange({ modelIds: models })}
        // A plan model has no Test: there is no key to try it with.
        {...(draft.kind === 'claude-plan' ? {} : { onTest: onTestModel })}
      />
    </div>

    <div className="flex justify-end gap-x-2">
      <Button variant="danger" onClick={onRemove}>
        Remove provider
      </Button>
      <Button onClick={onSave}>Save</Button>
    </div>
  </section>
);

ProviderForm.displayName = 'ProviderForm';
