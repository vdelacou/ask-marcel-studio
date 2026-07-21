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
  readonly kind: 'anthropic' | 'openai';
  readonly label: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelIds: readonly string[];
};

export type ProviderFormProps = {
  draft: ProviderDraft;
  // What the last Test said about each model, keyed by name.
  modelTests?: Readonly<Record<string, ModelTestRow>>;
  // State lives upstream in the page shell (rule 21): this reports intent, it does
  // not hold anything.
  onChange: (patch: Partial<ProviderDraft>) => void;
  onRemove: () => void;
  onSave: () => void;
  onTestModel: (model: string) => void;
};

const KIND_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI compatible' },
];

export const ProviderForm: FC<ProviderFormProps> = ({ draft, modelTests, onChange, onRemove, onSave, onTestModel }) => (
  <section className="flex flex-col gap-y-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name" htmlFor={`${draft.rowId}-label`}>
        <TextInput id={`${draft.rowId}-label`} value={draft.label} placeholder="Anthropic" onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Kind" htmlFor={`${draft.rowId}-kind`}>
        <Select id={`${draft.rowId}-kind`} value={draft.kind} options={KIND_OPTIONS} onChange={(e) => onChange({ kind: e.target.value === 'openai' ? 'openai' : 'anthropic' })} />
      </Field>
    </div>

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

    <div className="flex flex-col gap-y-1.5">
      <span className="text-xs font-medium text-ink-muted">Models</span>
      <ModelList models={draft.modelIds} {...(modelTests === undefined ? {} : { tests: modelTests })} onChange={(models) => onChange({ modelIds: models })} onTest={onTestModel} />
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
