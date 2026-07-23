/*
 * The filesystem half of the account split: listing account folders, and the two moves
 * that only ever happen once each (an installation from before accounts existed, and a
 * signed-out folder claimed by its first sign-in).
 *
 * node:fs directly, as everywhere else in main: Bun's file API has no directory
 * primitives, and this file is nothing but directory work (the rule 20 boundary case).
 */
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parseAccountKey } from '../../../shared/account-key.ts';
import type { AccountKey } from '../../../shared/account-key.ts';
import { parseCurrentAccount, serialiseCurrentAccount } from '../../../shared/current-account.ts';
import type { CurrentAccount } from '../../../shared/current-account.ts';
import { parseStoredQuickContext } from '../../../shared/quick-context.ts';
import type { QuickContext } from '../../../shared/quick-context.ts';
import { accountDir, accountsDir, currentAccountPath, quickContextFilePath } from '../../../shared/paths.ts';
import { readJsonFile, writeJsonFileAtomic } from '../store/json-file.ts';
import type { AccountFs } from './account-service.ts';

// What an installation from before this change has at the top of its data folder. Moving
// these is the whole migration; anything else up there is shared and stays.
const LEGACY_DIRS = ['conversations', 'workspaces', 'claude-config', 'memory', 'background-workspace'] as const;

const exists = (path: string): boolean => {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
};

const moveIfPresent = (from: string, to: string): void => {
  if (!exists(from)) return;
  try {
    renameSync(from, to);
  } catch {
    // A folder that cannot be moved is left where it is rather than half-copied: the app
    // then opens an empty account, which is recoverable by hand, while a half-move is not.
  }
};

export const createAccountFs = (userData: string): AccountFs => ({
  listAccounts: () => {
    try {
      return Promise.resolve(
        readdirSync(accountsDir(userData), { withFileTypes: true }).flatMap((entry) => {
          const key = entry.isDirectory() ? parseAccountKey(entry.name) : undefined;
          return key === undefined ? [] : [key];
        })
      );
    } catch {
      return Promise.resolve([]);
    }
  },

  hasLegacyLayout: () => Promise.resolve(LEGACY_DIRS.some((name) => exists(join(userData, name)))),

  adoptLegacy: (into: AccountKey) => {
    const target = accountDir(userData, into);
    mkdirSync(target, { recursive: true });
    for (const name of LEGACY_DIRS) moveIfPresent(join(userData, name), join(target, name));
    return Promise.resolve();
  },

  renameAccount: (from: AccountKey, to: AccountKey) => {
    mkdirSync(accountsDir(userData), { recursive: true });
    moveIfPresent(accountDir(userData, from), accountDir(userData, to));
    return Promise.resolve();
  },

  readCurrent: async (): Promise<CurrentAccount | undefined> => {
    const read = await readJsonFile(currentAccountPath(userData));
    return read.ok ? parseCurrentAccount(read.value) : undefined;
  },

  writeCurrent: async (account: CurrentAccount): Promise<void> => {
    await writeJsonFileAtomic(currentAccountPath(userData), serialiseCurrentAccount(account));
  },

  // `undefined` means the pre-account layout, where claude-config sat at the top.
  readQuickContextIn: async (account: AccountKey | undefined): Promise<QuickContext | undefined> => {
    const root = account === undefined ? userData : accountDir(userData, account);
    const read = await readJsonFile(quickContextFilePath(root));
    return read.ok ? parseStoredQuickContext(read.value)?.context : undefined;
  },
});
