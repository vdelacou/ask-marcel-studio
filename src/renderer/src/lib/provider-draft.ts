/*
 * Converting between what the settings screen edits and what main stores.
 *
 * Lives in lib, not in a component: rule 21 makes the design system prop-pure, so
 * every transform belongs on this side of the wall. It is also the only part of the
 * settings screen worth a test, which is why it is a module and not a closure inside
 * the page shell.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { assignProviderIds } from '../../../shared/provider-id.ts';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import type { OfficePolicy, Provider, Settings } from '../../../shared/types.ts';

// A key for React's list reconciliation, not a domain id. A provider's real id is
// generated from its label at save time (provider-id.ts), never typed, so a draft has
// nothing to identify a row by while it is being edited.
const newRowId = (): string => crypto.randomUUID();

export const emptyDraft = (): ProviderDraft => ({
  rowId: newRowId(),
  id: '',
  kind: 'anthropic',
  label: '',
  baseUrl: '',
  apiKey: '',
  modelIds: [],
});

const toDraft = (provider: Provider): ProviderDraft => ({
  rowId: newRowId(),
  id: provider.id,
  kind: provider.kind,
  label: provider.label,
  // An absent baseUrl must render as an empty field, never as the string 'undefined'.
  baseUrl: provider.baseUrl ?? '',
  apiKey: provider.apiKey,
  modelIds: [...provider.modelIds],
});

export const settingsToDrafts = (settings: Settings): readonly ProviderDraft[] => settings.providers.map(toDraft);

const toProvider = (draft: ProviderDraft): Provider => {
  const baseUrl = draft.baseUrl.trim();
  const common = {
    id: draft.id.trim(),
    label: draft.label.trim(),
    // Trimmed because a pasted key routinely carries a trailing newline, which would
    // otherwise be encrypted and sent to the provider verbatim.
    apiKey: draft.apiKey.trim(),
    // Trim each model and drop the blank rows an in-progress edit leaves behind.
    modelIds: draft.modelIds.map((m) => m.trim()).filter((m) => m.length > 0),
  };
  if (draft.kind === 'openai') return { ...common, kind: 'openai', baseUrl };
  // Omitted, not blank: settings-doc distinguishes an absent baseUrl (use the real
  // Anthropic API) from a present empty one (a mistake).
  return { ...common, kind: 'anthropic', ...(baseUrl.length === 0 ? {} : { baseUrl }) };
};

// The whole settings document is saved at once, so everything the screen holds has to
// ride along: what is not passed is what gets erased.
export const draftsToSettings = (drafts: readonly ProviderDraft[], defaultModel?: string, officePolicy?: OfficePolicy): Settings => ({
  // assignProviderIds fills the id of any new provider (blank) from its label and keeps
  // every existing id untouched, so a saved provider's id never shifts under it.
  providers: assignProviderIds(drafts.map(toProvider)),
  ...(defaultModel === undefined ? {} : { defaultModel }),
  ...(officePolicy === undefined ? {} : { officePolicy }),
});
