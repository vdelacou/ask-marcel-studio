import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Field } from '../../atoms/field/index.tsx';
import { Select } from '../../atoms/select/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';

// What one provider looks like while it is being edited. Everything is a string
// because that is what an <input> holds: modelIds is a comma-separated line here
// and only becomes an array when the page shell saves it. Keeping the half-typed
// state as text is what lets the user type a comma without the field fighting back.
export type ProviderDraft = {
  readonly rowId: string;
  readonly id: string;
  readonly kind: 'anthropic' | 'openai';
  readonly label: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelIds: string;
};

export type ProviderFormProps = {
  draft: ProviderDraft;
  // State lives upstream in the page shell (rule 21): this reports intent, it does
  // not hold anything.
  onChange: (patch: Partial<ProviderDraft>) => void;
  onRemove: () => void;
};

const KIND_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI compatible' },
];

export const ProviderForm: FC<ProviderFormProps> = ({ draft, onChange, onRemove }) => (
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

    <Field label="API key" htmlFor={`${draft.rowId}-apiKey`} hint="Encrypted with your OS keychain before it is written to disk.">
      <TextInput id={`${draft.rowId}-apiKey`} type="password" value={draft.apiKey} placeholder="sk-…" autoComplete="off" onChange={(e) => onChange({ apiKey: e.target.value })} />
    </Field>

    <Field label="Models" htmlFor={`${draft.rowId}-models`} hint="Comma separated.">
      <TextInput id={`${draft.rowId}-models`} value={draft.modelIds} placeholder="claude-opus-4-8, claude-sonnet-5" onChange={(e) => onChange({ modelIds: e.target.value })} />
    </Field>

    <div className="flex justify-end">
      <Button variant="danger" onClick={onRemove}>
        Remove provider
      </Button>
    </div>
  </section>
);

ProviderForm.displayName = 'ProviderForm';
