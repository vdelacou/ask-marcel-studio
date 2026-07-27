/*
 * The settings document: pure parse, validate and serialise. No electron, no IO.
 *
 * Two entry points because there are two shapes and two trust stories:
 *
 *   parseStoredSettings  what is on disk (sealed keys). The file can be corrupt,
 *                        hand-edited, or written by an older build, so nothing
 *                        about it is assumed.
 *   validateSettings     what the renderer sent over IPC (plaintext keys). Main
 *                        is the server side here; renderer checks are only UX.
 *
 * They validate different shapes under different rules, so the structural overlap
 * stays duplicated rather than abstracted (Rule of Three).
 */
import { MODEL_REF_SEPARATOR } from './model-ref.ts';
import { ALWAYS_ENABLED_CATEGORY } from './office-policy.ts';
import type { OfficePolicy, Provider, Settings, SkillsPolicy, StoredProvider, StoredSettings } from './types.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type SettingsDocError =
  // The file on disk is not what this app writes.
  | { readonly kind: 'unreadable'; readonly message: string }
  // The user asked for something the app cannot store.
  | { readonly kind: 'invalid'; readonly message: string };

export const EMPTY_STORED_SETTINGS: StoredSettings = { providers: [] };

const unreadable = (message: string): Result<never, SettingsDocError> => err({ kind: 'unreadable', message });
const invalid = (message: string): Result<never, SettingsDocError> => err({ kind: 'invalid', message });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((m) => typeof m === 'string');
const isSealed = (v: unknown): boolean => isRecord(v) && typeof v['enc'] === 'string';

// URL.parse returns null instead of throwing, so this needs no try/catch at all.
// The protocol check is the point: 'file:///etc/passwd' is a perfectly valid URL,
// and without it a provider could aim the gateway at the filesystem.
const isHttpUrl = (value: string): boolean => {
  const url = URL.parse(value);
  return url !== null && (url.protocol === 'http:' || url.protocol === 'https:');
};

// Shared by both entry points because the shape and the rule are the same on disk and
// over IPC: a list of category names, normalised so the file does not churn. Unknown
// names are kept rather than rejected — a category can disappear in a CLI downgrade
// and come back, and dropping it would silently switch it on.
const officePolicyField = (raw: unknown): Result<OfficePolicy | undefined, string> => {
  if (raw === undefined) return ok(undefined);
  if (!isRecord(raw)) return err('officePolicy must be an object');
  const disabled = raw['disabledCategories'];
  if (!isStringArray(disabled)) return err('officePolicy.disabledCategories must be an array of strings');

  const names = disabled.map((name) => name.trim()).filter((name) => name.length > 0 && name !== ALWAYS_ENABLED_CATEGORY);
  return ok({ disabledCategories: [...new Set(names)].sort((a, b) => a.localeCompare(b)) });
};

const skillsPolicyField = (raw: unknown): Result<SkillsPolicy | undefined, string> => {
  if (raw === undefined) return ok(undefined);
  if (!isRecord(raw)) return err('skillsPolicy must be an object');
  const disabled = raw['disabledFolders'];
  if (!isStringArray(disabled)) return err('skillsPolicy.disabledFolders must be an array of strings');

  const folders = disabled.map((folder) => folder.trim()).filter((folder) => folder.length > 0);
  return ok({ disabledFolders: [...new Set(folders)].sort((a, b) => a.localeCompare(b)) });
};

// Fields shared by both shapes. Returns the common part or a reason.
const commonProviderFields = (raw: unknown): Result<{ id: string; kind: 'anthropic' | 'openai'; label: string; modelIds: string[]; baseUrl?: string }, SettingsDocError> => {
  if (!isRecord(raw)) return unreadable('provider must be an object');
  const { id, kind, label, modelIds, baseUrl } = raw;
  if (typeof id !== 'string' || id.length === 0) return unreadable('provider id must be a non-empty string');
  if (kind !== 'anthropic' && kind !== 'openai') return unreadable(`provider kind must be anthropic or openai, got ${String(kind)}`);
  if (typeof label !== 'string' || label.length === 0) return unreadable('provider label must be a non-empty string');
  if (!isStringArray(modelIds)) return unreadable('provider modelIds must be an array of strings');
  if (baseUrl !== undefined && typeof baseUrl !== 'string') return unreadable('provider baseUrl must be a string');
  // openai has no default endpoint to fall back on, so its baseUrl is required.
  if (kind === 'openai' && (baseUrl === undefined || baseUrl.length === 0)) return unreadable('an openai provider needs a baseUrl');
  return ok({ id, kind, label, modelIds, ...(baseUrl === undefined ? {} : { baseUrl }) });
};

