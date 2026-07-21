/*
 * The settings store: the IO shell around src/shared/settings-doc.ts.
 *
 * This is the ONLY place that knows api keys are encrypted. The pure core moves
 * sealed envelopes around without ever seeing a plaintext key, which is what keeps
 * safeStorage (and electron) out of src/shared/** and out of the 100% coverage tier.
 * See .claude/LESSONS.md ([decision] provider API keys are encrypted at rest).
 *
 * Read path:  bytes -> parseStoredSettings -> unseal -> Settings
 * Write path: Settings -> validateSettings -> seal -> serialise -> atomic write
 *
 * Sealing on the way in and unsealing on the way out means a leaked settings.json
 * carries no usable key. It does NOT defend against code running as the user, which
 * can ask safeStorage to unseal too; that is not what it is for.
 */
import { safeStorage } from 'electron';
import { EMPTY_STORED_SETTINGS, parseStoredSettings, serialiseStoredSettings, validateSettings } from '../../../shared/settings-doc.ts';
import { settingsFilePath } from '../../../shared/paths.ts';
import { readJsonFile, writeJsonFileAtomic } from './json-file.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { StoreError } from '../../../shared/ipc-contract.ts';
import type { Provider, SealedSecret, Settings, StoredProvider, StoredSettings } from '../../../shared/types.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

// The two dependencies this store reads from the world. Parameterised rather than
// imported as globals so the wiring stays explicit at the composition root.
export type SettingsStoreDeps = {
  readonly userData: string;
};

export type SettingsStore = {
  readonly get: () => Promise<Result<Settings, StoreError>>;
  readonly save: (candidate: unknown) => Promise<Result<Settings, StoreError>>;
};

const seal = (plaintext: string): Result<SealedSecret, StoreError> => {
  // False on a Linux box with no keyring, or a broken macOS keychain. Fail loudly
  // rather than silently writing the key in plaintext, which is the whole point.
  if (!safeStorage.isEncryptionAvailable()) {
    return err({ kind: 'no-encryption', message: 'no OS keychain is available, so the api key cannot be stored safely' });
  }
  try {
    return ok({ enc: safeStorage.encryptString(plaintext).toString('base64') });
  } catch (e) {
    return err({ kind: 'no-encryption', message: `could not encrypt the api key: ${formatError(e)}` });
  }
};

const unseal = (sealed: SealedSecret): Result<string, StoreError> => {
  if (!safeStorage.isEncryptionAvailable()) {
    return err({ kind: 'no-encryption', message: 'no OS keychain is available, so the stored api key cannot be read' });
  }
  try {
    return ok(safeStorage.decryptString(Buffer.from(sealed.enc, 'base64')));
  } catch (e) {
    // Wrong machine, wrong user, or a rotated keychain entry: the envelope is
    // intact but no longer ours to open.
    return err({ kind: 'no-encryption', message: `the stored api key could not be decrypted: ${formatError(e)}` });
  }
};

const unsealProvider = (stored: StoredProvider): Result<Provider, StoreError> => {
  const plaintext = unseal(stored.apiKey);
  if (!plaintext.ok) return plaintext;
  return ok({ ...stored, apiKey: plaintext.value });
};

const sealProvider = (provider: Provider): Result<StoredProvider, StoreError> => {
  const sealed = seal(provider.apiKey);
  if (!sealed.ok) return sealed;
  return ok({ ...provider, apiKey: sealed.value });
};

const unsealAll = (stored: StoredSettings): Result<Settings, StoreError> => {
  const providers: Provider[] = [];
  for (const provider of stored.providers) {
    const opened = unsealProvider(provider);
    if (!opened.ok) return opened;
    providers.push(opened.value);
  }
  return ok({
    providers,
    ...(stored.defaultModel === undefined ? {} : { defaultModel: stored.defaultModel }),
    ...(stored.officePolicy === undefined ? {} : { officePolicy: stored.officePolicy }),
  });
};

const sealAll = (settings: Settings): Result<StoredSettings, StoreError> => {
  const providers: StoredProvider[] = [];
  for (const provider of settings.providers) {
    const closed = sealProvider(provider);
    if (!closed.ok) return closed;
    providers.push(closed.value);
  }
  return ok({
    providers,
    ...(settings.defaultModel === undefined ? {} : { defaultModel: settings.defaultModel }),
    ...(settings.officePolicy === undefined ? {} : { officePolicy: settings.officePolicy }),
  });
};

export const createSettingsStore = (deps: SettingsStoreDeps): SettingsStore => {
  const path = settingsFilePath(deps.userData);

  const get = async (): Promise<Result<Settings, StoreError>> => {
    const raw = await readJsonFile(path);
    // First launch: no file yet is the normal empty state, not an error.
    if (!raw.ok && raw.error.kind === 'not-found') return unsealAll(EMPTY_STORED_SETTINGS);
    if (!raw.ok) return err({ kind: 'unreadable', message: raw.error.message });

    const parsed = parseStoredSettings(raw.value);
    if (!parsed.ok) return err({ kind: 'unreadable', message: parsed.error.message });
    return unsealAll(parsed.value);
  };

  const save = async (candidate: unknown): Promise<Result<Settings, StoreError>> => {
    // Validate BEFORE sealing: never spend a keychain round-trip on input the
    // user has to fix anyway, and never write a half-valid file.
    const validated = validateSettings(candidate);
    if (!validated.ok) return err({ kind: validated.error.kind, message: validated.error.message });

    const sealed = sealAll(validated.value);
    if (!sealed.ok) return sealed;

    const written = await writeJsonFileAtomic(path, serialiseStoredSettings(sealed.value));
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(validated.value);
  };

  return { get, save };
};
