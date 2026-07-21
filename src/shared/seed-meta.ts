/*
 * What the app last seeded into each built-in skill folder.
 *
 * Built-in skills used to be re-copied on every launch, which meant editing one was
 * pointless: the next start silently undid it. Remembering the hash of what was last
 * written tells the two cases apart. Untouched since the last seed means a new app
 * version may safely replace it; changed means the user changed it, and their version
 * stays until they ask for the original back.
 *
 * Tolerant on the way in: this file is a convenience, not a source of truth, so a
 * corrupt one degrades to "nothing known" rather than blocking a launch.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

// Folder name to the sha256 of the SKILL.md the app wrote there.
export type SeedMeta = Readonly<Record<string, string>>;

export const EMPTY_SEED_META: SeedMeta = {};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseSeedMeta = (raw: unknown): SeedMeta => {
  if (!isRecord(raw)) return EMPTY_SEED_META;
  const entries = Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
  return Object.fromEntries(entries);
};

export const serialiseSeedMeta = (meta: SeedMeta): string => JSON.stringify(meta, null, 2);

export const rememberSeed = (meta: SeedMeta, folder: string, hash: string): SeedMeta => ({ ...meta, [folder]: hash });

// Whether what is on disk is still what the app put there. An unknown folder is not
// modified: it predates this bookkeeping, and treating it as edited would freeze it
// against every future update.
export const isSeededContent = (meta: SeedMeta, folder: string, hash: string): boolean => meta[folder] === hash;

export const hasSeedRecord = (meta: SeedMeta, folder: string): boolean => meta[folder] !== undefined;