const parseStoredProvider = (raw: unknown): Result<StoredProvider, SettingsDocError> => {
  const common = commonProviderFields(raw);
  if (!common.ok) return common;
  const apiKey = isRecord(raw) ? raw['apiKey'] : undefined;
  // A plain string here means someone pasted a raw key over the sealed envelope.
  if (!isSealed(apiKey)) return unreadable('provider apiKey must be a sealed { enc } envelope');
  return ok({ ...common.value, apiKey: apiKey as StoredProvider['apiKey'] } as StoredProvider);
};

export const parseStoredSettings = (raw: unknown): Result<StoredSettings, SettingsDocError> => {
  if (!isRecord(raw)) return unreadable('settings must be an object');
  if (!Array.isArray(raw['providers'])) return unreadable('settings must have a providers array');
  const defaultModel = raw['defaultModel'];
  if (defaultModel !== undefined && typeof defaultModel !== 'string') return unreadable('defaultModel must be a string');
  const officePolicy = officePolicyField(raw['officePolicy']);
  if (!officePolicy.ok) return unreadable(officePolicy.error);
  const skillsPolicy = skillsPolicyField(raw['skillsPolicy']);
  if (!skillsPolicy.ok) return unreadable(skillsPolicy.error);

  const providers: StoredProvider[] = [];
  for (const candidate of raw['providers']) {
    const provider = parseStoredProvider(candidate);
    if (!provider.ok) return provider;
    providers.push(provider.value);
  }
  return ok({
    providers,
    ...(defaultModel === undefined ? {} : { defaultModel }),
    ...(officePolicy.value === undefined ? {} : { officePolicy: officePolicy.value }),
    ...(skillsPolicy.value === undefined ? {} : { skillsPolicy: skillsPolicy.value }),
  });
};

const validateProvider = (raw: unknown): Result<Provider, SettingsDocError> => {
  const common = commonProviderFields(raw);
  if (!common.ok) return invalid(common.error.message);
  const { id, baseUrl } = common.value;
  // 'a::b' would parse back as provider 'a' + model 'b', so a provider whose id
  // contains the separator could never be addressed by a model reference.
  if (id.includes(MODEL_REF_SEPARATOR)) return invalid(`provider id cannot contain '${MODEL_REF_SEPARATOR}': ${id}`);
  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) return invalid(`provider baseUrl must be an http(s) url: ${baseUrl}`);

  const apiKey = isRecord(raw) ? raw['apiKey'] : undefined;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) return invalid(`provider ${id} needs an api key`);
  // Store the TRIMMED key, not the raw one. A pasted key routinely carries a
  // trailing newline; encrypting it verbatim sends the whitespace to the provider
  // and returns a 401 that looks like a bad key. The renderer trims too, but main
  // is the authoritative validator and must not depend on the caller having done it.
  return ok({ ...common.value, apiKey: apiKey.trim() } as Provider);
};

export const validateSettings = (raw: unknown): Result<Settings, SettingsDocError> => {
  if (!isRecord(raw)) return invalid('settings must be an object');
  if (!Array.isArray(raw['providers'])) return invalid('settings must have a providers array');
  const defaultModel = raw['defaultModel'];
  if (defaultModel !== undefined && typeof defaultModel !== 'string') return invalid('defaultModel must be a string');
  const officePolicy = officePolicyField(raw['officePolicy']);
  if (!officePolicy.ok) return invalid(officePolicy.error);
  const skillsPolicy = skillsPolicyField(raw['skillsPolicy']);
  if (!skillsPolicy.ok) return invalid(skillsPolicy.error);

  const providers: Provider[] = [];
  for (const candidate of raw['providers']) {
    const provider = validateProvider(candidate);
    if (!provider.ok) return provider;
    if (providers.some((p) => p.id === provider.value.id)) return invalid(`two providers share the id ${provider.value.id}`);
    providers.push(provider.value);
  }
  return ok({
    providers,
    ...(defaultModel === undefined ? {} : { defaultModel }),
    ...(officePolicy.value === undefined ? {} : { officePolicy: officePolicy.value }),
    ...(skillsPolicy.value === undefined ? {} : { skillsPolicy: skillsPolicy.value }),
  });
};

export const serialiseStoredSettings = (settings: StoredSettings): string => JSON.stringify(settings, null, 2);
