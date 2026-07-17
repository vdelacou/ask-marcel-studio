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
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import type { Provider, Settings } from '../../../shared/types.ts';

// A key for React's list reconciliation, not a domain id. The provider's own id is
// user-editable and starts blank, so it cannot identify a row while being typed.
const newRowId = (): string => crypto.randomUUID();

export const emptyDraft = (): ProviderDraft => ({
  rowId: newRowId(),
  id: '',
  kind: 'anthropic',
  label: '',
  baseUrl: '',
  apiKey: '',
  modelIds: '',
});

const toDraft = (provider: Provider): ProviderDraft => ({
  rowId: newRowId(),
  id: provider.id,
  kind: provider.kind,
  label: provider.label,
  // An absent baseUrl must render as an empty field, never as the string 'undefined'.
  baseUrl: provider.baseUrl ?? '',
  apiKey: provider.apiKey,
  modelIds: provider.modelIds.join(', '),
});

export const settingsToDrafts = (settings: Settings): readonly ProviderDraft[] => settings.providers.map(toDraft);

const splitModelIds = (line: string): string[] =>
  line
    .split(',')
    .map((m) => m.trim())
    // A trailing comma is what a half-finished list looks like; it is not a blank model.
    .filter((m) => m.length > 0);

const toProvider = (draft: ProviderDraft): Provider => {
  const baseUrl = draft.baseUrl.trim();
  const common = {
    id: draft.id.trim(),
    label: draft.label.trim(),
    // Trimmed because a pasted key routinely carries a trailing newline, which would
    // otherwise be encrypted and sent to the provider verbatim.
    apiKey: draft.apiKey.trim(),
    modelIds: splitModelIds(draft.modelIds),
  };
  if (draft.kind === 'openai') return { ...common, kind: 'openai', baseUrl };
  // Omitted, not blank: settings-doc distinguishes an absent baseUrl (use the real
  // Anthropic API) from a present empty one (a mistake).
  return { ...common, kind: 'anthropic', ...(baseUrl.length === 0 ? {} : { baseUrl }) };
};

export const draftsToSettings = (drafts: readonly ProviderDraft[], defaultModel?: string): Settings => ({
  providers: drafts.map(toProvider),
  ...(defaultModel === undefined ? {} : { defaultModel }),
});
